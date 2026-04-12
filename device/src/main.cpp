#include "appcontroller.h"
#include "routeguardrequestinterceptor.h"

#include <QCoreApplication>
#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QUrl>
#include <QtWebEngineCore/QWebEngineProfile>

int main(int argc, char *argv[]) {
    QGuiApplication app(argc, argv);
    app.setOrganizationName("RouteGuard");
    app.setApplicationName("RouteGuard Bus");

    AppController controller;
    RouteGuardRequestInterceptor interceptor(&controller);
    QWebEngineProfile::defaultProfile()->setUrlRequestInterceptor(&interceptor);

    QQmlApplicationEngine engine;
    engine.rootContext()->setContextProperty("appController", &controller);
    QObject::connect(&engine, &QQmlApplicationEngine::objectCreationFailed, &app, []() {
        QCoreApplication::exit(-1);
    });
    engine.load(QUrl(QStringLiteral("qrc:/RouteGuard/Bus/qml/Main.qml")));

    controller.initialize();
    return app.exec();
}
