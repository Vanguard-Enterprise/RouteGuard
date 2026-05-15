#include "device_ui_controller.h"

#include <QCoreApplication>
#include <QApplication>

int main(int argc, char *argv[]) {
    qputenv("SLINT_BACKEND", "Qt");

    QApplication app(argc, argv);
    app.setOrganizationName(QStringLiteral("RouteGuard"));
    app.setApplicationName(QStringLiteral("RouteGuard Bus Slint"));

    auto ui = DeviceShell::create();
    DeviceUiController controller(ui);
    controller.initialize();

    ui->run();
    return 0;
}
