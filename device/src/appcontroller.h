#pragma once

#include "localstore.h"
#include "syncmanager.h"

#include <QDateTime>
#include <QHash>
#include <QObject>
#include <QSettings>
#include <QTimer>
#include <QVariantList>
#include <QVariantMap>

class AppController : public QObject {
    Q_OBJECT
    Q_PROPERTY(bool enrollmentRequired READ enrollmentRequired NOTIFY enrollmentStateChanged)
    Q_PROPERTY(QString enrollmentCode READ enrollmentCode NOTIFY enrollmentStateChanged)
    Q_PROPERTY(QString enrollmentExpires READ enrollmentExpires NOTIFY enrollmentStateChanged)
    Q_PROPERTY(QString connectivityStatus READ connectivityStatus NOTIFY connectivityStatusChanged)
    Q_PROPERTY(int syncPendingCount READ syncPendingCount NOTIFY syncPendingCountChanged)
    Q_PROPERTY(QString activeDriver READ activeDriver NOTIFY activeDriverChanged)
    Q_PROPERTY(QString greeting READ greeting NOTIFY driverHomeChanged)
    Q_PROPERTY(bool driverAuthenticated READ driverAuthenticated NOTIFY driverSessionChanged)
    Q_PROPERTY(bool driverLoginPending READ driverLoginPending NOTIFY driverLoginStateChanged)
    Q_PROPERTY(QString driverLoginError READ driverLoginError NOTIFY driverLoginStateChanged)
    Q_PROPERTY(bool driverHomeLoading READ driverHomeLoading NOTIFY driverHomeStateChanged)
    Q_PROPERTY(QString driverHomeError READ driverHomeError NOTIFY driverHomeStateChanged)
    Q_PROPERTY(QVariantList assignedRoutes READ assignedRoutes NOTIFY driverHomeChanged)
    Q_PROPERTY(QVariantMap selectedRoute READ selectedRoute NOTIFY selectedRouteChanged)
    Q_PROPERTY(bool hasAssignedRoute READ hasAssignedRoute NOTIFY driverHomeChanged)
    Q_PROPERTY(QString uiMode READ uiMode NOTIFY uiModeChanged)
    Q_PROPERTY(bool routeStarted READ routeStarted NOTIFY routeStateChanged)
    Q_PROPERTY(bool operationsPanelExpanded READ operationsPanelExpanded NOTIFY routeStateChanged)
    Q_PROPERTY(QVariantMap selectedStop READ selectedStop NOTIFY routeStateChanged)
    Q_PROPERTY(QVariantMap selectedDestination READ selectedDestination NOTIFY navigationStateChanged)
    Q_PROPERTY(QVariantList navigationSearchResults READ navigationSearchResults NOTIFY navigationSearchStateChanged)
    Q_PROPERTY(bool navigationSearchPending READ navigationSearchPending NOTIFY navigationSearchStateChanged)
    Q_PROPERTY(bool navigationPending READ navigationPending NOTIFY navigationStateChanged)
    Q_PROPERTY(QString navigationError READ navigationError NOTIFY navigationStateChanged)
    Q_PROPERTY(QString lastScan READ lastScan NOTIFY lastScanChanged)
    Q_PROPERTY(QString lastSync READ lastSync NOTIFY lastSyncChanged)
    Q_PROPERTY(QString appVersion READ appVersion CONSTANT)
    Q_PROPERTY(QString deviceId READ deviceId CONSTANT)
    Q_PROPERTY(QString apiBase READ apiBase CONSTANT)
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
    QString greeting() const;
    bool driverAuthenticated() const;
    bool driverLoginPending() const;
    QString driverLoginError() const;
    bool driverHomeLoading() const;
    QString driverHomeError() const;
    QVariantList assignedRoutes() const;
    QVariantMap selectedRoute() const;
    bool hasAssignedRoute() const;
    QString uiMode() const;
    bool routeStarted() const;
    bool operationsPanelExpanded() const;
    QVariantMap selectedStop() const;
    QVariantMap selectedDestination() const;
    QVariantList navigationSearchResults() const;
    bool navigationSearchPending() const;
    bool navigationPending() const;
    QString navigationError() const;
    QString lastScan() const;
    QString lastSync() const;
    QString appVersion() const;
    QString deviceId() const;
    QString apiBase() const;
    QString fatalError() const;
    bool settingsVisible() const;
    QVariantList availableRfidDevices() const;
    QString selectedRfidDevicePath() const;
    QString selectedRfidDeviceLabel() const;
    QString webDeviceToken() const;
    QString webDriverSessionToken() const;

    Q_INVOKABLE void initialize();
    Q_INVOKABLE void submitDriverPIN(const QString &pin);
    Q_INVOKABLE void logoutDriver();
    Q_INVOKABLE void startRoute();
    Q_INVOKABLE void openMap();
    Q_INVOKABLE void showDriverHome();
    Q_INVOKABLE void toggleOperationsPanel();
    Q_INVOKABLE void setOperationsPanelExpanded(bool expanded);
    Q_INVOKABLE void selectStopAnchor(const QString &stopId);
    Q_INVOKABLE void searchNavigation(const QString &query);
    Q_INVOKABLE void clearNavigationSearch();
    Q_INVOKABLE void selectDestinationResult(const QVariantMap &destination);
    Q_INVOKABLE void clearDestination();
    Q_INVOKABLE QVariantMap mapState() const;
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
    void driverHomeChanged();
    void driverHomeStateChanged();
    void selectedRouteChanged();
    void uiModeChanged();
    void routeStateChanged();
    void navigationStateChanged();
    void navigationSearchStateChanged();
    void mapStateChanged();
    void lastScanChanged();
    void lastSyncChanged();
    void fatalErrorChanged();
    void settingsVisibleChanged();
    void availableRfidDevicesChanged();
    void selectedRfidDeviceChanged();
    void webCredentialsChanged();

private:
    bool shouldSuppressTag(const QString &tagId);
    void enterEnrollmentMode();
    void enterOperationalMode();
    void setFatalError(const QString &message);
    QString storedToken() const;
    void persistToken(const QString &token);
    QString resolveSystemDeviceId();
    void playFailureTone();
    void clearDriverSession();
    void clearDriverRouteState();
    void applyDriverHome(const QVariantMap &payload);
    void requestDirectionsForCurrentState();
    QVariantMap currentAnchorStop() const;
    QString currentRouteId() const;
    void setUiMode(const QString &mode);
    void setOperationsPanelExpandedInternal(bool expanded);
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
    QString m_driverSessionToken;
    bool m_driverLoginPending {false};
    QString m_driverLoginError;
    bool m_driverHomeLoading {false};
    QString m_driverHomeError;
    QVariantList m_assignedRoutes;
    QVariantMap m_selectedRoute;
    QVariantMap m_selectedStop;
    QString m_uiMode {QStringLiteral("driver_home")};
    bool m_routeStarted {false};
    bool m_operationsPanelExpanded {false};
    QVariantMap m_selectedDestination;
    QVariantMap m_navigationDirections;
    QVariantList m_navigationSearchResults;
    bool m_navigationSearchPending {false};
    bool m_navigationPending {false};
    QString m_navigationError;
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
