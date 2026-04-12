#include "appcontroller.h"
#include "build_config.h"

#include <QDateTime>
#include <QDebug>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonObject>
#include <QSet>
#include <QTime>
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

QVariantMap stopFromVariant(const QVariant &value) {
    return value.toMap();
}

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
        m_sync.setDeviceToken(QString());
        m_sync.setDriverSessionToken(QString());
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
    connect(
        &m_sync,
        &SyncManager::driverLoginSucceeded,
        this,
        [this](const QString &id, const QString &driverId, const QString &name, const QString &sessionToken, const QString &) {
            m_activeDriverRecordId = id;
            m_activeDriverCode = driverId;
            m_activeDriver = name;
            m_driverSessionToken = sessionToken;
            m_sync.setDriverSessionToken(sessionToken);
            m_driverLoginPending = false;
            m_driverLoginError.clear();
            m_driverHomeLoading = true;
            m_driverHomeError.clear();
            setUiMode(QStringLiteral("driver_home"));
            emit activeDriverChanged();
            emit driverSessionChanged();
            emit driverLoginStateChanged();
            emit driverHomeChanged();
            emit driverHomeStateChanged();
            m_sync.fetchDriverHome();
        }
    );
    connect(&m_sync, &SyncManager::driverLoginFailed, this, [this](const QString &message) {
        m_driverLoginPending = false;
        m_driverLoginError = message;
        if (message.contains(QStringLiteral("invalid driver pin"), Qt::CaseInsensitive)) {
            playFailureTone();
        }
        emit driverLoginStateChanged();
    });
    connect(&m_sync, &SyncManager::driverHomeLoaded, this, [this](const QVariantMap &payload) {
        applyDriverHome(payload);
    });
    connect(&m_sync, &SyncManager::driverHomeFailed, this, [this](const QString &message) {
        m_driverHomeLoading = false;
        m_driverHomeError = message;
        emit driverHomeStateChanged();
    });
    connect(&m_sync, &SyncManager::navigationSearchFinished, this, [this](const QVariantList &items) {
        m_navigationSearchPending = false;
        m_navigationSearchResults = items;
        emit navigationSearchStateChanged();
    });
    connect(&m_sync, &SyncManager::navigationSearchFailed, this, [this](const QString &message) {
        m_navigationSearchPending = false;
        m_navigationSearchResults.clear();
        m_navigationError = message;
        emit navigationSearchStateChanged();
        emit navigationStateChanged();
    });
    connect(&m_sync, &SyncManager::navigationDirectionsReady, this, [this](const QVariantMap &payload) {
        m_navigationPending = false;
        m_navigationDirections = payload;
        m_navigationError.clear();
        emit navigationStateChanged();
        emit mapStateChanged();
    });
    connect(&m_sync, &SyncManager::navigationDirectionsFailed, this, [this](const QString &message) {
        m_navigationPending = false;
        m_navigationDirections.clear();
        m_navigationError = message;
        emit navigationStateChanged();
        emit mapStateChanged();
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
        m_sync.syncPending(currentRouteId());
    });
}

bool AppController::enrollmentRequired() const { return m_enrollmentRequired; }
QString AppController::enrollmentCode() const { return m_enrollmentCode; }
QString AppController::enrollmentExpires() const { return m_enrollmentExpires; }
QString AppController::connectivityStatus() const { return m_connectivityStatus; }
int AppController::syncPendingCount() const { return m_syncPendingCount; }
QString AppController::activeDriver() const { return m_activeDriver; }
QString AppController::greeting() const {
    const int hour = QTime::currentTime().hour();
    if (hour < 12) {
        return QStringLiteral("Good morning");
    }
    if (hour < 18) {
        return QStringLiteral("Good afternoon");
    }
    return QStringLiteral("Good evening");
}
bool AppController::driverAuthenticated() const { return !m_activeDriverRecordId.isEmpty(); }
bool AppController::driverLoginPending() const { return m_driverLoginPending; }
QString AppController::driverLoginError() const { return m_driverLoginError; }
bool AppController::driverHomeLoading() const { return m_driverHomeLoading; }
QString AppController::driverHomeError() const { return m_driverHomeError; }
QVariantList AppController::assignedRoutes() const { return m_assignedRoutes; }
QVariantMap AppController::selectedRoute() const { return m_selectedRoute; }
bool AppController::hasAssignedRoute() const { return !currentRouteId().isEmpty(); }
QString AppController::uiMode() const { return m_uiMode; }
bool AppController::routeStarted() const { return m_routeStarted; }
bool AppController::operationsPanelExpanded() const { return m_operationsPanelExpanded; }
QVariantMap AppController::selectedStop() const { return currentAnchorStop(); }
QVariantMap AppController::selectedDestination() const { return m_selectedDestination; }
QVariantList AppController::navigationSearchResults() const { return m_navigationSearchResults; }
bool AppController::navigationSearchPending() const { return m_navigationSearchPending; }
bool AppController::navigationPending() const { return m_navigationPending; }
QString AppController::navigationError() const { return m_navigationError; }
QString AppController::lastScan() const { return m_lastScan; }
QString AppController::lastSync() const { return m_lastSync; }
QString AppController::appVersion() const { return m_appVersion; }
QString AppController::deviceId() const { return m_deviceId; }
QString AppController::apiBase() const { return m_sync.apiBase(); }
QString AppController::fatalError() const { return m_fatalError; }
bool AppController::settingsVisible() const { return m_settingsVisible; }
QVariantList AppController::availableRfidDevices() const { return m_availableRfidDevices; }
QString AppController::selectedRfidDevicePath() const { return m_selectedRfidDevicePath; }
QString AppController::selectedRfidDeviceLabel() const { return m_selectedRfidDeviceLabel; }
QString AppController::webDeviceToken() const { return storedToken(); }
QString AppController::webDriverSessionToken() const { return m_driverSessionToken; }

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
    clearDriverSession();
    m_driverLoginPending = false;
    m_driverLoginError.clear();
    emit driverLoginStateChanged();
}

