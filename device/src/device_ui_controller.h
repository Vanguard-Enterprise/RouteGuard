#pragma once

#include "device_ui_state.h"
#include "localstore.h"
#include "syncmanager.h"

#include "device_shell.h"

#include <QDateTime>
#include <QObject>
#include <QSettings>
#include <QStringList>
#include <QTimer>

class DeviceUiController : public QObject {
    Q_OBJECT

public:
    explicit DeviceUiController(slint::ComponentHandle<DeviceShell> ui, QObject *parent = nullptr);

    void initialize();
    bool eventFilter(QObject *watched, QEvent *event) override;

private:
    enum class DisplaySetting {
        Brightness,
        Contrast,
    };

    void appendDigit(const QString &digit);
    void backspace();
    void clearPin();
    void submitPin();
    void refreshCurrentTime();
    void logout();
    void openSettings();
    void closeSettings();
    void setOrientation(int mode);
    void setThemeMode(int mode);
    void adjustBrightness(int delta);
    void adjustContrast(int delta);
    void setDemoModeEnabled(bool enabled);
    void adjustDemoTag(int slot, int delta);
    void clearDemoTag(int slot);
    void startDemoTagCapture(int slot);
    void triggerDemoScan(int outcome);

    void syncUi();
    void loadDisplayPreferences();
    void persistDisplayPreferences();
    void loadDemoConfig();
    void persistDemoConfig() const;
    void applyDisplayPreferences();
    void adjustDisplaySetting(DisplaySetting setting, int delta);
    int clampPercent(int value) const;
    int clampDemoTagValue(int value) const;
    QString demoConfigPath() const;
    QString formatDemoTag(int value) const;
    int parseDemoTag(const QString &value, int fallback) const;
    int demoWaitingCount() const;
    void resetDemoBoardingSession();
    void processDemoTagScan(const QString &tagId);
    void showDemoAlert(int kind, const QString &title, const QString &body);
    void stopDemoTagCapture(bool commit);
    void submitDemoBoardingScan();
    bool applySystemOrientation() const;
    void enterEnrollmentMode();
    void enterOperationalMode();
    void setFatalError(const QString &message);
    QString storedToken() const;
    void persistToken(const QString &token);
    QString resolveSystemDeviceId();
    void clearDriverSession();
    void playFailureTone();

    slint::ComponentHandle<DeviceShell> m_ui;
    DeviceUiState m_state;
    LocalStore m_store;
    SyncManager m_sync;
    QTimer m_enrollmentCodeTimer;
    QTimer m_enrollmentPollTimer;
    QTimer m_checkInTimer;
    QTimer m_syncTimer;
    QTimer m_demoAlertTimer;
    QTimer m_clockTimer;
    QTimer m_demoScanBufferTimer;
    QSettings m_settings;
    QString m_connectivityStatus {QStringLiteral("starting")};
    QString m_enrollmentCode;
    QString m_enrollmentExpires;
    QString m_activeDriverRecordId;
    QString m_activeDriverCode;
    QString m_driverSessionToken;
    QString m_appVersion;
    QString m_deviceId;
    QString m_demoScanBuffer;
};
