import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ApplicationWindow {
    visible: true
    width: 1280
    height: 800
    visibility: Window.FullScreen
    title: "RouteGuard Bus"
    color: "#0b1320"

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
                        text: "Driver Session"
                        color: "white"
                        font.pixelSize: 26
                        font.bold: true
                    }

                    TextField {
                        id: driverField
                        Layout.fillWidth: true
                        placeholderText: "Driver name"
                    }

                    Button {
                        text: "Start Driver Session"
                        onClicked: appController.loginDriver(driverField.text)
                    }

                    TextField {
                        id: routeIdField
                        Layout.fillWidth: true
                        placeholderText: "Route ID"
                    }

                    TextField {
                        id: routeCodeField
                        Layout.fillWidth: true
                        placeholderText: "Route code"
                    }

                    Button {
                        text: "Set Active Route"
                        onClicked: appController.selectRoute(routeIdField.text, routeCodeField.text)
                    }

                    Rectangle {
                        Layout.fillWidth: true
                        radius: 14
                        color: "#0d1828"
                        implicitHeight: 120

                        ColumnLayout {
                            anchors.fill: parent
                            anchors.margins: 16
                            spacing: 8

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
                            letterSpacing: appController.fatalError ? 0 : 4
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