void AppController::startRoute() {
    if (!driverAuthenticated() || !hasAssignedRoute()) {
        return;
    }

    m_routeStarted = true;
    setUiMode(QStringLiteral("active_route"));
    setOperationsPanelExpandedInternal(true);
    emit routeStateChanged();
    emit mapStateChanged();
}

void AppController::openMap() {
    if (!driverAuthenticated()) {
        return;
    }

    setUiMode(QStringLiteral("map_only"));
    setOperationsPanelExpandedInternal(false);
    emit routeStateChanged();
    emit mapStateChanged();
}

void AppController::showDriverHome() {
    if (!driverAuthenticated()) {
        return;
    }

    setUiMode(QStringLiteral("driver_home"));
    setOperationsPanelExpandedInternal(false);
    emit routeStateChanged();
    emit mapStateChanged();
}

void AppController::toggleOperationsPanel() {
    if (m_uiMode == QStringLiteral("driver_home")) {
        return;
    }
    setOperationsPanelExpandedInternal(!m_operationsPanelExpanded);
    emit routeStateChanged();
}

void AppController::setOperationsPanelExpanded(bool expanded) {
    if (m_uiMode == QStringLiteral("driver_home")) {
        return;
    }
    setOperationsPanelExpandedInternal(expanded);
    emit routeStateChanged();
}

void AppController::selectStopAnchor(const QString &stopId) {
    const QString normalized = stopId.trimmed();
    if (normalized.isEmpty()) {
        return;
    }

    const QVariantList stops = m_selectedRoute.value(QStringLiteral("stops")).toList();
    for (const QVariant &value : stops) {
        const QVariantMap stop = stopFromVariant(value);
        if (stop.value(QStringLiteral("stop_id")).toString() == normalized ||
            stop.value(QStringLiteral("id")).toString() == normalized) {
            m_selectedStop = stop;
            emit routeStateChanged();
            emit mapStateChanged();
            requestDirectionsForCurrentState();
            return;
        }
    }
}

void AppController::searchNavigation(const QString &query) {
    if (!driverAuthenticated()) {
        return;
    }

    const QString normalized = query.trimmed();
    if (normalized.length() < 3) {
        m_navigationSearchPending = false;
        m_navigationSearchResults.clear();
        emit navigationSearchStateChanged();
        return;
    }

    m_navigationSearchPending = true;
    m_navigationError.clear();
    emit navigationSearchStateChanged();
    emit navigationStateChanged();
    m_sync.searchNavigation(normalized);
}

void AppController::clearNavigationSearch() {
    if (m_navigationSearchResults.isEmpty() && !m_navigationSearchPending) {
        return;
    }
    m_navigationSearchPending = false;
    m_navigationSearchResults.clear();
    emit navigationSearchStateChanged();
}

void AppController::selectDestinationResult(const QVariantMap &destination) {
    if (destination.isEmpty()) {
        return;
    }

    m_selectedDestination = destination;
    m_navigationSearchResults.clear();
    m_navigationSearchPending = false;
    emit navigationSearchStateChanged();
    emit navigationStateChanged();
    emit mapStateChanged();
    requestDirectionsForCurrentState();
}

