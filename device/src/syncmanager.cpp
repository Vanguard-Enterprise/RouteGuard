#include "syncmanager.h"

#include <QDateTime>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QUrl>

SyncManager::SyncManager(LocalStore *store, QObject *parent)
    : QObject(parent), m_store(store) {}

void SyncManager::configure(QString apiBase, QString deviceId, QString appVersion) {
    m_apiBase = apiBase;
    m_deviceId = deviceId;
    m_appVersion = appVersion;
}

void SyncManager::setDeviceToken(const QString &deviceToken) {
    m_deviceToken = deviceToken;
}

void SyncManager::bootstrap() {
    QNetworkRequest request(QUrl(m_apiBase + "/device/bootstrap"));
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
    const QJsonObject payload{
        {"device_id", m_deviceId},
        {"software_version", m_appVersion},
        {"metadata", QJsonObject{{"pending_queue_depth", m_store->pendingCount()}}}
    };
    QNetworkReply *reply = m_network.post(request, QJsonDocument(payload).toJson(QJsonDocument::Compact));
    connect(reply, &QNetworkReply::finished, this, [this, reply]() {
        const QByteArray body = reply->readAll();
        if (reply->error() != QNetworkReply::NoError) {
            emit syncFailed(reply->errorString());
            reply->deleteLater();
            return;
        }
        const QJsonObject json = QJsonDocument::fromJson(body).object();
        emit bootstrapReady(
            json.value("status").toString(),
            json.value("enrollment_code").toString(),
            json.value("enrollment_expires_at").toVariant().toString()
        );
        reply->deleteLater();
    });
}

void SyncManager::refreshEnrollmentCode() {
    QNetworkRequest request(QUrl(m_apiBase + "/device/enrollment-code"));
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
    const QJsonObject payload{{"device_id", m_deviceId}};
    QNetworkReply *reply = m_network.post(request, QJsonDocument(payload).toJson(QJsonDocument::Compact));
    connect(reply, &QNetworkReply::finished, this, [this, reply]() {
        const QByteArray body = reply->readAll();
        if (reply->error() != QNetworkReply::NoError) {
            emit syncFailed(reply->errorString());
            reply->deleteLater();
            return;
        }
        const QJsonObject json = QJsonDocument::fromJson(body).object();
        emit bootstrapReady("unenrolled", json.value("enrollment_code").toString(), json.value("enrollment_expires_at").toVariant().toString());
        reply->deleteLater();
    });
}

void SyncManager::pollEnrollmentStatus(const QString &code) {
    QNetworkRequest request(QUrl(m_apiBase + "/device/enrollment-status"));
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
    const QJsonObject payload{
        {"device_id", m_deviceId},
        {"code", code}
    };
    QNetworkReply *reply = m_network.post(request, QJsonDocument(payload).toJson(QJsonDocument::Compact));
    connect(reply, &QNetworkReply::finished, this, [this, reply]() {
        const QByteArray body = reply->readAll();
        if (reply->error() != QNetworkReply::NoError) {
            emit syncFailed(reply->errorString());
            reply->deleteLater();
            return;
        }
        const QJsonObject json = QJsonDocument::fromJson(body).object();
        const QString token = json.value("device_token").toString();
        if (!token.isEmpty()) {
            emit deviceTokenIssued(token);
        }
        emit bootstrapReady(
            json.value("status").toString(),
            QString(),
            json.value("enrollment_expires_at").toVariant().toString()
        );
        reply->deleteLater();
    });
}

void SyncManager::sendCheckIn(const QString &connectivityState, const QString &appHealth) {
    QNetworkRequest request(QUrl(m_apiBase + "/device/check-in"));
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
    request.setRawHeader("Authorization", QByteArray("Bearer ") + m_deviceToken.toUtf8());

    QJsonObject payload{
        {"name", m_deviceId},
        {"software_version", m_appVersion},
        {"connectivity_state", connectivityState},
        {"app_health", appHealth},
        {"last_seen_at", QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs)},
        {"metadata", QJsonObject{{"pending_queue_depth", m_store->pendingCount()}}}
    };

    QNetworkReply *reply = m_network.post(request, QJsonDocument(payload).toJson(QJsonDocument::Compact));
    connect(reply, &QNetworkReply::finished, this, [this, reply]() {
        const QByteArray body = reply->readAll();
        if (reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt() == 401) {
            emit authRejected();
            reply->deleteLater();
            return;
        }
        if (reply->error() != QNetworkReply::NoError) {
            emit checkInFailed(reply->errorString());
            reply->deleteLater();
            return;
        }

        const QJsonObject json = QJsonDocument::fromJson(body).object();
        const QJsonObject latest = json.value("latest_release").toObject();
        emit checkInComplete(latest.value("version").toString());
        reply->deleteLater();
    });
}

void SyncManager::syncPending(const QString &routeId) {
    const QList<PendingScanEvent> pending = m_store->pendingScans();
    if (pending.isEmpty()) {
        emit syncComplete(0);
        return;
    }

    QJsonArray events;
    for (const PendingScanEvent &event : pending) {
        QJsonObject item{
            {"event_uid", event.eventUid},
            {"student_tag", event.studentTag},
            {"scanned_at", event.scannedAt.toUTC().toString(Qt::ISODateWithMs)},
            {"metadata", event.metadata}
        };
        if (!routeId.isEmpty()) {
            item["route_id"] = routeId;
        } else if (!event.routeId.isEmpty()) {
            item["route_id"] = event.routeId;
        }
        events.append(item);
    }

    QJsonObject payload{{"events", events}};

    QNetworkRequest request(QUrl(m_apiBase + "/device/rfid-events"));
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
    request.setRawHeader("Authorization", QByteArray("Bearer ") + m_deviceToken.toUtf8());

    QNetworkReply *reply = m_network.post(request, QJsonDocument(payload).toJson(QJsonDocument::Compact));
    connect(reply, &QNetworkReply::finished, this, [this, reply]() {
        const QByteArray body = reply->readAll();
        if (reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt() == 401) {
            emit authRejected();
            reply->deleteLater();
            return;
        }
        if (reply->error() != QNetworkReply::NoError) {
            emit syncFailed(reply->errorString());
            reply->deleteLater();
            return;
        }

        const QJsonArray results = QJsonDocument::fromJson(body).object().value("results").toArray();
        QStringList accepted;
        for (const QJsonValue &value : results) {
            const QJsonObject result = value.toObject();
            if (result.value("status").toString() == "accepted") {
                accepted << result.value("event_uid").toString();
            }
        }

        m_store->markSynced(accepted);
        emit syncComplete(accepted.size());
        reply->deleteLater();
    });
}
