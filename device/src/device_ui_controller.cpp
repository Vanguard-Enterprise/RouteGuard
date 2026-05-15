#include "device_ui_controller.h"
#include "build_config.h"

#include <QDateTime>
#include <QDir>
#include <QEvent>
#include <QFile>
#include <QFileInfo>
#include <QGuiApplication>
#include <QJsonDocument>
#include <QJsonObject>
#include <QKeyEvent>
#include <QProcess>
#include <QRandomGenerator>
#include <QScreen>
#include <QStandardPaths>
#include <QTimer>
#include <QtGlobal>

#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <string_view>
#include <thread>
#include <utility>
#include <vector>

#ifdef Q_OS_LINUX
#include <alsa/asoundlib.h>
#endif

namespace {

slint::SharedString toSlintString(const QString &value) {
    const QByteArray utf8 = value.toUtf8();
    return slint::SharedString(std::string_view(utf8.constData(), static_cast<std::size_t>(utf8.size())));
}

int toUiAuthStatus(AuthStatus status) {
    return static_cast<int>(status);
}

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

DeviceUiController::DeviceUiController(slint::ComponentHandle<DeviceShell> ui, QObject *parent)
    : QObject(parent), m_ui(std::move(ui)), m_sync(&m_store, this), m_settings("RouteGuard", "RouteGuard Bus") {
    if (QGuiApplication *app = qobject_cast<QGuiApplication *>(QCoreApplication::instance())) {
        app->installEventFilter(this);
    }

    m_appVersion = QStringLiteral(ROUTEGUARD_BUILD_VERSION);
    m_deviceId = resolveSystemDeviceId();
    loadDisplayPreferences();
    loadDemoConfig();

    m_ui->on_append_digit([this](slint::SharedString digit) {
        appendDigit(QString::fromUtf8(digit.data(), static_cast<int>(digit.size())));
    });
    m_ui->on_backspace([this]() {
        backspace();
    });
    m_ui->on_clear_pin([this]() {
        clearPin();
    });
    m_ui->on_submit_pin([this]() {
        submitPin();
    });
    m_ui->on_logout([this]() {
        logout();
    });
    m_ui->on_open_settings([this]() {
        openSettings();
    });
    m_ui->on_close_settings([this]() {
        closeSettings();
    });
    m_ui->on_set_orientation([this](int mode) {
        setOrientation(mode);
    });
    m_ui->on_set_theme_mode([this](int mode) {
        setThemeMode(mode);
    });
    m_ui->on_adjust_brightness([this](int delta) {
        adjustBrightness(delta);
    });
    m_ui->on_adjust_contrast([this](int delta) {
        adjustContrast(delta);
    });
    m_ui->on_set_demo_mode_enabled([this](bool enabled) {
        setDemoModeEnabled(enabled);
    });
    m_ui->on_adjust_demo_tag([this](int slot, int delta) {
        adjustDemoTag(slot, delta);
    });
    m_ui->on_clear_demo_tag([this](int slot) {
        clearDemoTag(slot);
    });
    m_ui->on_start_demo_tag_capture([this](int slot) {
        startDemoTagCapture(slot);
    });
    m_ui->on_trigger_demo_scan([this](int outcome) {
        triggerDemoScan(outcome);
    });

    connect(&m_sync, &SyncManager::bootstrapReady, this, [this](const QString &status, const QString &code, const QString &expiresAt) {
        if (!code.isEmpty()) {
            m_enrollmentCode = code;
        }
        if (!expiresAt.isEmpty()) {
            m_enrollmentExpires = expiresAt;
        }

        if (status == QStringLiteral("enrolled") && !storedToken().isEmpty()) {
            enterOperationalMode();
            return;
        }

        if (m_state.isEnrollmentRequired) {
            m_state.authStatus = AuthStatus::Blocked;
            syncUi();
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
        clearDriverSession();
        enterEnrollmentMode();
    });

    connect(&m_sync, &SyncManager::syncFailed, this, [this](const QString &) {
        m_connectivityStatus = QStringLiteral("offline");
    });

    connect(&m_sync, &SyncManager::checkInComplete, this, [this](const QString &) {
        m_connectivityStatus = QStringLiteral("online");
    });

    connect(&m_sync, &SyncManager::checkInFailed, this, [this](const QString &) {
        m_connectivityStatus = QStringLiteral("offline");
    });

    connect(
        &m_sync,
        &SyncManager::driverLoginSucceeded,
        this,
        [this](const QString &id, const QString &driverId, const QString &name, const QString &sessionToken, const QString &) {
            m_activeDriverRecordId = id;
            m_activeDriverCode = driverId;
            m_state.driverName = name;
            m_driverSessionToken = sessionToken;
            m_sync.setDriverSessionToken(sessionToken);
            m_state.pinBuffer.clear();
            m_state.errorMessage.clear();
            m_state.authStatus = AuthStatus::Authenticated;
            if (m_state.demoModeEnabled) {
                resetDemoBoardingSession();
            }
            syncUi();
        }
    );

    connect(&m_sync, &SyncManager::driverLoginFailed, this, [this](const QString &message) {
        m_state.authStatus = AuthStatus::Ready;
        m_state.errorMessage = message;
        if (message.contains(QStringLiteral("invalid driver pin"), Qt::CaseInsensitive)) {
            playFailureTone();
        }
        syncUi();
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
        m_sync.sendCheckIn(m_connectivityStatus, QStringLiteral("healthy"));
    });

    m_syncTimer.setInterval(10000);
    connect(&m_syncTimer, &QTimer::timeout, this, [this]() {
        m_sync.syncPending(QString());
    });

    m_demoAlertTimer.setSingleShot(true);
    m_demoAlertTimer.setInterval(2800);
    connect(&m_demoAlertTimer, &QTimer::timeout, this, [this]() {
        m_state.demoToastVisible = false;
        m_state.demoAlertKind = 0;
        syncUi();
    });

    m_demoScanBufferTimer.setSingleShot(true);
    m_demoScanBufferTimer.setInterval(1500);
    connect(&m_demoScanBufferTimer, &QTimer::timeout, this, [this]() {
        m_demoScanBuffer.clear();
    });

    m_clockTimer.setInterval(1000);
    connect(&m_clockTimer, &QTimer::timeout, this, [this]() {
        refreshCurrentTime();
        syncUi();
    });
    refreshCurrentTime();
    m_clockTimer.start();

    syncUi();
}

bool DeviceUiController::eventFilter(QObject *watched, QEvent *event) {
    Q_UNUSED(watched);

    if (event->type() != QEvent::KeyPress) {
        return QObject::eventFilter(watched, event);
    }

    auto *keyEvent = static_cast<QKeyEvent *>(event);
    const bool demoBoardingActive =
        m_state.authStatus == AuthStatus::Authenticated &&
        m_state.demoModeEnabled &&
        !m_state.isSettingsOpen;

    if (m_state.demoCaptureSlot < 0 && !demoBoardingActive) {
        return QObject::eventFilter(watched, event);
    }

    if (m_state.demoCaptureSlot >= 0) {
        switch (keyEvent->key()) {
        case Qt::Key_Return:
        case Qt::Key_Enter:
            stopDemoTagCapture(true);
            return true;
        case Qt::Key_Escape:
            stopDemoTagCapture(false);
            return true;
        case Qt::Key_Backspace:
            if (!m_state.demoCaptureBuffer.isEmpty()) {
                m_state.demoCaptureBuffer.chop(1);
                m_state.demoStatusBody = m_state.demoCaptureBuffer.isEmpty()
                    ? QStringLiteral("Waiting for scanner input on selected demo tag.")
                    : QStringLiteral("Scanner input: %1").arg(m_state.demoCaptureBuffer);
                syncUi();
            }
            return true;
        default:
            break;
        }

        const QString text = keyEvent->text();
        if (text.length() == 1 && text.at(0).isDigit()) {
            m_state.demoCaptureBuffer += text;
            m_state.demoStatusBody = QStringLiteral("Scanner input: %1").arg(m_state.demoCaptureBuffer);
            syncUi();
        }

        return true;
    }

    switch (keyEvent->key()) {
    case Qt::Key_Return:
    case Qt::Key_Enter:
        submitDemoBoardingScan();
        return true;
    case Qt::Key_Escape:
        m_demoScanBuffer.clear();
        m_demoScanBufferTimer.stop();
        return true;
    case Qt::Key_Backspace:
        if (!m_demoScanBuffer.isEmpty()) {
            m_demoScanBuffer.chop(1);
            if (m_demoScanBuffer.isEmpty()) {
                m_demoScanBufferTimer.stop();
            } else {
                m_demoScanBufferTimer.start();
            }
        }
        return true;
    default:
        break;
    }

    const QString text = keyEvent->text();
    if (text.length() == 1 && text.at(0).isDigit()) {
        m_demoScanBuffer += text;
        m_demoScanBufferTimer.start();
        return true;
    }

    return true;
}

void DeviceUiController::initialize() {
    if (!m_store.initialize()) {
        setFatalError(QStringLiteral("Unable to initialize local RouteGuard storage on this device."));
        syncUi();
        return;
    }

    if (m_deviceId.isEmpty()) {
        syncUi();
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

void DeviceUiController::appendDigit(const QString &digit) {
    if (m_state.authStatus != AuthStatus::Ready) {
        return;
    }

    if (m_state.pinBuffer.length() >= 4 || digit.length() != 1 || !digit.at(0).isDigit()) {
        return;
    }

    m_state.pinBuffer += digit;
    m_state.errorMessage.clear();
    syncUi();

    if (m_state.pinBuffer.length() == 4) {
        submitPin();
    }
}

void DeviceUiController::backspace() {
    if (m_state.authStatus != AuthStatus::Ready || m_state.pinBuffer.isEmpty()) {
        return;
    }

    m_state.pinBuffer.chop(1);
    m_state.errorMessage.clear();
    syncUi();
}

void DeviceUiController::clearPin() {
    if (m_state.authStatus != AuthStatus::Ready) {
        return;
    }

    if (m_state.pinBuffer.isEmpty() && m_state.errorMessage.isEmpty()) {
        return;
    }

    m_state.pinBuffer.clear();
    m_state.errorMessage.clear();
    syncUi();
}

void DeviceUiController::submitPin() {
    if (m_state.authStatus == AuthStatus::Pending || !m_state.fatalError.isEmpty() || m_state.isEnrollmentRequired) {
        return;
    }

    const QString normalized = m_state.pinBuffer.trimmed();
    bool numericOnly = true;
    for (const QChar &character : normalized) {
        if (!character.isDigit()) {
            numericOnly = false;
            break;
        }
    }

    if (normalized.length() != 4 || !numericOnly) {
        m_state.errorMessage = QStringLiteral("Enter a 4-digit PIN.");
        m_state.authStatus = AuthStatus::Ready;
        syncUi();
        return;
    }

    m_state.errorMessage.clear();
    m_state.authStatus = AuthStatus::Pending;
    syncUi();
    if (m_state.demoModeEnabled) {
        m_activeDriverRecordId = QStringLiteral("demo-driver-record");
        m_activeDriverCode = QStringLiteral("DEMO");
        m_driverSessionToken = QStringLiteral("demo-session");
        m_state.driverName = QStringLiteral("Demo Driver");
        m_state.pinBuffer.clear();
        m_state.authStatus = AuthStatus::Authenticated;
        resetDemoBoardingSession();
        syncUi();
        return;
    }
    m_sync.loginDriver(normalized);
}

void DeviceUiController::refreshCurrentTime() {
    m_state.currentTimeText = QDateTime::currentDateTime().toString(QStringLiteral("h:mm AP"));
}

void DeviceUiController::logout() {
    clearDriverSession();
    m_state.isSettingsOpen = false;
    m_state.pinBuffer.clear();
    m_state.errorMessage.clear();
    m_state.authStatus = (m_state.isEnrollmentRequired || !m_state.fatalError.isEmpty())
        ? AuthStatus::Blocked
        : AuthStatus::Ready;
    syncUi();
}

void DeviceUiController::syncUi() {
    m_ui->set_auth_status(toUiAuthStatus(m_state.authStatus));
    m_ui->set_pin_buffer(toSlintString(m_state.pinBuffer));
    m_ui->set_pin_length(static_cast<int>(m_state.pinBuffer.length()));
    m_ui->set_error_message(toSlintString(m_state.errorMessage));
    m_ui->set_driver_name(toSlintString(m_state.driverName));
    m_ui->set_current_time_text(toSlintString(m_state.currentTimeText));
    m_ui->set_is_enrollment_required(m_state.isEnrollmentRequired);
    m_ui->set_fatal_error(toSlintString(m_state.fatalError));
    m_ui->set_is_settings_open(m_state.isSettingsOpen);
    m_ui->set_orientation_mode(m_state.orientationMode);
    m_ui->set_brightness_level(m_state.brightnessLevel);
    m_ui->set_contrast_level(m_state.contrastLevel);
    m_ui->set_theme_mode(m_state.themeMode);
    m_ui->set_demo_mode_enabled(m_state.demoModeEnabled);
    m_ui->set_demo_success_tag(toSlintString(m_state.demoSuccessTag));
    m_ui->set_demo_wrong_bus_tag(toSlintString(m_state.demoWrongBusTag));
    m_ui->set_demo_invalid_tag(toSlintString(m_state.demoInvalidTag));
    m_ui->set_demo_status_title(toSlintString(m_state.demoStatusTitle));
    m_ui->set_demo_status_body(toSlintString(m_state.demoStatusBody));
    m_ui->set_demo_boarded_count(m_state.demoBoardedCount);
    m_ui->set_demo_total_count(demoWaitingCount());
    m_ui->set_demo_capture_slot(m_state.demoCaptureSlot);
    m_ui->set_demo_alert_kind(m_state.demoAlertKind);
    m_ui->set_demo_toast_visible(m_state.demoToastVisible);

    auto studentModel = std::make_shared<slint::VectorModel<slint::SharedString>>();
    std::vector<slint::SharedString> rows;
    rows.reserve(static_cast<std::size_t>(m_state.demoStudents.length()));
    for (const QString &student : m_state.demoStudents) {
        rows.push_back(toSlintString(student));
    }
    studentModel->set_vector(std::move(rows));
    m_ui->set_demo_students(studentModel);

    auto seatNamesModel = std::make_shared<slint::VectorModel<slint::SharedString>>();
    std::vector<slint::SharedString> seatNames;
    seatNames.reserve(static_cast<std::size_t>(m_state.demoSeatNames.length()));
    for (const QString &value : m_state.demoSeatNames) {
        seatNames.push_back(toSlintString(value));
    }
    seatNamesModel->set_vector(std::move(seatNames));
    m_ui->set_demo_seat_names(seatNamesModel);

    auto seatGradesModel = std::make_shared<slint::VectorModel<slint::SharedString>>();
    std::vector<slint::SharedString> seatGrades;
    seatGrades.reserve(static_cast<std::size_t>(m_state.demoSeatGrades.length()));
    for (const QString &value : m_state.demoSeatGrades) {
        seatGrades.push_back(toSlintString(value));
    }
    seatGradesModel->set_vector(std::move(seatGrades));
    m_ui->set_demo_seat_grades(seatGradesModel);

    auto seatStatesModel = std::make_shared<slint::VectorModel<int>>();
    std::vector<int> seatStates;
    seatStates.reserve(static_cast<std::size_t>(m_state.demoSeatStates.length()));
    for (const int value : m_state.demoSeatStates) {
        seatStates.push_back(value);
    }
    seatStatesModel->set_vector(std::move(seatStates));
    m_ui->set_demo_seat_states(seatStatesModel);
}

void DeviceUiController::loadDisplayPreferences() {
    m_state.orientationMode = m_settings.value(QStringLiteral("display/orientationMode"), 0).toInt();
    m_state.brightnessLevel = clampPercent(m_settings.value(QStringLiteral("display/brightnessLevel"), 100).toInt());
    m_state.contrastLevel = clampPercent(m_settings.value(QStringLiteral("display/contrastLevel"), 100).toInt());
    m_state.themeMode = m_settings.value(QStringLiteral("display/themeMode"), 0).toInt() == 1 ? 1 : 0;
    applyDisplayPreferences();
}

void DeviceUiController::persistDisplayPreferences() {
    m_settings.setValue(QStringLiteral("display/orientationMode"), m_state.orientationMode);
    m_settings.setValue(QStringLiteral("display/brightnessLevel"), m_state.brightnessLevel);
    m_settings.setValue(QStringLiteral("display/contrastLevel"), m_state.contrastLevel);
    m_settings.setValue(QStringLiteral("display/themeMode"), m_state.themeMode);
}

void DeviceUiController::loadDemoConfig() {
    QFile file(demoConfigPath());
    if (!file.exists()) {
        resetDemoBoardingSession();
        persistDemoConfig();
        return;
    }

    if (!file.open(QIODevice::ReadOnly | QIODevice::Text)) {
        resetDemoBoardingSession();
        return;
    }

    const QJsonDocument document = QJsonDocument::fromJson(file.readAll());
    const QJsonObject object = document.object();
    const auto loadTagValue = [](const QJsonObject &source, const QString &key, const QString &fallback) {
        const QString value = source.value(key).toString().trimmed();
        return value.isEmpty() ? fallback : value;
    };
    m_state.demoModeEnabled = object.value(QStringLiteral("demo_mode_enabled")).toBool(false);
    m_state.demoSuccessTag = loadTagValue(object, QStringLiteral("success_tag"), QStringLiteral("120001"));
    m_state.demoWrongBusTag = loadTagValue(object, QStringLiteral("wrong_bus_tag"), QStringLiteral("120002"));
    m_state.demoInvalidTag = loadTagValue(object, QStringLiteral("invalid_tag"), QStringLiteral("120003"));
    resetDemoBoardingSession();
}

void DeviceUiController::persistDemoConfig() const {
    const QString path = demoConfigPath();
    QFileInfo info(path);
    QDir().mkpath(info.absolutePath());

    QFile file(path);
    if (!file.open(QIODevice::WriteOnly | QIODevice::Truncate | QIODevice::Text)) {
        return;
    }

    QJsonObject object;
    object.insert(QStringLiteral("demo_mode_enabled"), m_state.demoModeEnabled);
    object.insert(QStringLiteral("success_tag"), m_state.demoSuccessTag);
    object.insert(QStringLiteral("wrong_bus_tag"), m_state.demoWrongBusTag);
    object.insert(QStringLiteral("invalid_tag"), m_state.demoInvalidTag);
    file.write(QJsonDocument(object).toJson(QJsonDocument::Indented));
}

void DeviceUiController::applyDisplayPreferences() {
    const QByteArray display = qgetenv("DISPLAY");
    const QByteArray sessionType = qgetenv("XDG_SESSION_TYPE");
    if (!display.isEmpty() && (sessionType.isEmpty() || sessionType == "x11")) {
        applySystemOrientation();
    }
}

void DeviceUiController::openSettings() {
    if (m_state.authStatus != AuthStatus::Ready && m_state.authStatus != AuthStatus::Pending) {
        return;
    }

    m_state.isSettingsOpen = true;
    syncUi();
}

void DeviceUiController::closeSettings() {
    if (!m_state.isSettingsOpen) {
        return;
    }

    m_state.isSettingsOpen = false;
    syncUi();
}

void DeviceUiController::setOrientation(int mode) {
    const int normalizedMode = (mode >= 0 && mode <= 3) ? mode : 0;
    if (m_state.orientationMode == normalizedMode) {
        return;
    }

    m_state.orientationMode = normalizedMode;
    persistDisplayPreferences();
    applyDisplayPreferences();
    syncUi();
}

void DeviceUiController::setThemeMode(int mode) {
    const int normalizedMode = mode == 1 ? 1 : 0;
    if (m_state.themeMode == normalizedMode) {
        return;
    }

    m_state.themeMode = normalizedMode;
    persistDisplayPreferences();
    syncUi();
}

void DeviceUiController::adjustBrightness(int delta) {
    adjustDisplaySetting(DisplaySetting::Brightness, delta);
}

void DeviceUiController::adjustContrast(int delta) {
    adjustDisplaySetting(DisplaySetting::Contrast, delta);
}

void DeviceUiController::setDemoModeEnabled(bool enabled) {
    if (m_state.demoModeEnabled == enabled) {
        return;
    }

    m_state.demoModeEnabled = enabled;
    stopDemoTagCapture(false);
    resetDemoBoardingSession();
    persistDemoConfig();
    syncUi();
}

void DeviceUiController::adjustDemoTag(int slot, int delta) {
    if (delta == 0) {
        return;
    }

    QString *target = nullptr;
    int fallback = 120001;
    switch (slot) {
    case 0:
        target = &m_state.demoSuccessTag;
        fallback = 120001;
        break;
    case 1:
        target = &m_state.demoWrongBusTag;
        fallback = 120002;
        break;
    case 2:
        target = &m_state.demoInvalidTag;
        fallback = 120003;
        break;
    default:
        return;
    }

    const int current = parseDemoTag(*target, fallback);
    *target = formatDemoTag(clampDemoTagValue(current + delta));
    persistDemoConfig();
    syncUi();
}

void DeviceUiController::clearDemoTag(int slot) {
    QString *target = nullptr;
    switch (slot) {
    case 0:
        target = &m_state.demoSuccessTag;
        break;
    case 1:
        target = &m_state.demoWrongBusTag;
        break;
    case 2:
        target = &m_state.demoInvalidTag;
        break;
    default:
        return;
    }

    if (m_state.demoCaptureSlot == slot) {
        stopDemoTagCapture(false);
    }

    *target = QString();
    m_state.demoStatusTitle = QStringLiteral("Demo tag cleared");
    m_state.demoStatusBody = QStringLiteral("Scan icon can capture a new tag into this slot.");
    persistDemoConfig();
    syncUi();
}

void DeviceUiController::startDemoTagCapture(int slot) {
    if (slot < 0 || slot > 2) {
        return;
    }

    m_state.demoCaptureSlot = slot;
    m_state.demoCaptureBuffer.clear();
    m_state.demoStatusTitle = QStringLiteral("Waiting for scanner");
    m_state.demoStatusBody = QStringLiteral("Scan tag now, then send Enter to save demo ID.");
    syncUi();
}

void DeviceUiController::triggerDemoScan(int outcome) {
    QString tagId;
    switch (outcome) {
    case 0:
        tagId = m_state.demoSuccessTag;
        break;
    case 1:
        tagId = m_state.demoWrongBusTag;
        break;
    case 2:
        tagId = m_state.demoInvalidTag;
        break;
    default:
        return;
    }

    processDemoTagScan(tagId);
    syncUi();
}

void DeviceUiController::submitDemoBoardingScan() {
    const QString tagId = m_demoScanBuffer.trimmed();
    if (tagId.isEmpty()) {
        return;
    }

    m_demoScanBuffer.clear();
    m_demoScanBufferTimer.stop();
    processDemoTagScan(tagId);
    syncUi();
}

void DeviceUiController::adjustDisplaySetting(DisplaySetting setting, int delta) {
    if (delta == 0) {
        return;
    }

    int *value = setting == DisplaySetting::Brightness ? &m_state.brightnessLevel : &m_state.contrastLevel;
    const int clamped = clampPercent(*value + delta);
    if (*value == clamped) {
        return;
    }

    *value = clamped;
    persistDisplayPreferences();
    syncUi();
}

int DeviceUiController::clampPercent(int value) const {
    return std::clamp(value, 40, 140);
}

int DeviceUiController::clampDemoTagValue(int value) const {
    return std::clamp(value, 1, 999999);
}

QString DeviceUiController::demoConfigPath() const {
    const QString configRoot = QStandardPaths::writableLocation(QStandardPaths::AppConfigLocation);
    return QDir(configRoot).filePath(QStringLiteral("demo-tags.json"));
}

QString DeviceUiController::formatDemoTag(int value) const {
    return QStringLiteral("%1").arg(clampDemoTagValue(value), 6, 10, QChar(u'0'));
}

int DeviceUiController::parseDemoTag(const QString &value, int fallback) const {
    bool ok = false;
    const int parsed = value.trimmed().toInt(&ok);
    return ok ? clampDemoTagValue(parsed) : clampDemoTagValue(fallback);
}

int DeviceUiController::demoWaitingCount() const {
    int count = 0;
    for (const int state : m_state.demoSeatStates) {
        if (state == 2 || state == 3) {
            ++count;
        }
    }
    return count;
}

void DeviceUiController::resetDemoBoardingSession() {
    m_state.demoSeatNames = QStringList {
        QStringLiteral("Maya Chen"),
        QStringLiteral("Julian Cruz"),
        QStringLiteral("Ari Brooks"),
        QStringLiteral("Leah Patel"),
        QStringLiteral("Nora Kim"),
        QStringLiteral("Caleb Ortiz"),
        QStringLiteral("Zoe Rivera"),
        QStringLiteral("Owen Brooks"),
        QString(),
        QString(),
    };
    m_state.demoSeatGrades = QStringList {
        QStringLiteral("4th Grade"),
        QStringLiteral("3rd Grade"),
        QStringLiteral("5th Grade"),
        QStringLiteral("2nd Grade"),
        QStringLiteral("1st Grade"),
        QStringLiteral("4th Grade"),
        QStringLiteral("3rd Grade"),
        QStringLiteral("5th Grade"),
        QString(),
        QString(),
    };
    m_state.demoSeatStates = QList<int> {2, 2, 3, 2, 1, 1, 1, 1, 0, 0};
    m_state.demoStudents = QStringList {
        QStringLiteral("Maya Chen"),
        QStringLiteral("Julian Cruz"),
        QStringLiteral("Ari Brooks"),
        QStringLiteral("Leah Patel"),
    };
    m_state.demoBoardedCount = 4;
    m_state.demoToastVisible = false;
    m_state.demoAlertKind = 0;
    m_state.demoStatusTitle = QStringLiteral("Boarding demo ready");
    m_state.demoStatusBody = QStringLiteral("Four students already onboard. Good scan boards a random rider still on page.");
}

void DeviceUiController::processDemoTagScan(const QString &tagId) {
    const QString normalized = tagId.trimmed();

    if (normalized == m_state.demoSuccessTag) {
        QList<int> eligible;
        for (int index = 0; index < m_state.demoSeatStates.length(); ++index) {
            if (m_state.demoSeatStates.at(index) == 2 || m_state.demoSeatStates.at(index) == 3) {
                eligible.append(index);
            }
        }

        if (!eligible.isEmpty()) {
            const int chosenIndex = eligible.at(QRandomGenerator::global()->bounded(eligible.length()));
            m_state.demoSeatStates[chosenIndex] = 1;
            ++m_state.demoBoardedCount;
            const QString student = m_state.demoSeatNames.value(chosenIndex);
            showDemoAlert(
                1,
                QStringLiteral("Boarded successfully"),
                QStringLiteral("%1 scanned onto bus 412. %2 waiting.")
                    .arg(student)
                    .arg(demoWaitingCount())
            );
            return;
        }

        showDemoAlert(1, QStringLiteral("Bus fully boarded"), QStringLiteral("All demo riders already scanned onto this bus."));
        return;
    }

    if (normalized == m_state.demoWrongBusTag) {
        showDemoAlert(2, QStringLiteral("Wrong bus"), QStringLiteral("Tag %1 belongs to bus 271. Keep student off this route.").arg(normalized));
        return;
    }

    showDemoAlert(3, QStringLiteral("Invalid scan"), QStringLiteral("Read error for tag %1. Try card again or inspect reader.").arg(normalized));
}

void DeviceUiController::showDemoAlert(int kind, const QString &title, const QString &body) {
    m_state.demoAlertKind = kind;
    m_state.demoStatusTitle = title;
    m_state.demoStatusBody = body;
    m_state.demoToastVisible = true;
    m_demoAlertTimer.start();
}

void DeviceUiController::stopDemoTagCapture(bool commit) {
    if (m_state.demoCaptureSlot < 0) {
        return;
    }

    if (commit && !m_state.demoCaptureBuffer.isEmpty()) {
        QString *target = nullptr;
        switch (m_state.demoCaptureSlot) {
        case 0:
            target = &m_state.demoSuccessTag;
            break;
        case 1:
            target = &m_state.demoWrongBusTag;
            break;
        case 2:
            target = &m_state.demoInvalidTag;
            break;
        default:
            break;
        }

        if (target != nullptr) {
            *target = m_state.demoCaptureBuffer;
            m_state.demoStatusTitle = QStringLiteral("Demo tag captured");
            m_state.demoStatusBody = QStringLiteral("Saved scanner tag %1 into demo slot.").arg(m_state.demoCaptureBuffer);
            persistDemoConfig();
        }
    } else if (commit) {
        m_state.demoStatusTitle = QStringLiteral("No scan received");
        m_state.demoStatusBody = QStringLiteral("Scanner capture ended before any digits arrived.");
    }

    m_state.demoCaptureSlot = -1;
    m_state.demoCaptureBuffer.clear();
    syncUi();
}

bool DeviceUiController::applySystemOrientation() const {
#ifdef Q_OS_LINUX
    const QByteArray display = qgetenv("DISPLAY");
    if (display.isEmpty()) {
        return false;
    }

    QScreen *screen = QGuiApplication::primaryScreen();
    if (!screen) {
        return false;
    }

    const QString outputName = screen->name().trimmed();
    if (outputName.isEmpty()) {
        return false;
    }

    QString rotateValue = QStringLiteral("normal");
    switch (m_state.orientationMode) {
    case 1:
        rotateValue = QStringLiteral("left");
        break;
    case 2:
        rotateValue = QStringLiteral("inverted");
        break;
    case 3:
        rotateValue = QStringLiteral("right");
        break;
    default:
        break;
    }

    QProcess process;
    process.start(QStringLiteral("xrandr"), {QStringLiteral("--output"), outputName, QStringLiteral("--rotate"), rotateValue});
    if (!process.waitForFinished(2000)) {
        return false;
    }

    return process.exitStatus() == QProcess::NormalExit && process.exitCode() == 0;
#else
    return false;
#endif
}

void DeviceUiController::enterEnrollmentMode() {
    m_state.isEnrollmentRequired = true;
    m_state.isSettingsOpen = false;
    m_state.authStatus = AuthStatus::Blocked;
    m_state.pinBuffer.clear();
    m_state.driverName.clear();
    m_state.errorMessage.clear();
    m_connectivityStatus = QStringLiteral("enrollment");
    clearDriverSession();
    m_checkInTimer.stop();
    m_syncTimer.stop();
    m_enrollmentCodeTimer.start();
    m_enrollmentPollTimer.start();
    m_sync.setDriverSessionToken(QString());
    m_sync.bootstrap();
    syncUi();
}

void DeviceUiController::enterOperationalMode() {
    m_state.isEnrollmentRequired = false;
    m_state.isSettingsOpen = false;
    m_state.pinBuffer.clear();
    m_state.errorMessage.clear();
    if (m_state.authStatus != AuthStatus::Authenticated) {
        m_state.authStatus = AuthStatus::Ready;
    }
    m_sync.setDeviceToken(storedToken());
    m_sync.setDriverSessionToken(QString());
    m_enrollmentCode.clear();
    m_enrollmentExpires.clear();
    m_enrollmentCodeTimer.stop();
    m_enrollmentPollTimer.stop();
    m_sync.sendCheckIn(QStringLiteral("booting"), QStringLiteral("healthy"));
    m_checkInTimer.start();
    m_syncTimer.start();
    syncUi();
}

void DeviceUiController::setFatalError(const QString &message) {
    if (m_state.fatalError == message) {
        return;
    }

    m_state.fatalError = message;
    m_state.isEnrollmentRequired = true;
    m_state.isSettingsOpen = false;
    m_state.authStatus = AuthStatus::Blocked;
    m_state.pinBuffer.clear();
    m_state.errorMessage.clear();
    m_state.driverName.clear();
    m_connectivityStatus = QStringLiteral("error");
    m_enrollmentCode.clear();
    m_enrollmentExpires.clear();
    m_enrollmentCodeTimer.stop();
    m_enrollmentPollTimer.stop();
    m_checkInTimer.stop();
    m_syncTimer.stop();
    clearDriverSession();
}

QString DeviceUiController::storedToken() const {
    return m_settings.value(QStringLiteral("deviceToken")).toString();
}

void DeviceUiController::persistToken(const QString &token) {
    if (token.isEmpty()) {
        m_settings.remove(QStringLiteral("deviceToken"));
        return;
    }

    m_settings.setValue(QStringLiteral("deviceToken"), token);
}

QString DeviceUiController::resolveSystemDeviceId() {
    QFile machineIdFile(QStringLiteral("/etc/machine-id"));
    if (!machineIdFile.open(QIODevice::ReadOnly | QIODevice::Text)) {
        const QString message = QStringLiteral("Missing /etc/machine-id. RouteGuard cannot enroll this device until the system machine ID is available.");
        setFatalError(message);
        return {};
    }

    const QString machineId = QString::fromUtf8(machineIdFile.readAll()).trimmed().toLower();
    if (machineId.isEmpty()) {
        const QString message = QStringLiteral("Empty /etc/machine-id. RouteGuard cannot enroll this device until the system machine ID is repaired.");
        setFatalError(message);
        return {};
    }

    return machineId;
}

void DeviceUiController::clearDriverSession() {
    m_activeDriverRecordId.clear();
    m_activeDriverCode.clear();
    m_driverSessionToken.clear();
    m_state.driverName.clear();
    m_sync.setDriverSessionToken(QString());
}

void DeviceUiController::playFailureTone() {
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

        for (const char *deviceName : deviceNames) {
            if (writeToneToDevice(deviceName)) {
                s_failureTonePlaying.store(false);
                return;
            }
        }

        s_failureTonePlaying.store(false);
    }).detach();
#endif
}
