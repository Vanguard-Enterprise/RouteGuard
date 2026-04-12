import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtWebChannel
import QtWebEngine

ApplicationWindow {
    visible: true
    visibility: Window.FullScreen
    width: 1920
    height: 1080
    title: "RouteGuard Bus"
    color: "#0b1320"
    readonly property real designWidth: 1920
    readonly property real designHeight: 1080
    readonly property real uiScale: Math.max(0.82, Math.min(width / designWidth, height / designHeight))
    readonly property bool compactLayout: width < 1500 || height < 860
    property string driverPinValue: ""
    property string lockToastMessage: ""
    property bool lockToastVisible: false
    property string navigationQuery: ""
    property string rfidTagValue: ""

    function px(value) {
        return Math.round(value * uiScale)
    }

    function appendDriverPin(digit) {
        if (appController.driverAuthenticated || appController.driverLoginPending || driverPinValue.length >= 4) {
            return
        }
        driverPinValue += digit
        if (driverPinValue.length === 4) {
            appController.submitDriverPIN(driverPinValue)
        }
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
            return "\u2022 \u2022 \u2022 \u2022"
        }

        let masked = []
        for (let index = 0; index < driverPinValue.length; index += 1) {
            masked.push("\u2022")
        }
        while (masked.length < 4) {
            masked.push("\u25e6")
        }
        return masked.join(" ")
    }

    function showLockToast(message) {
        lockToastMessage = message
        lockToastVisible = true
        lockToastTimer.restart()
    }

    function routeStops(route) {
        return route && route.stops ? route.stops : []
    }

    function stopSummary(stop) {
        if (!stop || !stop.name) {
            return "Choose a stop on the map"
        }
        if (stop.address && stop.address.length > 0) {
            return stop.name + "  |  " + stop.address
        }
        return stop.name
    }

    function destinationSummary(destination) {
        if (!destination || !destination.label) {
            return ""
        }
        if (destination.address && destination.address.length > 0) {
            return destination.label + "  |  " + destination.address
        }
        return destination.label
    }

    component ChromeButton: Button {
        font.pixelSize: px(16)
        padding: 0
        background: Rectangle {
            radius: px(18)
            color: parent.down ? "#dbe7f5" : "#f8fbff"
            border.color: "#d9e5f2"
        }
        contentItem: Text {
            text: parent.text
            color: "#0f172a"
            font.pixelSize: parent.font.pixelSize
            font.bold: true
            horizontalAlignment: Text.AlignHCenter
            verticalAlignment: Text.AlignVCenter
        }
    }

    Timer {
        id: lockToastTimer
        interval: 2600
        repeat: false
        onTriggered: lockToastVisible = false
    }

    Timer {
        id: navigationSearchTimer
        interval: 320
        repeat: false
        onTriggered: {
            if (navigationQuery.length >= 3) {
                appController.searchNavigation(navigationQuery)
            } else {
                appController.clearNavigationSearch()
            }
        }
    }

    Connections {
        target: appController

        function onDriverSessionChanged() {
            driverPinValue = ""
            navigationQuery = ""
            rfidTagValue = ""
            if (!appController.driverAuthenticated) {
                appController.closeSettings()
                appController.clearNavigationSearch()
            }
        }

        function onDriverLoginStateChanged() {
            if (!appController.driverLoginPending && appController.driverLoginError.length > 0) {
                driverPinValue = ""
                showLockToast(appController.driverLoginError)
            }
        }
    }

    Menu {
        id: homeOverflowMenu

        MenuItem {
            text: "Settings"
            onTriggered: appController.openSettings()
        }

        MenuItem {
            text: "Logout"
            onTriggered: appController.logoutDriver()
        }
    }

    Menu {
        id: consoleOverflowMenu

        MenuItem {
            text: "Driver Home"
            onTriggered: appController.showDriverHome()
        }

        MenuItem {
            text: "Open Map"
            enabled: appController.uiMode !== "map_only"
            onTriggered: appController.openMap()
        }

        MenuItem {
            text: "Start Route"
            enabled: appController.hasAssignedRoute && !appController.routeStarted
            onTriggered: appController.startRoute()
        }

        MenuItem {
            text: "Settings"
            onTriggered: appController.openSettings()
        }

        MenuItem {
            text: "Logout"
            onTriggered: appController.logoutDriver()
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

    Rectangle {
        anchors.top: parent.top
        anchors.right: parent.right
        anchors.topMargin: px(24)
        anchors.rightMargin: px(24)
        width: Math.min(parent.width - px(48), px(420))
        radius: px(18)
        z: 12
        visible: lockToastVisible
        opacity: lockToastVisible ? 1 : 0
        color: "#2a1217"
        border.color: "#d7677f"
        implicitHeight: px(92)

        Behavior on opacity {
            NumberAnimation { duration: 160 }
        }

        transform: Translate {
            y: lockToastVisible ? 0 : -16

            Behavior on y {
                NumberAnimation { duration: 180; easing.type: Easing.OutCubic }
            }
        }

        RowLayout {
            anchors.fill: parent
            anchors.margins: px(16)
            spacing: px(12)

            Rectangle {
                Layout.preferredWidth: px(40)
                Layout.preferredHeight: px(40)
                radius: px(20)
                color: "#4a1c24"

                Text {
                    anchors.centerIn: parent
                    text: "!"
                    color: "#ffb3c2"
                    font.pixelSize: px(24)
                    font.bold: true
                }
            }

            ColumnLayout {
                Layout.fillWidth: true
                spacing: 4

                Text {
                    text: "Unlock failed"
                    color: "white"
                    font.pixelSize: px(17)
                    font.bold: true
                }

                Text {
                    text: lockToastMessage
                    color: "#ffd2dc"
                    font.pixelSize: px(15)
                    wrapMode: Text.WordWrap
                    Layout.fillWidth: true
                }
            }
        }
    }

    Rectangle {
        anchors.fill: parent
        visible: !appController.enrollmentRequired && !appController.driverAuthenticated
        z: 9
        color: "#0b1320"
        clip: true

        Rectangle {
            width: parent.width * 0.55
            height: parent.height * 0.6
            x: -parent.width * 0.08
            y: -parent.height * 0.12
            radius: width / 2
            color: "#17304a"
            opacity: 0.55
        }

        Rectangle {
            width: parent.width * 0.42
            height: parent.height * 0.42
            x: parent.width * 0.72
            y: parent.height * 0.7
            radius: width / 2
            color: "#0f2438"
            opacity: 0.75
        }

        ColumnLayout {
            anchors.centerIn: parent
            width: Math.min(parent.width - px(120), Math.max(px(700), parent.width * 0.42))
            spacing: px(24)

            Image {
                Layout.alignment: Qt.AlignHCenter
                Layout.preferredWidth: Math.min(px(420), parent.width)
                Layout.preferredHeight: px(96)
                fillMode: Image.PreserveAspectFit
                mipmap: true
                source: "qrc:/RouteGuard/Bus/assets/text-logo.png"
            }

            Text {
                text: "Device Locked"
                color: "white"
                font.pixelSize: px(48)
                font.bold: true
                horizontalAlignment: Text.AlignHCenter
                Layout.fillWidth: true
            }

            Rectangle {
                Layout.fillWidth: true
                radius: px(18)
                color: appController.driverLoginError.length > 0 ? "#3b1820" : "#0d1828"
                border.color: appController.driverLoginError.length > 0 ? "#d7677f" : "#2d4a69"
                implicitHeight: px(156)

                ColumnLayout {
                    anchors.fill: parent
                    anchors.margins: px(22)
                    spacing: px(12)

                    Text {
                        text: maskedDriverPin()
                        color: "white"
                        font.pixelSize: px(42)
                        font.bold: true
                        font.letterSpacing: px(6)
                        horizontalAlignment: Text.AlignHCenter
                        Layout.fillWidth: true
                    }

                    Text {
                        text: appController.driverLoginPending ? "Checking PIN..." : ""
                        color: "#c8d8ea"
                        font.pixelSize: px(18)
                        horizontalAlignment: Text.AlignHCenter
                        Layout.fillWidth: true
                        visible: text.length > 0
                    }
                }
            }

            GridLayout {
                Layout.fillWidth: true
                columns: 3
                columnSpacing: px(16)
                rowSpacing: px(16)
                enabled: !appController.driverLoginPending

                Repeater {
                    model: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "Clear", "0", "Back"]

                    Button {
                        Layout.fillWidth: true
                        Layout.preferredHeight: px(126)
                        text: modelData
                        font.pixelSize: px(34)
                        font.bold: true

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

        }
    }

    Item {
        anchors.fill: parent
        visible: !appController.enrollmentRequired && appController.driverAuthenticated && appController.uiMode === "driver_home"

        ColumnLayout {
            anchors.fill: parent
            anchors.margins: px(34)
            spacing: px(20)

            RowLayout {
                Layout.fillWidth: true
                Item { Layout.fillWidth: true }
                ChromeButton {
                    text: "More"
                    implicitWidth: px(108)
                    implicitHeight: px(48)
                    onClicked: homeOverflowMenu.open()
                }
            }

            Text {
                text: appController.greeting
                color: "#d8e6f5"
                font.pixelSize: px(44)
                font.bold: true
            }

            Text {
                text: appController.activeDriver
                color: "white"
                font.pixelSize: px(28)
                font.bold: true
            }

            Rectangle {
                Layout.fillWidth: true
                Layout.fillHeight: true
                radius: px(26)
                color: "#f8fbff"
                border.color: "#dce7f3"

                ColumnLayout {
                    anchors.fill: parent
                    anchors.margins: px(22)
                    spacing: px(14)

                    BusyIndicator {
                        Layout.alignment: Qt.AlignHCenter
                        visible: appController.driverHomeLoading
                        running: visible
                    }

                    Text {
                        text: appController.driverHomeError
                        color: "#9f1239"
                        font.pixelSize: px(16)
                        visible: !appController.driverHomeLoading && appController.driverHomeError.length > 0
                    }

                    Text {
                        text: appController.hasAssignedRoute ? appController.selectedRoute.route_code : "No active route assigned for this driver/device right now."
                        color: "#0f172a"
                        font.pixelSize: appController.hasAssignedRoute ? px(34) : px(24)
                        font.bold: true
                        visible: !appController.driverHomeLoading
                    }

                    Text {
                        text: appController.hasAssignedRoute
                              ? appController.selectedRoute.service_window + "  |  " + routeStops(appController.selectedRoute).length + " stops  |  " + appController.selectedRoute.assigned_students + " students"
                              : "Open the map for orientation or wait for dispatch to assign a route."
                        color: "#47617d"
                        font.pixelSize: px(16)
                        wrapMode: Text.WordWrap
                        visible: !appController.driverHomeLoading
                    }

                    ListView {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        spacing: px(10)
                        clip: true
                        visible: !appController.driverHomeLoading && appController.hasAssignedRoute
                        model: routeStops(appController.selectedRoute)

                        delegate: RowLayout {
                            required property var modelData
                            width: ListView.view.width
                            spacing: px(12)

                            Rectangle {
                                Layout.preferredWidth: px(30)
                                Layout.preferredHeight: px(30)
                                radius: px(15)
                                color: "#dbeafe"

                                Text {
                                    anchors.centerIn: parent
                                    text: modelData.stop_order
                                    color: "#1d4ed8"
                                    font.pixelSize: px(14)
                                    font.bold: true
                                }
                            }

                            ColumnLayout {
                                Layout.fillWidth: true
                                spacing: 2

                                Text {
                                    text: modelData.name
                                    color: "#0f172a"
                                    font.pixelSize: px(18)
                                    font.bold: true
                                }

                                Text {
                                    text: modelData.address
                                    color: "#64748b"
                                    font.pixelSize: px(14)
                                    wrapMode: Text.WordWrap
                                    Layout.fillWidth: true
                                }
                            }
                        }
                    }

                    RowLayout {
                        Layout.fillWidth: true
                        spacing: px(14)
                        visible: !appController.driverHomeLoading

                        ChromeButton {
                            text: "Start Route"
                            Layout.fillWidth: true
                            implicitHeight: px(64)
                            enabled: appController.hasAssignedRoute
                            onClicked: appController.startRoute()
                        }

                        ChromeButton {
                            text: "Open Map"
                            Layout.fillWidth: true
                            implicitHeight: px(64)
                            onClicked: appController.openMap()
                        }
                    }
                }
            }
        }
    }

    Item {
        anchors.fill: parent
        visible: !appController.enrollmentRequired && appController.driverAuthenticated && appController.uiMode !== "driver_home"

        Rectangle {
            id: consolePanel
            width: appController.operationsPanelExpanded
                   ? Math.max(px(320), Math.min(Math.round(parent.width * 0.30), px(420)))
                   : px(90)
            anchors.top: parent.top
            anchors.right: parent.right
            anchors.bottom: parent.bottom
            anchors.margins: px(26)
            radius: px(26)
            color: "#f8fbff"
            border.color: "#dce7f3"

            Behavior on width {
                NumberAnimation { duration: 220; easing.type: Easing.OutCubic }
            }

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: px(14)
                spacing: px(12)
                visible: !appController.operationsPanelExpanded

                ChromeButton {
                    text: "Menu"
                    implicitHeight: px(52)
                    onClicked: appController.setOperationsPanelExpanded(true)
                }

                ChromeButton {
                    text: "Home"
                    implicitHeight: px(52)
                    onClicked: appController.showDriverHome()
                }

                ChromeButton {
                    text: appController.routeStarted ? "Sync" : "Start"
                    implicitHeight: px(52)
                    onClicked: appController.routeStarted ? appController.forceSync() : appController.startRoute()
                }

                ChromeButton {
                    text: "More"
                    implicitHeight: px(52)
                    onClicked: consoleOverflowMenu.open()
                }
            }

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: px(16)
                spacing: px(12)
                visible: appController.operationsPanelExpanded

                RowLayout {
                    Layout.fillWidth: true

                    Text {
                        text: appController.routeStarted ? "Active Route" : "Map Console"
                        color: "#0f172a"
                        font.pixelSize: px(22)
                        font.bold: true
                        Layout.fillWidth: true
                    }

                    ChromeButton {
                        text: "Hide"
                        implicitWidth: px(84)
                        implicitHeight: px(40)
                        onClicked: appController.setOperationsPanelExpanded(false)
                    }
                }

                Text {
                    text: appController.hasAssignedRoute ? appController.selectedRoute.route_code : "No route assigned"
                    color: "#0f172a"
                    font.pixelSize: px(28)
                    font.bold: true
                }

                Text {
                    text: stopSummary(appController.selectedStop)
                    color: "#47617d"
                    font.pixelSize: px(15)
                    wrapMode: Text.WordWrap
                }

                Text {
                    text: destinationSummary(appController.selectedDestination)
                    color: "#0f172a"
                    font.pixelSize: px(15)
                    font.bold: true
                    wrapMode: Text.WordWrap
                    visible: appController.selectedDestination.label !== undefined && appController.selectedDestination.label !== ""
                }

                Text {
                    text: appController.navigationError
                    color: "#9f1239"
                    font.pixelSize: px(15)
                    visible: appController.navigationError.length > 0
                    wrapMode: Text.WordWrap
                }

                TextField {
                    id: rfidField
                    Layout.fillWidth: true
                    enabled: appController.routeStarted
                    placeholderText: appController.routeStarted ? "RFID tag" : "Start route to enable boarding"
                    text: rfidTagValue
                    onTextChanged: rfidTagValue = text
                    onAccepted: {
                        appController.submitTag(text)
                        text = ""
                        rfidTagValue = ""
                    }
                }

                RowLayout {
                    Layout.fillWidth: true

                    ChromeButton {
                        text: appController.routeStarted ? "Record Scan" : "Start Route"
                        Layout.fillWidth: true
                        implicitHeight: px(52)
                        onClicked: {
                            if (appController.routeStarted) {
                                appController.submitTag(rfidField.text)
                                rfidField.text = ""
                                rfidTagValue = ""
                            } else {
                                appController.startRoute()
                            }
                        }
                    }

                    ChromeButton {
                        text: "Sync"
                        Layout.fillWidth: true
                        implicitHeight: px(52)
                        onClicked: appController.forceSync()
                    }
                }

                Text {
                    text: appController.lastScan || "No scans recorded yet"
                    color: "#0f172a"
                    font.pixelSize: px(18)
                    font.bold: true
                    wrapMode: Text.WordWrap
                }
            }
        }

        Rectangle {
            anchors.top: parent.top
            anchors.left: parent.left
            anchors.bottom: parent.bottom
            anchors.right: consolePanel.left
            anchors.margins: px(26)
            anchors.rightMargin: px(18)
            radius: px(26)
            color: "#f8fbff"
            border.color: "#dce7f3"
            clip: true

            WebEngineView {
                anchors.fill: parent
                url: "qrc:/RouteGuard/Bus/web/map.html"
                settings.localContentCanAccessRemoteUrls: true
                settings.localContentCanAccessFileUrls: true
                webChannel: WebChannel {
                    Component.onCompleted: registerObject("appController", appController)
                }

                onLoadingChanged: function(loadRequest) {
                    if (loadRequest.status === WebEngineView.LoadStartedStatus) {
                        console.log("Map load started:", loadRequest.url)
                    } else if (loadRequest.status === WebEngineView.LoadSucceededStatus) {
                        console.log("Map load succeeded:", loadRequest.url)
                    } else if (loadRequest.status === WebEngineView.LoadFailedStatus) {
                        console.log("Map load failed:", loadRequest.url, loadRequest.errorString)
                    }
                }

                onJavaScriptConsoleMessage: function(level, message, lineNumber, sourceID) {
                    console.log("Map JS:", level, sourceID + ":" + lineNumber, message)
                }

                onRenderProcessTerminated: function(terminationStatus, exitCode) {
                    console.log("Map render process terminated:", terminationStatus, exitCode)
                }
            }

            Rectangle {
                anchors.top: parent.top
                anchors.left: parent.left
                anchors.margins: px(22)
                width: Math.min(parent.width - px(44), compactLayout ? parent.width * 0.62 : px(420))
                radius: px(22)
                color: "#fbfdff"
                border.color: "#dce7f3"

                ColumnLayout {
                    anchors.fill: parent
                    anchors.margins: px(12)
                    spacing: px(8)

                    RowLayout {
                        Layout.fillWidth: true

                        TextField {
                            id: searchField
                            Layout.fillWidth: true
                            placeholderText: "Search destinations or addresses"
                            text: navigationQuery
                            onTextChanged: {
                                navigationQuery = text
                                navigationSearchTimer.restart()
                            }
                            onAccepted: {
                                if (appController.navigationSearchResults.length > 0) {
                                    appController.selectDestinationResult(appController.navigationSearchResults[0])
                                }
                            }
                        }

                        ChromeButton {
                            text: appController.selectedDestination.label !== undefined && appController.selectedDestination.label !== "" ? "Clear" : "More"
                            implicitWidth: px(92)
                            implicitHeight: px(48)
                            onClicked: {
                                if (appController.selectedDestination.label !== undefined && appController.selectedDestination.label !== "") {
                                    searchField.text = ""
                                    navigationQuery = ""
                                    appController.clearDestination()
                                    appController.clearNavigationSearch()
                                } else {
                                    consoleOverflowMenu.open()
                                }
                            }
                        }
                    }

                    Rectangle {
                        Layout.fillWidth: true
                        radius: px(16)
                        color: "#f5f8fb"
                        border.color: "#dce6f1"
                        visible: appController.navigationSearchPending || appController.navigationSearchResults.length > 0
                        implicitHeight: Math.min(px(220), px(58) + appController.navigationSearchResults.length * px(66))

                        Item {
                            anchors.fill: parent
                            anchors.margins: px(10)

                            BusyIndicator {
                                anchors.centerIn: parent
                                visible: appController.navigationSearchPending
                                running: visible
                            }

                            ListView {
                                anchors.fill: parent
                                spacing: px(8)
                                clip: true
                                visible: !appController.navigationSearchPending
                                model: appController.navigationSearchResults

                                delegate: Rectangle {
                                    required property var modelData
                                    width: ListView.view.width
                                    radius: px(14)
                                    color: "#ffffff"
                                    border.color: "#d7e4f2"
                                    implicitHeight: px(58)

                                    MouseArea {
                                        anchors.fill: parent
                                        onClicked: {
                                            searchField.text = modelData.label
                                            navigationQuery = modelData.label
                                            appController.selectDestinationResult(modelData)
                                        }
                                    }

                                    ColumnLayout {
                                        anchors.fill: parent
                                        anchors.margins: px(12)
                                        spacing: px(2)

                                        Text {
                                            text: modelData.label
                                            color: "#0f172a"
                                            font.pixelSize: px(16)
                                            font.bold: true
                                        }

                                        Text {
                                            text: modelData.address
                                            color: "#64748b"
                                            font.pixelSize: px(13)
                                            wrapMode: Text.WordWrap
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Rectangle {
            anchors.fill: parent
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
