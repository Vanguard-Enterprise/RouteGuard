cmake_minimum_required(VERSION 3.21)
project(routeguard-bus VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

find_package(Qt6 REQUIRED COMPONENTS Core Gui Quick Network Sql)

qt_standard_project_setup()

qt_add_executable(routeguard-bus
    src/main.cpp
    src/appcontroller.cpp
    src/appcontroller.h
    src/localstore.cpp
    src/localstore.h
    src/syncmanager.cpp
    src/syncmanager.h
)

qt_add_qml_module(routeguard-bus
    URI RouteGuard.Bus
    VERSION 1.0
    QML_FILES
        qml/Main.qml
)

target_link_libraries(routeguard-bus PRIVATE
    Qt6::Core
    Qt6::Gui
    Qt6::Quick
    Qt6::Network
    Qt6::Sql
)
