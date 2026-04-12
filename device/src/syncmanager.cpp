#include "syncmanager.h"
#include "build_config.h"

#include <QDateTime>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QUrl>
#include <QUrlQuery>

namespace {

QJsonObject parseJsonObject(const QByteArray &body) {
    const QJsonDocument document = QJsonDocument::fromJson(body);
    return document.isObject() ? document.object() : QJsonObject {};
}

QString apiErrorMessage(const QJsonObject &json, const QString &fallback) {
    const QString error = json.value(QStringLiteral("error")).toString().trimmed();
    return error.isEmpty() ? fallback : error;
}

} // namespace

SyncManager::SyncManager(LocalStore *store, QObject *parent)
    : QObject(parent), m_store(store) {}

void SyncManager::configure(QString deviceId, QString appVersion) {
    m_apiBase = QStringLiteral(ROUTEGUARD_API_BASE_URL);
    m_deviceId = deviceId;
    m_appVersion = appVersion;
}

void SyncManager::setDeviceToken(const QString &deviceToken) {
    m_deviceToken = deviceToken;
}

void SyncManager::setDriverSessionToken(const QString &driverSessionToken) {
    m_driverSessionToken = driverSessionToken;
}

QString SyncManager::apiBase() const {
    return m_apiBase;
}

QNetworkRequest SyncManager::authorizedRequest(const QString &path, bool includeDriverSession) const {
    QNetworkRequest request(QUrl(m_apiBase + path));
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
    request.setRawHeader("Authorization", QByteArray("Bearer ") + m_deviceToken.toUtf8());
    if (includeDriverSession && !m_driverSessionToken.isEmpty()) {
        request.setRawHeader("X-RouteGuard-Driver-Session", m_driverSessionToken.toUtf8());
    }
    return request;
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
    QNetworkRequest request = authorizedRequest(QStringLiteral("/device/check-in"));

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

void SyncManager::loginDriver(const QString &pin) {
    QNetworkRequest request = authorizedRequest(QStringLiteral("/device/driver-login"));

    const QJsonObject payload{
        {"pin", pin}
    };

    QNetworkReply *reply = m_network.post(request, QJsonDocument(payload).toJson(QJsonDocument::Compact));
    connect(reply, &QNetworkReply::finished, this, [this, reply]() {
        const QByteArray body = reply->readAll();
        const int status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
        const QJsonObject json = parseJsonObject(body);
        const QString errorMessage = json.value("error").toString();

        if (status == 401) {
            emit authRejected();
            reply->deleteLater();
            return;
        }

        if (reply->error() != QNetworkReply::NoError) {
            if (status == 403) {
                emit driverLoginFailed(errorMessage.isEmpty() ? QStringLiteral("Invalid driver PIN.") : errorMessage);
            } else if (!errorMessage.isEmpty()) {
                emit driverLoginFailed(errorMessage);
            } else {
                emit driverLoginFailed(QStringLiteral("Driver login requires an online connection."));
            }
            reply->deleteLater();
            return;
        }

        const QJsonObject driver = json.value("driver").toObject();
        const QString sessionToken = json.value("session_token").toString();
        const QString sessionExpiresAt = json.value("session_expires_at").toVariant().toString();
        const QString id = driver.value("id").toString();
        const QString driverId = driver.value("driver_id").toString();
        const QString name = driver.value("name").toString();
        if (id.isEmpty() || driverId.isEmpty() || name.isEmpty() || sessionToken.isEmpty()) {
            emit driverLoginFailed(QStringLiteral("Unexpected driver login response."));
            reply->deleteLater();
            return;
        }

        emit driverLoginSucceeded(id, driverId, name, sessionToken, sessionExpiresAt);
        reply->deleteLater();
    });
}

void SyncManager::fetchDriverHome() {
    QNetworkRequest request = authorizedRequest(QStringLiteral("/device/driver-home"), true);

    QNetworkReply *reply = m_network.get(request);
    connect(reply, &QNetworkReply::finished, this, [this, reply]() {
        const QByteArray body = reply->readAll();
        const int status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
        const QJsonObject json = parseJsonObject(body);

        if (status == 401) {
            emit authRejected();
            reply->deleteLater();
            return;
        }
        if (reply->error() != QNetworkReply::NoError) {
            emit driverHomeFailed(apiErrorMessage(json, QStringLiteral("Driver home requires an online connection.")));
            reply->deleteLater();
            return;
        }

        emit driverHomeLoaded(json.toVariantMap());
        reply->deleteLater();
    });
}

void SyncManager::searchNavigation(const QString &query) {
    QUrl requestUrl(m_apiBase + QStringLiteral("/device/navigation/search"));
    QUrlQuery requestQuery;
    requestQuery.addQueryItem(QStringLiteral("q"), query);
    requestUrl.setQuery(requestQuery);

    QNetworkRequest request = authorizedRequest(QString(), true);
    request.setUrl(requestUrl);

    QNetworkReply *reply = m_network.get(request);
    connect(reply, &QNetworkReply::finished, this, [this, reply]() {
        const QByteArray body = reply->readAll();
        const int status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
        const QJsonObject json = parseJsonObject(body);

        if (status == 401) {
            emit authRejected();
            reply->deleteLater();
            return;
        }
        if (reply->error() != QNetworkReply::NoError) {
            emit navigationSearchFailed(apiErrorMessage(json, QStringLiteral("Navigation search is unavailable right now.")));
            reply->deleteLater();
            return;
        }

        emit navigationSearchFinished(json.value(QStringLiteral("items")).toArray().toVariantList());
        reply->deleteLater();
    });
}

void SyncManager::requestDirections(const QVariantList &coordinates) {
    if (coordinates.size() < 2) {
        emit navigationDirectionsFailed(QStringLiteral("Choose a stop and destination first."));
        return;
    }

    QNetworkRequest request = authorizedRequest(QStringLiteral("/device/navigation/directions"), true);
    const QJsonObject payload{
        {"coordinates", QJsonArray::fromVariantList(coordinates)}
    };

    QNetworkReply *reply = m_network.post(request, QJsonDocument(payload).toJson(QJsonDocument::Compact));
    connect(reply, &QNetworkReply::finished, this, [this, reply]() {
        const QByteArray body = reply->readAll();
        const int status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
        const QJsonObject json = parseJsonObject(body);

        if (status == 401) {
            emit authRejected();
            reply->deleteLater();
            return;
        }
        if (reply->error() != QNetworkReply::NoError) {
            emit navigationDirectionsFailed(apiErrorMessage(json, QStringLiteral("Turn-by-turn directions are unavailable right now.")));
            reply->deleteLater();
            return;
        }

        emit navigationDirectionsReady(json.toVariantMap());
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

    QNetworkRequest request = authorizedRequest(QStringLiteral("/device/rfid-events"));

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
