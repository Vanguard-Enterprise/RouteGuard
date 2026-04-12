#pragma once

#include "localstore.h"
#include "syncmanager.h"

#include <QDateTime>
#include <QVariantList>
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
    Q_PROPERTY(bool driverAuthenticated READ driverAuthenticated NOTIFY driverSessionChanged)
    Q_PROPERTY(bool driverLoginPending READ driverLoginPending NOTIFY driverLoginStateChanged)
    Q_PROPERTY(QString driverLoginError READ driverLoginError NOTIFY driverLoginStateChanged)
    Q_PROPERTY(QString routeCode READ routeCode NOTIFY routeCodeChanged)
    Q_PROPERTY(QString lastScan READ lastScan NOTIFY lastScanChanged)
    Q_PROPERTY(QString lastSync READ lastSync NOTIFY lastSyncChanged)
    Q_PROPERTY(QString appVersion READ appVersion CONSTANT)
    Q_PROPERTY(QString deviceId READ deviceId CONSTANT)
    Q_PROPERTY(QString fatalError READ fatalError NOTIFY fatalErrorChanged)
    Q_PROPERTY(bool settingsVisible READ settingsVisible NOTIFY settingsVisibleChanged)
    Q_PROPERTY(QVariantList availableRfidDevices READ availableRfidDevices NOTIFY availableRfidDevicesChanged)
    Q_PROPERTY(QString selectedRfidDevicePath READ selectedRfidDevicePath NOTIFY selectedRfidDeviceChanged)
    Q_PROPERTY(QString selectedRfidDeviceLabel READ selectedRfidDeviceLabel NOTIFY selectedRfidDeviceChanged)

public:
    explicit AppController(QObject *parent = nullptr);

    bool enrollmentRequired() const;
    QString enrollmentCode() const;
    QString enrollmentExpires() const;
    QString connectivityStatus() const;
    int syncPendingCount() const;
    QString activeDriver() const;
    bool driverAuthenticated() const;
    bool driverLoginPending() const;
    QString driverLoginError() const;
    QString routeCode() const;
    QString lastScan() const;
    QString lastSync() const;
    QString appVersion() const;
    QString deviceId() const;
    QString fatalError() const;
    bool settingsVisible() const;
    QVariantList availableRfidDevices() const;
    QString selectedRfidDevicePath() const;
    QString selectedRfidDeviceLabel() const;

    Q_INVOKABLE void initialize();
    Q_INVOKABLE void submitDriverPIN(const QString &pin);
    Q_INVOKABLE void logoutDriver();
    Q_INVOKABLE void selectRoute(const QString &routeId, const QString &routeCode);
    Q_INVOKABLE void submitTag(const QString &tagId);
    Q_INVOKABLE void forceSync();
    Q_INVOKABLE void openSettings();
    Q_INVOKABLE void closeSettings();
    Q_INVOKABLE void refreshRfidDevices();
    Q_INVOKABLE void selectRfidDevice(const QString &devicePath);

signals:
    void enrollmentStateChanged();
    void connectivityStatusChanged();
    void syncPendingCountChanged();
    void activeDriverChanged();
    void driverSessionChanged();
    void driverLoginStateChanged();
    void routeCodeChanged();
    void lastScanChanged();
    void lastSyncChanged();
    void fatalErrorChanged();
    void settingsVisibleChanged();
    void availableRfidDevicesChanged();
    void selectedRfidDeviceChanged();

private:
    bool shouldSuppressTag(const QString &tagId);
    void enterEnrollmentMode();
    void enterOperationalMode();
    void setFatalError(const QString &message);
    QString storedToken() const;
    void persistToken(const QString &token);
    QString resolveSystemDeviceId();
    void clearDriverSession();
    void updatePendingCount();
    QVariantList discoverRfidDevices() const;
    void restoreSelectedRfidDevice();

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
    QString m_activeDriverRecordId;
    QString m_activeDriverCode;
    QString m_activeDriver;
    bool m_driverLoginPending {false};
    QString m_driverLoginError;
    QString m_routeId;
    QString m_routeCode;
    QString m_lastScan;
    QString m_lastSync {"Never"};
    QString m_appVersion;
    QString m_deviceId;
    QString m_fatalError;
    bool m_settingsVisible {false};
    QVariantList m_availableRfidDevices;
    QString m_selectedRfidDevicePath;
    QString m_selectedRfidDeviceLabel;
};
