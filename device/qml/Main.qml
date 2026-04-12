import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ApplicationWindow {
    visible: true
    width: 1280
    height: 800
    title: "RouteGuard Bus"
    color: "#0b1320"
    property string driverPinValue: ""

    function appendDriverPin(digit) {
        if (appController.driverAuthenticated || appController.driverLoginPending || driverPinValue.length >= 4) {
            return
        }
        driverPinValue += digit
    }

    function clearDriverPin() {
        if (appController.driverLoginPending) {
            return
        }
        driverPinValue = ""
    }

    function backspaceDriverPin() {
        if (appController.driverLoginPending || driverPinValue.length === 0) {
            return
        }
        driverPinValue = driverPinValue.slice(0, -1)
    }

    function maskedDriverPin() {
        if (driverPinValue.length === 0) {
            return "Enter 4-digit PIN"
        }

        let masked = ""
        for (let index = 0; index < driverPinValue.length; index += 1) {
            masked += (index === 0 ? "" : " ") + "\u2022"
        }
        return masked
    }

    function submitDriverPin() {
        if (appController.driverLoginPending || driverPinValue.length !== 4) {
            return
        }
        appController.submitDriverPIN(driverPinValue)
    }

    Connections {
        target: appController

        function onDriverSessionChanged() {
            driverPinValue = ""
            if (!appController.driverAuthenticated) {
                routeIdField.text = ""
                routeCodeField.text = ""
                tagField.text = ""
            }
        }

        function onDriverLoginStateChanged() {
            if (!appController.driverLoginPending && appController.driverLoginError.length > 0) {
                driverPinValue = ""
            }
        }
    }

    Rectangle {
        anchors.fill: parent
        color: "#00000099"
        visible: appController.settingsVisible
        z: 10

        MouseArea {
            anchors.fill: parent
            onClicked: appController.closeSettings()
        }
    }

    Rectangle {
        visible: appController.settingsVisible
        z: 11
        width: Math.min(parent.width - 60, 720)
        height: Math.min(parent.height - 60, 640)
        anchors.centerIn: parent
        radius: 22
        color: "#122033"
        border.color: "#27415f"

        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 22
            spacing: 16

            RowLayout {
                Layout.fillWidth: true

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 6

                    Text {
                        text: "Settings"
                        color: "white"
                        font.pixelSize: 30
                        font.bold: true
                    }

                    Text {
                        text: "Choose which USB device the bus computer should use for RFID input."
                        color: "#9ab2ce"
                        font.pixelSize: 16
                        wrapMode: Text.WordWrap
                        Layout.fillWidth: true
                    }
                }

                Button {
                    text: "Close"
                    onClicked: appController.closeSettings()
                }
            }

            Rectangle {
                Layout.fillWidth: true
                radius: 14
                color: "#0d1828"
                implicitHeight: 92

                ColumnLayout {
                    anchors.fill: parent
                    anchors.margins: 16
                    spacing: 8

                    Text {
                        text: "Selected RFID Device"
                        color: "#8fa8c5"
                        font.pixelSize: 15
                    }

                    Text {
                        text: appController.selectedRfidDeviceLabel
                        color: "white"
                        font.pixelSize: 22
                        wrapMode: Text.WordWrap
                    }

                    Text {
                        text: appController.selectedRfidDevicePath
                        color: "#9ab2ce"
                        font.pixelSize: 14
                        visible: appController.selectedRfidDevicePath.length > 0
                        wrapMode: Text.WordWrap
                    }
                }
            }

            RowLayout {
                Layout.fillWidth: true
                spacing: 12

                Button {
                    text: "Refresh Devices"
                    onClicked: appController.refreshRfidDevices()
                }

                Button {
                    text: "Clear Selection"
                    onClicked: appController.selectRfidDevice("")
                }
            }

            Rectangle {
                Layout.fillWidth: true
                Layout.fillHeight: true
                radius: 16
                color: "#0d1828"
                border.color: "#1f3550"

                ListView {
                    anchors.fill: parent
                    anchors.margins: 10
                    spacing: 10
                    clip: true
                    model: appController.availableRfidDevices

                    delegate: Rectangle {
                        required property var modelData

                        width: ListView.view.width
                        radius: 14
                        color: modelData.path === appController.selectedRfidDevicePath ? "#214364" : "#122033"
                        border.color: modelData.path === appController.selectedRfidDevicePath ? "#6ab8ff" : "#27415f"
                        implicitHeight: 104

                        MouseArea {
                            anchors.fill: parent
                            onClicked: appController.selectRfidDevice(modelData.path)
                        }

                        ColumnLayout {
                            anchors.fill: parent
                            anchors.margins: 14
                            spacing: 8

                            Text {
                                text: modelData.label
                                color: "white"
                                font.pixelSize: 20
                                font.bold: modelData.path === appController.selectedRfidDevicePath
                                wrapMode: Text.WordWrap
                                Layout.fillWidth: true
                            }

                            Text {
                                text: modelData.kind + "  |  " + modelData.path
                                color: "#9ab2ce"
                                font.pixelSize: 14
                                wrapMode: Text.WordWrap
                                Layout.fillWidth: true
                            }
                        }
                    }

                    footer: Item {
                        width: ListView.view.width
                        height: appController.availableRfidDevices.length === 0 ? 72 : 0

                        Text {
                            anchors.centerIn: parent
                            visible: appController.availableRfidDevices.length === 0
                            text: "No USB RFID candidates were found."
                            color: "#8fa8c5"
                            font.pixelSize: 18
                        }
                    }
                }
            }
        }
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 28
        spacing: 20

        Rectangle {
            Layout.fillWidth: true
            radius: 18
            color: "#122033"
            border.color: "#1f3550"
            implicitHeight: 120

            RowLayout {
                anchors.fill: parent
                anchors.margins: 20
                spacing: 24

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 8

                    Text {
                        text: "RouteGuard Bus"
                        color: "white"
                        font.pixelSize: 34
                        font.bold: true
                    }

                    Text {
                        text: (appController.deviceId ? "Device " + appController.deviceId : "Device unavailable") + "  |  v" + appController.appVersion
                        color: "#8fa8c5"
                        font.pixelSize: 18
                    }
                }

                ColumnLayout {
                    spacing: 6

                    Text {
                        text: "Connectivity: " + appController.connectivityStatus
                        color: "white"
                        font.pixelSize: 18
                    }
                    Text {
                        text: "Pending sync: " + appController.syncPendingCount
                        color: "#d5e4f6"
                        font.pixelSize: 18
                    }
                    Text {
                        text: "Last sync: " + appController.lastSync
                        color: "#8fa8c5"
                        font.pixelSize: 16
                    }
                }

                Button {
                    text: "Settings"
                    onClicked: appController.openSettings()
                }
            }
        }

        RowLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            spacing: 20
            visible: !appController.enrollmentRequired

            Rectangle {
                Layout.fillWidth: true
                Layout.fillHeight: true
                radius: 18
                color: "#122033"
                border.color: "#1f3550"

                ColumnLayout {
                    anchors.fill: parent
                    anchors.margins: 20
                    spacing: 18

                    Text {
                        text: "Driver Access"
                        color: "white"
                        font.pixelSize: 26
                        font.bold: true
                    }

                    Text {
                        Layout.fillWidth: true
                        text: "Drivers must sign in with a 4-digit PIN before route selection and RFID scanning are available. Login requires the API to be online."
                        wrapMode: Text.WordWrap
                        color: "#9ab2ce"
                        font.pixelSize: 16
                    }

                    Rectangle {
                        Layout.fillWidth: true
                        radius: 16
                        color: appController.driverLoginError.length > 0 ? "#3b1820" : "#0d1828"
                        border.color: appController.driverAuthenticated ? "#3fb36f" : (appController.driverLoginError.length > 0 ? "#d7677f" : "#27415f")
                        implicitHeight: 118

                        ColumnLayout {
                            anchors.fill: parent
                            anchors.margins: 16
                            spacing: 8

                            Text {
                                text: appController.driverAuthenticated ? "Driver authenticated" : "Driver PIN"
                                color: "#8fa8c5"
                                font.pixelSize: 15
                            }

                            Text {
                                text: appController.driverAuthenticated ? appController.activeDriver : maskedDriverPin()
                                color: "white"
                                font.pixelSize: appController.driverAuthenticated ? 28 : 34
                                font.bold: true
                                font.letterSpacing: appController.driverAuthenticated ? 0 : 3
                                wrapMode: Text.WordWrap
                                Layout.fillWidth: true
                            }

                            Text {
                                text: appController.driverAuthenticated
                                      ? "RFID workflow unlocked for this session."
                                      : (appController.driverLoginPending ? "Checking PIN with RouteGuard..." : "Use the on-screen keypad.")
                                color: "#c8d8ea"
                                font.pixelSize: 15
                                Layout.fillWidth: true
                                wrapMode: Text.WordWrap
                            }
                        }
                    }

                    GridLayout {
                        Layout.fillWidth: true
                        columns: 3
                        columnSpacing: 12
                        rowSpacing: 12
                        enabled: !appController.driverAuthenticated && !appController.driverLoginPending
                        visible: !appController.driverAuthenticated

                        Repeater {
                            model: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "Clear", "0", "Back"]

                            Button {
                                Layout.fillWidth: true
                                Layout.preferredHeight: 76
                                text: modelData

                                onClicked: {
                                    if (modelData === "Clear") {
                                        clearDriverPin()
                                    } else if (modelData === "Back") {
                                        backspaceDriverPin()
                                    } else {
                                        appendDriverPin(modelData)
                                    }
                                }
                            }
                        }
                    }

                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 12

                        Button {
                            Layout.fillWidth: true
                            text: appController.driverLoginPending ? "Signing In..." : "Unlock Device"
                            enabled: !appController.driverAuthenticated && !appController.driverLoginPending && driverPinValue.length === 4
                            onClicked: submitDriverPin()
                        }

                        Button {
                            Layout.fillWidth: true
                            visible: appController.driverAuthenticated
                            text: "Logout Driver"
                            onClicked: appController.logoutDriver()
                        }
                    }

                    Text {
                        Layout.fillWidth: true
                        visible: appController.driverLoginError.length > 0
                        text: appController.driverLoginError
                        color: "#ff9fb3"
                        font.pixelSize: 16
                        wrapMode: Text.WordWrap
                    }

                    Rectangle {
                        Layout.fillWidth: true
                        radius: 14
                        color: "#0d1828"
                        implicitHeight: 128

                        ColumnLayout {
                            anchors.fill: parent
                            anchors.margins: 16
                            spacing: 8

                            Text {
                                text: "Session Status"
                                color: "#8fa8c5"
                                font.pixelSize: 15
                            }

                            Text {
                                text: "Active Driver: " + (appController.activeDriver || "Not signed in")
                                color: "white"
                                font.pixelSize: 20
                            }

                            Text {
                                text: "Active Route: " + (appController.routeCode || "None selected")
                                color: "#c8d8ea"
                                font.pixelSize: 18
                            }
                        }
                    }

                    Text {
                        text: "Route selection stays manual after login."
                        color: "#8fa8c5"
                        font.pixelSize: 15
                    }

                    TextField {
                        id: routeIdField
                        Layout.fillWidth: true
                        placeholderText: "Route ID"
                        enabled: appController.driverAuthenticated
                    }

                    TextField {
                        id: routeCodeField
                        Layout.fillWidth: true
                        placeholderText: "Route code"
                        enabled: appController.driverAuthenticated
                    }

                    Button {
                        text: "Set Active Route"
                        enabled: appController.driverAuthenticated
                        onClicked: appController.selectRoute(routeIdField.text, routeCodeField.text)
                    }
                }
            }

            Rectangle {
                Layout.fillWidth: true
                Layout.fillHeight: true
                radius: 18
                color: "#122033"
                border.color: "#1f3550"

                ColumnLayout {
                    anchors.fill: parent
                    anchors.margins: 20
                    spacing: 18

                    Text {
                        text: "RFID Boarding"
                        color: "white"
                        font.pixelSize: 26
                        font.bold: true
                    }

                    Text {
                        text: "Production readers can pipe into the same submit flow. This field is for bench and pilot validation."
                        wrapMode: Text.WordWrap
                        color: "#9ab2ce"
                        font.pixelSize: 16
                    }

                    TextField {
                        id: tagField
                        Layout.fillWidth: true
                        placeholderText: "RFID tag"
                        onAccepted: {
                            appController.submitTag(text)
                            text = ""
                        }
                    }

                    Button {
                        text: "Record Scan"
                        onClicked: {
                            appController.submitTag(tagField.text)
                            tagField.text = ""
                        }
                    }

                    Button {
                        text: "Force Sync"
                        onClicked: appController.forceSync()
                    }

                    Rectangle {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        radius: 14
                        color: "#0d1828"

                        ColumnLayout {
                            anchors.fill: parent
                            anchors.margins: 16
                            spacing: 10

                            Text {
                                text: "Last Scan"
                                color: "#8fa8c5"
                                font.pixelSize: 16
                            }
                            Text {
                                text: appController.lastScan || "No scans recorded yet"
                                color: "white"
                                font.pixelSize: 24
                                wrapMode: Text.WordWrap
                            }
                        }
                    }
                }

                Rectangle {
                    anchors.fill: parent
                    radius: 18
                    color: "#08101bd9"
                    visible: !appController.driverAuthenticated
                    z: 2

                    ColumnLayout {
                        anchors.centerIn: parent
                        spacing: 12

                        Text {
                            text: "Driver login required"
                            color: "white"
                            font.pixelSize: 30
                            font.bold: true
                            horizontalAlignment: Text.AlignHCenter
                            Layout.alignment: Qt.AlignHCenter
                        }

                        Text {
                            text: "Unlock the device from the keypad before scanning RFID tags."
                            color: "#9ab2ce"
                            font.pixelSize: 18
                            horizontalAlignment: Text.AlignHCenter
                            Layout.alignment: Qt.AlignHCenter
                        }
                    }
                }
            }
        }

        Rectangle {
            Layout.fillWidth: true
            Layout.fillHeight: true
            visible: appController.enrollmentRequired
            radius: 24
            color: "#122033"
            border.color: "#1f3550"

            ColumnLayout {
                anchors.centerIn: parent
                spacing: 18

                Text {
                    text: "Device Enrollment"
                    color: "white"
                    font.pixelSize: 40
                    font.bold: true
                    horizontalAlignment: Text.AlignHCenter
                    Layout.alignment: Qt.AlignHCenter
                }

                Text {
                    text: appController.fatalError
                        ? "This device cannot enroll until its system identity is repaired."
                        : "Have an org admin claim this bus computer from Settings > Devices."
                    color: "#9ab2ce"
                    font.pixelSize: 18
                    horizontalAlignment: Text.AlignHCenter
                    Layout.alignment: Qt.AlignHCenter
                }

                Rectangle {
                    radius: 20
                    color: "#0d1828"
                    border.color: "#24405f"
                    implicitWidth: 520
                    implicitHeight: 220

                    ColumnLayout {
                        anchors.centerIn: parent
                        spacing: 12

                        Text {
                            text: appController.fatalError ? "Device Error" : "Enrollment Code"
                            color: "#8fa8c5"
                            font.pixelSize: 18
                            Layout.alignment: Qt.AlignHCenter
                        }

                        Text {
                            text: appController.fatalError || appController.enrollmentCode || "Loading..."
                            color: "white"
                            font.pixelSize: appController.fatalError ? 26 : 52
                            font.bold: true
                            font.letterSpacing: appController.fatalError ? 0 : 4
                            wrapMode: Text.WordWrap
                            horizontalAlignment: Text.AlignHCenter
                            Layout.alignment: Qt.AlignHCenter
                            Layout.maximumWidth: 440
                        }

                        Text {
                            text: appController.fatalError ? "" : (appController.enrollmentExpires ? "Expires: " + appController.enrollmentExpires : "")
                            color: "#9ab2ce"
                            font.pixelSize: 16
                            Layout.alignment: Qt.AlignHCenter
                        }
                    }
                }

                Button {
                    text: appController.fatalError ? "Unavailable" : "Refresh"
                    Layout.alignment: Qt.AlignHCenter
                    enabled: !appController.fatalError
                    onClicked: appController.forceSync()
                }
            }
        }
    }
}
