#include "routeguardrequestinterceptor.h"

#include "appcontroller.h"

#include <QUrl>

RouteGuardRequestInterceptor::RouteGuardRequestInterceptor(AppController *controller, QObject *parent)
    : QWebEngineUrlRequestInterceptor(parent), m_controller(controller) {}

void RouteGuardRequestInterceptor::interceptRequest(QWebEngineUrlRequestInfo &info) {
    if (m_controller == nullptr) {
        return;
    }

    const QString apiBaseValue = m_controller->apiBase().trimmed();
    if (apiBaseValue.isEmpty()) {
        return;
    }

    const QUrl apiBase(apiBaseValue);
    const QUrl requestUrl = info.requestUrl();
    if (!apiBase.isValid() || !requestUrl.isValid()) {
        return;
    }

    if (requestUrl.scheme() != apiBase.scheme() ||
        requestUrl.host() != apiBase.host() ||
        requestUrl.port(apiBase.port()) != apiBase.port(requestUrl.port())) {
        return;
    }

    const QByteArray deviceToken = m_controller->webDeviceToken().toUtf8();
    if (!deviceToken.isEmpty()) {
        info.setHttpHeader("Authorization", QByteArray("Bearer ") + deviceToken);
    }

    const QByteArray driverSession = m_controller->webDriverSessionToken().toUtf8();
    if (!driverSession.isEmpty()) {
        info.setHttpHeader("X-RouteGuard-Driver-Session", driverSession);
    }
}
