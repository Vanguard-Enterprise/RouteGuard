#pragma once

#include <QtWebEngineCore/QWebEngineUrlRequestInterceptor>

class AppController;

class RouteGuardRequestInterceptor : public QWebEngineUrlRequestInterceptor {
public:
    explicit RouteGuardRequestInterceptor(AppController *controller, QObject *parent = nullptr);

    void interceptRequest(QWebEngineUrlRequestInfo &info) override;

private:
    AppController *m_controller;
};
