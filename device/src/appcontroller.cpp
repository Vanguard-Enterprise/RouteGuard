#include "appcontroller.h"
#include "build_config.h"

#include <QDateTime>
#include <QDebug>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonObject>
#include <QSet>
#include <QUuid>
#include <array>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <thread>
#include <utility>
#include <vector>

#ifdef Q_OS_LINUX
#include <alsa/asoundlib.h>
#endif

namespace {

#ifdef Q_OS_LINUX
std::atomic_bool s_failureTonePlaying {false};

bool writeToneToDevice(const char *deviceName) {
    constexpr unsigned int sampleRate = 48000;
    constexpr double frequencyHz = 740.0;
    constexpr double durationSeconds = 0.22;
    constexpr double amplitude = 0.24;
    constexpr std::size_t fadeSamples = 2400;

    snd_pcm_t *pcm = nullptr;
    if (snd_pcm_open(&pcm, deviceName, SND_PCM_STREAM_PLAYBACK, 0) < 0) {
        return false;
    }

    const int configureResult = snd_pcm_set_params(
        pcm,
        SND_PCM_FORMAT_S16_LE,
        SND_PCM_ACCESS_RW_INTERLEAVED,
        1,
        sampleRate,
        1,
        250000
    );
    if (configureResult < 0) {
        snd_pcm_close(pcm);
        return false;
    }

    const std::size_t frameCount = static_cast<std::size_t>(sampleRate * durationSeconds);
    std::vector<int16_t> samples(frameCount);
    constexpr double twoPi = 6.28318530717958647692;

    for (std::size_t index = 0; index < frameCount; ++index) {
        double envelope = 1.0;
        if (index >= frameCount - fadeSamples) {
            envelope = static_cast<double>(frameCount - index) / static_cast<double>(fadeSamples);
        }

        const double radians = twoPi * frequencyHz * static_cast<double>(index) / static_cast<double>(sampleRate);
        const double value = std::sin(radians) * amplitude * envelope;
        samples[index] = static_cast<int16_t>(value * 32767.0);
    }

    std::size_t offset = 0;
    while (offset < samples.size()) {
        const snd_pcm_sframes_t written = snd_pcm_writei(pcm, samples.data() + offset, samples.size() - offset);
        if (written < 0) {
            if (written == -EPIPE) {
                snd_pcm_prepare(pcm);
                continue;
            }
            snd_pcm_close(pcm);
            return false;
        }
        offset += static_cast<std::size_t>(written);
    }

    snd_pcm_drain(pcm);
    snd_pcm_close(pcm);
    return true;
}
#endif

} // namespace

