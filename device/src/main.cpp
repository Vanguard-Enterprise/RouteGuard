#include "appcontroller.h"
#include "routeguardrequestinterceptor.h"

#include <QCoreApplication>
#include <QDateTime>
#include <QGuiApplication>
#include <QNetworkCookie>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QUrl>
#include <QtWebEngineCore/QWebEngineCookieStore>
#include <QtWebEngineCore/QWebEngineProfile>
#include <QtWebEngineQuick/qtwebenginequickglobal.h>

namespace {

void syncDeviceAuthCookie(QWebEngineProfile *profile, AppController *controller) {
    if (profile == nullptr || controller == nullptr) {
        return;
    }

    const QUrl apiUrl(controller->apiBase());
    if (!apiUrl.isValid() || apiUrl.host().isEmpty()) {
        return;
    }

    QNetworkCookie cookie("rg_device_token", controller->webDeviceToken().toUtf8());
    cookie.setDomain(apiUrl.host());
    cookie.setPath(QStringLiteral("/"));
    cookie.setHttpOnly(true);
    cookie.setSecure(apiUrl.scheme().compare(QStringLiteral("https"), Qt::CaseInsensitive) == 0);
    cookie.setSameSitePolicy(QNetworkCookie::SameSite::None);

    if (cookie.value().isEmpty()) {
        cookie.setExpirationDate(QDateTime::currentDateTimeUtc().addDays(-1));
    } else {
        cookie.setExpirationDate(QDateTime::currentDateTimeUtc().addDays(30));
    }

    profile->cookieStore()->setCookie(cookie, apiUrl);
}

} // namespace

int main(int argc, char *argv[]) {
    QCoreApplication::setAttribute(Qt::AA_ShareOpenGLContexts);
    QtWebEngineQuick::initialize();

    QGuiApplication app(argc, argv);
    app.setOrganizationName("RouteGuard");
    app.setApplicationName(QStringLiteral("RouteGuard Bus"));

    AppController controller;
    RouteGuardRequestInterceptor interceptor(&controller);
    QWebEngineProfile *profile = QWebEngineProfile::defaultProfile();
    profile->setUrlRequestInterceptor(&interceptor);
    QObject::connect(&controller, &AppController::webCredentialsChanged, &app, [profile, &controller]() {
        syncDeviceAuthCookie(profile, &controller);
    });

    controller.initialize();
    syncDeviceAuthCookie(profile, &controller);

    QQmlApplicationEngine engine;
    engine.rootContext()->setContextProperty("appController", &controller);
    QObject::connect(&engine, &QQmlApplicationEngine::objectCreationFailed, &app, []() {
        QCoreApplication::exit(-1);
    });
    engine.load(QUrl(QStringLiteral("qrc:/RouteGuard/Bus/qml/Main.qml")));

    return app.exec();
}
