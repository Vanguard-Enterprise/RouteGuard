#include "appcontroller.h"
#include "build_config.h"

#include <QDateTime>
#include <QFile>
#include <QJsonObject>
#include <QUuid>

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
QString AppController::routeCode() const { return m_routeCode; }
QString AppController::lastScan() const { return m_lastScan; }
QString AppController::lastSync() const { return m_lastSync; }
QString AppController::appVersion() const { return m_appVersion; }
QString AppController::deviceId() const { return m_deviceId; }
QString AppController::fatalError() const { return m_fatalError; }

void AppController::initialize() {
    m_store.initialize();
    updatePendingCount();

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

void AppController::loginDriver(const QString &driverName) {
    m_activeDriver = driverName.trimmed();
    emit activeDriverChanged();
}

void AppController::selectRoute(const QString &routeId, const QString &routeCode) {
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
    if (!m_fatalError.isEmpty() || m_enrollmentRequired || normalized.isEmpty() || shouldSuppressTag(normalized)) {
        return;
    }

    PendingScanEvent event;
    event.eventUid = QUuid::createUuid().toString(QUuid::WithoutBraces);
    event.studentTag = normalized;
    event.scannedAt = QDateTime::currentDateTimeUtc();
    event.routeId = m_routeId;
    event.metadata = QJsonObject{
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
    m_checkInTimer.stop();
    m_syncTimer.stop();
    m_enrollmentCodeTimer.start();
    m_enrollmentPollTimer.start();
    m_sync.bootstrap();
    emit connectivityStatusChanged();
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

void AppController::updatePendingCount() {
    m_syncPendingCount = m_store.pendingCount();
    emit syncPendingCountChanged();
}