AppController::AppController(QObject *parent)
    : QObject(parent), m_sync(&m_store, this), m_settings("RouteGuard", "RouteGuard Bus") {
    m_appVersion = QStringLiteral(ROUTEGUARD_BUILD_VERSION);
    m_deviceId = resolveSystemDeviceId();

    connect(&m_sync, &SyncManager::bootstrapReady, this, [this](const QString &status, const QString &code, const QString &expiresAt) {
        if (!code.isEmpty()) {
            m_enrollmentCode = code;
        }
        if (!expiresAt.isEmpty()) {
            m_enrollmentExpires = expiresAt;
        }
        if (status == "enrolled" && !storedToken().isEmpty()) {
            enterOperationalMode();
        } else if (m_enrollmentRequired) {
            emit enrollmentStateChanged();
        }
    });
    connect(&m_sync, &SyncManager::deviceTokenIssued, this, [this](const QString &token) {
        persistToken(token);
        m_sync.setDeviceToken(token);
        enterOperationalMode();
    });
    connect(&m_sync, &SyncManager::authRejected, this, [this]() {
        persistToken(QString());
        logoutDriver();
        enterEnrollmentMode();
    });
    connect(&m_sync, &SyncManager::syncComplete, this, [this](int) {
        m_lastSync = QDateTime::currentDateTime().toString("yyyy-MM-dd hh:mm:ss");
        emit lastSyncChanged();
        updatePendingCount();
    });
    connect(&m_sync, &SyncManager::syncFailed, this, [this](const QString &) {
        m_connectivityStatus = "offline";
        emit connectivityStatusChanged();
    });
    connect(&m_sync, &SyncManager::checkInComplete, this, [this](const QString &) {
        m_connectivityStatus = "online";
        emit connectivityStatusChanged();
    });
    connect(&m_sync, &SyncManager::checkInFailed, this, [this](const QString &) {
        m_connectivityStatus = "offline";
        emit connectivityStatusChanged();
    });
    connect(&m_sync, &SyncManager::driverLoginSucceeded, this, [this](const QString &id, const QString &driverId, const QString &name) {
        m_activeDriverRecordId = id;
        m_activeDriverCode = driverId;
        m_activeDriver = name;
        m_driverLoginPending = false;
        m_driverLoginError.clear();
        emit activeDriverChanged();
        emit driverSessionChanged();
        emit driverLoginStateChanged();
    });
    connect(&m_sync, &SyncManager::driverLoginFailed, this, [this](const QString &message) {
        m_driverLoginPending = false;
        m_driverLoginError = message;
        if (message.contains(QStringLiteral("invalid driver pin"), Qt::CaseInsensitive)) {
            playFailureTone();
        }
        emit driverLoginStateChanged();
    });

    m_enrollmentCodeTimer.setInterval(60000);
    connect(&m_enrollmentCodeTimer, &QTimer::timeout, this, [this]() {
        m_sync.refreshEnrollmentCode();
    });

    m_enrollmentPollTimer.setInterval(5000);
    connect(&m_enrollmentPollTimer, &QTimer::timeout, this, [this]() {
        if (!m_enrollmentCode.isEmpty()) {
            m_sync.pollEnrollmentStatus(m_enrollmentCode);
        }
    });

    m_checkInTimer.setInterval(30000);
    connect(&m_checkInTimer, &QTimer::timeout, this, [this]() {
        m_sync.sendCheckIn(m_connectivityStatus, "healthy");
    });

    m_syncTimer.setInterval(10000);
    connect(&m_syncTimer, &QTimer::timeout, this, [this]() {
        m_sync.syncPending(m_routeId);
    });
}

bool AppController::enrollmentRequired() const { return m_enrollmentRequired; }
QString AppController::enrollmentCode() const { return m_enrollmentCode; }
QString AppController::enrollmentExpires() const { return m_enrollmentExpires; }
QString AppController::connectivityStatus() const { return m_connectivityStatus; }
int AppController::syncPendingCount() const { return m_syncPendingCount; }
QString AppController::activeDriver() const { return m_activeDriver; }
bool AppController::driverAuthenticated() const { return !m_activeDriverRecordId.isEmpty(); }
bool AppController::driverLoginPending() const { return m_driverLoginPending; }
QString AppController::driverLoginError() const { return m_driverLoginError; }
QString AppController::routeCode() const { return m_routeCode; }
QString AppController::lastScan() const { return m_lastScan; }
QString AppController::lastSync() const { return m_lastSync; }
QString AppController::appVersion() const { return m_appVersion; }
QString AppController::deviceId() const { return m_deviceId; }
QString AppController::fatalError() const { return m_fatalError; }
bool AppController::settingsVisible() const { return m_settingsVisible; }
QVariantList AppController::availableRfidDevices() const { return m_availableRfidDevices; }
QString AppController::selectedRfidDevicePath() const { return m_selectedRfidDevicePath; }
QString AppController::selectedRfidDeviceLabel() const { return m_selectedRfidDeviceLabel; }

void AppController::initialize() {
    m_store.initialize();
    updatePendingCount();
    refreshRfidDevices();
    restoreSelectedRfidDevice();

    if (m_deviceId.isEmpty()) {
        return;
    }

    m_sync.configure(m_deviceId, m_appVersion);

    const QString token = storedToken();
    if (!token.isEmpty()) {
        m_sync.setDeviceToken(token);
        enterOperationalMode();
    } else {
        enterEnrollmentMode();
    }
}

