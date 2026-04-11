#pragma once

#include "localstore.h"
#include "syncmanager.h"

#include <QDateTime>
#include <QHash>
#include <QObject>
#include <QSettings>
#include <QTimer>

class AppController : public QObject {
    Q_OBJECT
    Q_PROPERTY(bool enrollmentRequired READ enrollmentRequired NOTIFY enrollmentStateChanged)
    Q_PROPERTY(QString enrollmentCode READ enrollmentCode NOTIFY enrollmentStateChanged)
    Q_PROPERTY(QString enrollmentExpires READ enrollmentExpires NOTIFY enrollmentStateChanged)
    Q_PROPERTY(QString connectivityStatus READ connectivityStatus NOTIFY connectivityStatusChanged)
    Q_PROPERTY(int syncPendingCount READ syncPendingCount NOTIFY syncPendingCountChanged)
    Q_PROPERTY(QString activeDriver READ activeDriver NOTIFY activeDriverChanged)
    Q_PROPERTY(QString routeCode READ routeCode NOTIFY routeCodeChanged)
    Q_PROPERTY(QString lastScan READ lastScan NOTIFY lastScanChanged)
    Q_PROPERTY(QString lastSync READ lastSync NOTIFY lastSyncChanged)
    Q_PROPERTY(QString appVersion READ appVersion CONSTANT)
    Q_PROPERTY(QString deviceId READ deviceId CONSTANT)
    Q_PROPERTY(QString fatalError READ fatalError NOTIFY fatalErrorChanged)

public:
    explicit AppController(QObject *parent = nullptr);

    bool enrollmentRequired() const;
    QString enrollmentCode() const;
    QString enrollmentExpires() const;
    QString connectivityStatus() const;
    int syncPendingCount() const;
    QString activeDriver() const;
    QString routeCode() const;
    QString lastScan() const;
    QString lastSync() const;
    QString appVersion() const;
    QString deviceId() const;
    QString fatalError() const;

    Q_INVOKABLE void initialize();
    Q_INVOKABLE void loginDriver(const QString &driverName);
    Q_INVOKABLE void selectRoute(const QString &routeId, const QString &routeCode);
    Q_INVOKABLE void submitTag(const QString &tagId);
    Q_INVOKABLE void forceSync();

signals:
    void enrollmentStateChanged();
    void connectivityStatusChanged();
    void syncPendingCountChanged();
    void activeDriverChanged();
    void routeCodeChanged();
    void lastScanChanged();
    void lastSyncChanged();
    void fatalErrorChanged();

private:
    bool shouldSuppressTag(const QString &tagId);
    void enterEnrollmentMode();
    void enterOperationalMode();
    void setFatalError(const QString &message);
    QString storedToken() const;
    void persistToken(const QString &token);
    QString resolveSystemDeviceId();
    void updatePendingCount();

    LocalStore m_store;
    SyncManager m_sync;
    QTimer m_enrollmentCodeTimer;
    QTimer m_enrollmentPollTimer;
    QTimer m_checkInTimer;
    QTimer m_syncTimer;
    QHash<QString, QDateTime> m_recentTags;
    QSettings m_settings;
    bool m_enrollmentRequired {true};
    QString m_enrollmentCode;
    QString m_enrollmentExpires;
    QString m_connectivityStatus {"starting"};
    int m_syncPendingCount {0};
    QString m_activeDriver;
    QString m_routeId;
    QString m_routeCode;
    QString m_lastScan;
    QString m_lastSync {"Never"};
    QString m_appVersion;
    QString m_deviceId;
    QString m_fatalError;
};
