#pragma once

#include <QString>
#include <QList>
#include <QStringList>

enum class AuthStatus {
    Booting = 0,
    Blocked = 1,
    Ready = 2,
    Pending = 3,
    Authenticated = 4,
};

struct DeviceUiState {
    AuthStatus authStatus {AuthStatus::Booting};
    QString pinBuffer;
    QString errorMessage;
    QString driverName;
    bool isEnrollmentRequired {false};
    QString fatalError;
    QString currentTimeText;
    bool isSettingsOpen {false};
    int orientationMode {0};
    int brightnessLevel {100};
    int contrastLevel {100};
    int themeMode {0};
    bool demoModeEnabled {false};
    QString demoSuccessTag {QStringLiteral("120001")};
    QString demoWrongBusTag {QStringLiteral("120002")};
    QString demoInvalidTag {QStringLiteral("120003")};
    QString demoStatusTitle;
    QString demoStatusBody;
    QStringList demoStudents;
    int demoBoardedCount {0};
    QStringList demoSeatNames;
    QStringList demoSeatGrades;
    QList<int> demoSeatStates;
    int demoAlertKind {0};
    bool demoToastVisible {false};
    int demoCaptureSlot {-1};
    QString demoCaptureBuffer;

    // Reserved for later Slint migration phases so the state shape can grow in place.
    QString routeSummary;
    QString selectedStopId;
    QString currentLocationSummary;
    QString navigationSummary;
    int routeProgressPercent {0};
};