void AppController::submitDriverPIN(const QString &pin) {
    if (!m_fatalError.isEmpty() || m_enrollmentRequired || m_driverLoginPending) {
        return;
    }

    const QString normalized = pin.trimmed();
    bool numericOnly = true;
    for (const QChar &character : normalized) {
        if (!character.isDigit()) {
            numericOnly = false;
            break;
        }
    }

    if (normalized.length() != 4 || !numericOnly) {
        m_driverLoginError = QStringLiteral("Enter a 4-digit PIN.");
        emit driverLoginStateChanged();
        return;
    }

    m_driverLoginPending = true;
    m_driverLoginError.clear();
    emit driverLoginStateChanged();
    m_sync.loginDriver(normalized);
}

void AppController::logoutDriver() {
    const bool hadDriverSession = !m_activeDriverRecordId.isEmpty() || !m_activeDriver.isEmpty() || !m_activeDriverCode.isEmpty();
    const bool hadRoute = !m_routeId.isEmpty() || !m_routeCode.isEmpty();

    clearDriverSession();
    m_driverLoginPending = false;
    m_driverLoginError.clear();

    m_routeId.clear();
    m_routeCode.clear();

    if (hadRoute) {
        emit routeCodeChanged();
    }
    if (hadDriverSession) {
        emit driverLoginStateChanged();
    }
}

void AppController::selectRoute(const QString &routeId, const QString &routeCode) {
    if (!driverAuthenticated()) {
        return;
    }
    m_routeId = routeId.trimmed();
    m_routeCode = routeCode.trimmed();
    emit routeCodeChanged();
}

bool AppController::shouldSuppressTag(const QString &tagId) {
    const QDateTime now = QDateTime::currentDateTimeUtc();
    const QDateTime previous = m_recentTags.value(tagId);
    if (previous.isValid() && previous.msecsTo(now) < 3000) {
        return true;
    }
    m_recentTags.insert(tagId, now);
    return false;
}

void AppController::submitTag(const QString &tagId) {
    const QString normalized = tagId.trimmed();
    if (!m_fatalError.isEmpty() || m_enrollmentRequired || !driverAuthenticated() || normalized.isEmpty() || shouldSuppressTag(normalized)) {
        return;
    }

    PendingScanEvent event;
    event.eventUid = QUuid::createUuid().toString(QUuid::WithoutBraces);
    event.studentTag = normalized;
    event.scannedAt = QDateTime::currentDateTimeUtc();
    event.routeId = m_routeId;
    event.metadata = QJsonObject{
        {"driver_record_id", m_activeDriverRecordId},
        {"driver_id", m_activeDriverCode},
        {"driver_name", m_activeDriver},
        {"route_code", m_routeCode},
        {"source", "native_bus_app"}
    };

    if (m_store.enqueueScan(event)) {
        m_lastScan = QString("%1 at %2").arg(normalized, event.scannedAt.toLocalTime().toString("hh:mm:ss"));
        emit lastScanChanged();
        updatePendingCount();
    }
}

void AppController::forceSync() {
    if (!m_fatalError.isEmpty()) {
        return;
    }
    if (m_enrollmentRequired) {
        m_sync.bootstrap();
        return;
    }
    m_sync.sendCheckIn(m_connectivityStatus, "healthy");
    m_sync.syncPending(m_routeId);
}

void AppController::enterEnrollmentMode() {
    m_enrollmentRequired = true;
    m_connectivityStatus = "enrollment";
    clearDriverSession();
    m_driverLoginPending = false;
    m_driverLoginError.clear();
    m_checkInTimer.stop();
    m_syncTimer.stop();
    m_enrollmentCodeTimer.start();
    m_enrollmentPollTimer.start();
    m_sync.bootstrap();
    emit connectivityStatusChanged();
    emit driverLoginStateChanged();
    emit enrollmentStateChanged();
}

void AppController::enterOperationalMode() {
    m_enrollmentRequired = false;
    m_enrollmentCode.clear();
    m_enrollmentExpires.clear();
    m_sync.setDeviceToken(storedToken());
    m_enrollmentCodeTimer.stop();
    m_enrollmentPollTimer.stop();
    m_sync.sendCheckIn("booting", "healthy");
    m_checkInTimer.start();
    m_syncTimer.start();
    emit enrollmentStateChanged();
}

