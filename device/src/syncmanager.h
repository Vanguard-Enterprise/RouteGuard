#pragma once

#include "localstore.h"

#include <QNetworkAccessManager>
#include <QObject>
#include <QString>

class SyncManager : public QObject {
    Q_OBJECT
public:
    explicit SyncManager(LocalStore *store, QObject *parent = nullptr);

    void configure(QString deviceId, QString appVersion);
    void setDeviceToken(const QString &deviceToken);
    void bootstrap();
    void refreshEnrollmentCode();
    void pollEnrollmentStatus(const QString &code);
    void sendCheckIn(const QString &connectivityState, const QString &appHealth);
    void syncPending(const QString &routeId);

signals:
    void bootstrapReady(const QString &status, const QString &code, const QString &expiresAt);
    void deviceTokenIssued(const QString &token);
    void authRejected();
    void syncComplete(int acceptedCount);
    void syncFailed(const QString &message);
    void checkInComplete(const QString &latestVersion);
    void checkInFailed(const QString &message);

private:
    LocalStore *m_store;
    QNetworkAccessManager m_network;
    QString m_apiBase;
    QString m_deviceToken;
    QString m_deviceId;
    QString m_appVersion;
};
