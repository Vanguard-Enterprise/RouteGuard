#pragma once

#include "localstore.h"

#include <QNetworkAccessManager>
#include <QObject>
#include <QString>
#include <QVariantList>
#include <QVariantMap>

class SyncManager : public QObject {
    Q_OBJECT
public:
    explicit SyncManager(LocalStore *store, QObject *parent = nullptr);

    void configure(QString deviceId, QString appVersion);
    void setDeviceToken(const QString &deviceToken);
    void setDriverSessionToken(const QString &driverSessionToken);
    QString apiBase() const;
    void bootstrap();
    void refreshEnrollmentCode();
    void pollEnrollmentStatus(const QString &code);
    void sendCheckIn(const QString &connectivityState, const QString &appHealth);
    void loginDriver(const QString &pin);
    void fetchDriverHome();
    void resolveDeviceLocation(const QVariantList &wifiAccessPoints);
    void searchNavigation(const QString &query);
    void requestDirections(const QVariantList &coordinates);
    void syncPending(const QString &routeId);

signals:
    void bootstrapReady(const QString &status, const QString &code, const QString &expiresAt);
    void deviceTokenIssued(const QString &token);
    void authRejected();
    void syncComplete(int acceptedCount);
    void syncFailed(const QString &message);
    void checkInComplete(const QString &latestVersion);
    void checkInFailed(const QString &message);
    void driverLoginSucceeded(
        const QString &id,
        const QString &driverId,
        const QString &name,
        const QString &sessionToken,
        const QString &sessionExpiresAt
    );
    void driverLoginFailed(const QString &message);
    void driverHomeLoaded(const QVariantMap &payload);
    void driverHomeFailed(const QString &message);
    void deviceLocationResolved(const QVariantMap &payload);
    void deviceLocationFailed(const QString &message);
    void navigationSearchFinished(const QVariantList &items);
    void navigationSearchFailed(const QString &message);
    void navigationDirectionsReady(const QVariantMap &payload);
    void navigationDirectionsFailed(const QString &message);

private:
    QNetworkRequest authorizedRequest(const QString &path, bool includeDriverSession = false) const;

    LocalStore *m_store;
    QNetworkAccessManager m_network;
    QString m_apiBase;
    QString m_deviceToken;
    QString m_driverSessionToken;
    QString m_deviceId;
    QString m_appVersion;
};