void AppController::openSettings() {
    if (m_settingsVisible) {
        return;
    }
    refreshRfidDevices();
    restoreSelectedRfidDevice();
    m_settingsVisible = true;
    emit settingsVisibleChanged();
}

void AppController::closeSettings() {
    if (!m_settingsVisible) {
        return;
    }
    m_settingsVisible = false;
    emit settingsVisibleChanged();
}

void AppController::refreshRfidDevices() {
    m_availableRfidDevices = discoverRfidDevices();
    emit availableRfidDevicesChanged();
}

void AppController::selectRfidDevice(const QString &devicePath) {
    const QString normalized = devicePath.trimmed();
    QString selectedLabel = QStringLiteral("Not configured");

    if (normalized.isEmpty()) {
        m_settings.remove("rfidDevicePath");
        m_selectedRfidDevicePath.clear();
        m_selectedRfidDeviceLabel = selectedLabel;
        emit selectedRfidDeviceChanged();
        return;
    }

    for (const QVariant &item : std::as_const(m_availableRfidDevices)) {
        const QVariantMap map = item.toMap();
        if (map.value("path").toString() == normalized) {
            selectedLabel = map.value("label").toString();
            break;
        }
    }

    m_settings.setValue("rfidDevicePath", normalized);
    m_selectedRfidDevicePath = normalized;
    m_selectedRfidDeviceLabel = selectedLabel;
    emit selectedRfidDeviceChanged();
}

void AppController::setFatalError(const QString &message) {
    if (m_fatalError == message) {
        return;
    }
    m_fatalError = message;
    m_enrollmentRequired = true;
    m_connectivityStatus = "error";
    m_enrollmentCode.clear();
    m_enrollmentExpires.clear();
    m_enrollmentCodeTimer.stop();
    m_enrollmentPollTimer.stop();
    m_checkInTimer.stop();
    m_syncTimer.stop();
    emit connectivityStatusChanged();
    emit enrollmentStateChanged();
    emit fatalErrorChanged();
}

QString AppController::storedToken() const {
    return m_settings.value("deviceToken").toString();
}

void AppController::persistToken(const QString &token) {
    if (token.isEmpty()) {
        m_settings.remove("deviceToken");
    } else {
        m_settings.setValue("deviceToken", token);
    }
}

QString AppController::resolveSystemDeviceId() {
    QFile machineIdFile(QStringLiteral("/etc/machine-id"));
    if (!machineIdFile.open(QIODevice::ReadOnly | QIODevice::Text)) {
        const QString message = QStringLiteral("Missing /etc/machine-id. RouteGuard cannot enroll this device until the system machine ID is available.");
        qCritical().noquote() << message;
        setFatalError(message);
        return {};
    }

    const QString machineId = QString::fromUtf8(machineIdFile.readAll()).trimmed().toLower();
    if (machineId.isEmpty()) {
        const QString message = QStringLiteral("Empty /etc/machine-id. RouteGuard cannot enroll this device until the system machine ID is repaired.");
        qCritical().noquote() << message;
        setFatalError(message);
        return {};
    }

    return machineId;
}

void AppController::playFailureTone() {
#ifdef Q_OS_LINUX
    bool expected = false;
    if (!s_failureTonePlaying.compare_exchange_strong(expected, true)) {
        return;
    }

    std::thread([]() {
        const std::array<const char *, 3> deviceNames {
            "default",
            "plughw:0,0",
            "hw:0,0"
        };

        bool played = false;
        for (const char *deviceName : deviceNames) {
            if (writeToneToDevice(deviceName)) {
                played = true;
                break;
            }
        }

        if (!played) {
            qWarning().noquote() << "Unable to play RouteGuard failure tone on any ALSA output.";
        }

        s_failureTonePlaying.store(false);
    }).detach();
#endif
}

void AppController::clearDriverSession() {
    const bool changed = !m_activeDriverRecordId.isEmpty() || !m_activeDriverCode.isEmpty() || !m_activeDriver.isEmpty();
    m_activeDriverRecordId.clear();
    m_activeDriverCode.clear();
    m_activeDriver.clear();
    if (changed) {
        emit activeDriverChanged();
        emit driverSessionChanged();
    }
}