void AppController::clearDestination() {
    const bool hadDestination = !m_selectedDestination.isEmpty() || !m_navigationDirections.isEmpty() || !m_navigationError.isEmpty();
    m_selectedDestination.clear();
    m_navigationDirections.clear();
    m_navigationPending = false;
    m_navigationError.clear();
    if (hadDestination) {
        emit navigationStateChanged();
        emit mapStateChanged();
    }
}

QVariantMap AppController::mapState() const {
    QVariantMap state;
    state.insert(QStringLiteral("route"), m_selectedRoute);
    state.insert(QStringLiteral("selected_stop"), currentAnchorStop());
    state.insert(QStringLiteral("selected_destination"), m_selectedDestination);
    state.insert(QStringLiteral("directions"), m_navigationDirections);
    state.insert(QStringLiteral("route_started"), m_routeStarted);
    state.insert(QStringLiteral("ui_mode"), m_uiMode);
    state.insert(QStringLiteral("api_base"), apiBase());
    return state;
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
    const QString routeId = currentRouteId();
    if (!m_fatalError.isEmpty() || m_enrollmentRequired || !driverAuthenticated() || !m_routeStarted || routeId.isEmpty() || normalized.isEmpty() || shouldSuppressTag(normalized)) {
        return;
    }

    PendingScanEvent event;
    event.eventUid = QUuid::createUuid().toString(QUuid::WithoutBraces);
    event.studentTag = normalized;
    event.scannedAt = QDateTime::currentDateTimeUtc();
    event.routeId = routeId;
    event.metadata = QJsonObject{
        {"driver_record_id", m_activeDriverRecordId},
        {"driver_id", m_activeDriverCode},
        {"driver_name", m_activeDriver},
        {"route_code", m_selectedRoute.value(QStringLiteral("route_code")).toString()},
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

    if (driverAuthenticated()) {
        m_driverHomeLoading = true;
        m_driverHomeError.clear();
        emit driverHomeStateChanged();
        m_sync.fetchDriverHome();
    }

    m_sync.sendCheckIn(m_connectivityStatus, "healthy");
    m_sync.syncPending(currentRouteId());
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
    m_sync.setDriverSessionToken(QString());
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
    m_sync.setDriverSessionToken(QString());
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
    const QString previousToken = storedToken();
    if (token.isEmpty()) {
        m_settings.remove("deviceToken");
    } else {
        m_settings.setValue("deviceToken", token);
    }
    if (previousToken != token) {
        emit webCredentialsChanged();
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
    const bool changed = !m_activeDriverRecordId.isEmpty() || !m_activeDriverCode.isEmpty() || !m_activeDriver.isEmpty() || !m_driverSessionToken.isEmpty();
    m_activeDriverRecordId.clear();
    m_activeDriverCode.clear();
    m_activeDriver.clear();
    m_driverSessionToken.clear();
    m_sync.setDriverSessionToken(QString());
    clearDriverRouteState();
    if (changed) {
        emit activeDriverChanged();
        emit driverSessionChanged();
        emit driverHomeChanged();
    }
}

void AppController::clearDriverRouteState() {
    const bool hadState = !m_assignedRoutes.isEmpty() ||
        !m_selectedRoute.isEmpty() ||
        !m_selectedStop.isEmpty() ||
        !m_selectedDestination.isEmpty() ||
        !m_navigationDirections.isEmpty() ||
        !m_navigationSearchResults.isEmpty() ||
        m_routeStarted ||
        m_navigationPending ||
        m_navigationSearchPending ||
        m_driverHomeLoading ||
        !m_driverHomeError.isEmpty() ||
        !m_navigationError.isEmpty();

    m_assignedRoutes.clear();
    m_selectedRoute.clear();
    m_selectedStop.clear();
    m_selectedDestination.clear();
    m_navigationDirections.clear();
    m_navigationSearchResults.clear();
    m_routeStarted = false;
    m_navigationPending = false;
    m_navigationSearchPending = false;
    m_driverHomeLoading = false;
    m_driverHomeError.clear();
    m_navigationError.clear();
    setUiMode(QStringLiteral("driver_home"));
    setOperationsPanelExpandedInternal(false);

    if (hadState) {
        emit driverHomeChanged();
        emit driverHomeStateChanged();
        emit selectedRouteChanged();
        emit routeStateChanged();
        emit navigationStateChanged();
        emit navigationSearchStateChanged();
        emit mapStateChanged();
    }
}

void AppController::applyDriverHome(const QVariantMap &payload) {
    const QString previousRouteId = currentRouteId();
    const bool previousRouteStarted = m_routeStarted;

    m_driverHomeLoading = false;
    m_driverHomeError.clear();

    const QVariantMap driver = payload.value(QStringLiteral("driver")).toMap();
    if (!driver.isEmpty()) {
        m_activeDriverRecordId = driver.value(QStringLiteral("id")).toString();
        m_activeDriverCode = driver.value(QStringLiteral("driver_id")).toString();
        m_activeDriver = driver.value(QStringLiteral("name")).toString();
        emit activeDriverChanged();
        emit driverSessionChanged();
    }

    m_assignedRoutes = payload.value(QStringLiteral("routes")).toList();

    QVariantMap nextRoute;
    for (const QVariant &value : std::as_const(m_assignedRoutes)) {
        const QVariantMap route = value.toMap();
        if (!previousRouteId.isEmpty() && route.value(QStringLiteral("id")).toString() == previousRouteId) {
            nextRoute = route;
            break;
        }
        if (nextRoute.isEmpty()) {
            nextRoute = route;
        }
    }

    m_selectedRoute = nextRoute;
    m_selectedStop.clear();
    m_selectedDestination.clear();
    m_navigationDirections.clear();
    m_navigationSearchResults.clear();
    m_navigationPending = false;
    m_navigationSearchPending = false;
    m_navigationError.clear();

    const QString nextRouteId = currentRouteId();
    m_routeStarted = previousRouteStarted && !previousRouteId.isEmpty() && previousRouteId == nextRouteId;

    if (m_selectedRoute.isEmpty() || !m_routeStarted) {
        m_routeStarted = false;
        setUiMode(QStringLiteral("driver_home"));
        setOperationsPanelExpandedInternal(false);
    }

    emit driverHomeChanged();
    emit driverHomeStateChanged();
    emit selectedRouteChanged();
    emit routeStateChanged();
    emit navigationStateChanged();
    emit navigationSearchStateChanged();
    emit mapStateChanged();
}

void AppController::requestDirectionsForCurrentState() {
    if (m_selectedDestination.isEmpty()) {
        m_navigationDirections.clear();
        m_navigationPending = false;
        emit navigationStateChanged();
        emit mapStateChanged();
        return;
    }

    const QVariantMap anchor = currentAnchorStop();
    if (anchor.isEmpty()) {
        m_navigationDirections.clear();
        m_navigationPending = false;
        m_navigationError = QStringLiteral("No stop anchor is available for navigation.");
        emit navigationStateChanged();
        emit mapStateChanged();
        return;
    }

    const QVariantList coordinates{
        QVariantMap{
            {QStringLiteral("latitude"), anchor.value(QStringLiteral("latitude"))},
            {QStringLiteral("longitude"), anchor.value(QStringLiteral("longitude"))},
            {QStringLiteral("label"), anchor.value(QStringLiteral("name"))},
            {QStringLiteral("address"), anchor.value(QStringLiteral("address"))}
        },
        QVariantMap{
            {QStringLiteral("latitude"), m_selectedDestination.value(QStringLiteral("latitude"))},
            {QStringLiteral("longitude"), m_selectedDestination.value(QStringLiteral("longitude"))},
            {QStringLiteral("label"), m_selectedDestination.value(QStringLiteral("label"))},
            {QStringLiteral("address"), m_selectedDestination.value(QStringLiteral("address"))}
        }
    };

    m_navigationPending = true;
    m_navigationError.clear();
    emit navigationStateChanged();
    m_sync.requestDirections(coordinates);
}

QVariantMap AppController::currentAnchorStop() const {
    const QVariantList stops = m_selectedRoute.value(QStringLiteral("stops")).toList();
    if (stops.isEmpty()) {
        return {};
    }

    const QString selectedStopId = m_selectedStop.value(QStringLiteral("id")).toString();
    const QString selectedStopCode = m_selectedStop.value(QStringLiteral("stop_id")).toString();
    if (!selectedStopId.isEmpty() || !selectedStopCode.isEmpty()) {
        for (const QVariant &value : stops) {
            const QVariantMap stop = stopFromVariant(value);
            if ((!selectedStopId.isEmpty() && stop.value(QStringLiteral("id")).toString() == selectedStopId) ||
                (!selectedStopCode.isEmpty() && stop.value(QStringLiteral("stop_id")).toString() == selectedStopCode)) {
                return stop;
            }
        }
    }

    return stopFromVariant(stops.constFirst());
}

QString AppController::currentRouteId() const {
    return m_selectedRoute.value(QStringLiteral("id")).toString();
}

void AppController::setUiMode(const QString &mode) {
    if (m_uiMode == mode) {
        return;
    }
    m_uiMode = mode;
    emit uiModeChanged();
}

void AppController::setOperationsPanelExpandedInternal(bool expanded) {
    if (m_operationsPanelExpanded == expanded) {
        return;
    }
    m_operationsPanelExpanded = expanded;
    emit routeStateChanged();
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