void AppController::updatePendingCount() {
    m_syncPendingCount = m_store.pendingCount();
    emit syncPendingCountChanged();
}

QVariantList AppController::discoverRfidDevices() const {
    QVariantList devices;
    QSet<QString> seenPaths;

    const auto appendDevice = [&](const QString &path, const QString &label, const QString &kind) {
        const QFileInfo targetInfo(path);
        const QString canonicalPath = targetInfo.exists() ? targetInfo.canonicalFilePath() : path;
        const QString effectivePath = canonicalPath.isEmpty() ? path : canonicalPath;
        if (effectivePath.isEmpty() || seenPaths.contains(effectivePath)) {
            return;
        }

        QVariantMap item;
        item.insert("path", effectivePath);
        item.insert("label", label);
        item.insert("kind", kind);
        devices.append(item);
        seenPaths.insert(effectivePath);
    };

    const QDir serialDir(QStringLiteral("/dev/serial/by-id"));
    for (const QString &entry : serialDir.entryList(QDir::System | QDir::Files | QDir::NoDotAndDotDot)) {
        const QFileInfo info(serialDir.filePath(entry));
        appendDevice(info.filePath(), QStringLiteral("%1 (%2)").arg(entry, QStringLiteral("USB Serial")), QStringLiteral("serial"));
    }

    const QDir inputDir(QStringLiteral("/dev/input/by-id"));
    const QStringList inputEntries = inputDir.entryList(QDir::System | QDir::Files | QDir::NoDotAndDotDot);
    for (const QString &entry : inputEntries) {
        if (!entry.contains(QStringLiteral("usb-"), Qt::CaseInsensitive) ||
            !entry.contains(QStringLiteral("event"), Qt::CaseInsensitive)) {
            continue;
        }

        QString kind = QStringLiteral("hid");
        if (entry.contains(QStringLiteral("kbd"), Qt::CaseInsensitive)) {
            kind = QStringLiteral("keyboard");
        } else if (entry.contains(QStringLiteral("mouse"), Qt::CaseInsensitive)) {
            kind = QStringLiteral("mouse");
        }

        const QFileInfo info(inputDir.filePath(entry));
        appendDevice(info.filePath(), QStringLiteral("%1 (%2)").arg(entry, QStringLiteral("USB Input")), kind);
    }

    const QDir ttyDir(QStringLiteral("/dev"));
    const QStringList ttyEntries = ttyDir.entryList(QStringList() << "ttyUSB*" << "ttyACM*", QDir::System | QDir::Files);
    for (const QString &entry : ttyEntries) {
        appendDevice(ttyDir.filePath(entry), QStringLiteral("%1 (%2)").arg(entry, QStringLiteral("Serial Port")), QStringLiteral("serial"));
    }

    return devices;
}

void AppController::restoreSelectedRfidDevice() {
    const QString storedPath = m_settings.value("rfidDevicePath").toString();
    if (storedPath.isEmpty()) {
        if (!m_selectedRfidDevicePath.isEmpty() || m_selectedRfidDeviceLabel != QStringLiteral("Not configured")) {
            m_selectedRfidDevicePath.clear();
            m_selectedRfidDeviceLabel = QStringLiteral("Not configured");
            emit selectedRfidDeviceChanged();
        }
        return;
    }

    for (const QVariant &item : std::as_const(m_availableRfidDevices)) {
        const QVariantMap map = item.toMap();
        if (map.value("path").toString() == storedPath) {
            const QString label = map.value("label").toString();
            if (m_selectedRfidDevicePath != storedPath || m_selectedRfidDeviceLabel != label) {
                m_selectedRfidDevicePath = storedPath;
                m_selectedRfidDeviceLabel = label;
                emit selectedRfidDeviceChanged();
            }
            return;
        }
    }

    if (m_selectedRfidDevicePath != storedPath || m_selectedRfidDeviceLabel != QStringLiteral("Configured device unavailable")) {
        m_selectedRfidDevicePath = storedPath;
        m_selectedRfidDeviceLabel = QStringLiteral("Configured device unavailable");
        emit selectedRfidDeviceChanged();
    }
}
