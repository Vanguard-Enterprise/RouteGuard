cmake_minimum_required(VERSION 3.21)
project(routeguard-bus VERSION 0.1.2 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

set(ROUTEGUARD_API_BASE "https://api.route-guard.com" CACHE STRING "RouteGuard device API base URL")

configure_file(
    ${CMAKE_CURRENT_SOURCE_DIR}/src/build_config.h.in
    ${CMAKE_CURRENT_BINARY_DIR}/generated/build_config.h
    @ONLY
)

find_package(Qt6 REQUIRED COMPONENTS Core Gui Quick Network Sql WebChannel WebEngineCore WebEngineQuick Widgets)

option(ROUTEGUARD_BUILD_SLINT "Build the Slint-based PIN shell prototype" ON)

if(CMAKE_SYSTEM_NAME STREQUAL "Linux")
    find_package(ALSA REQUIRED)
endif()

qt_standard_project_setup()

qt_add_executable(routeguard-bus
    src/main.cpp
    src/appcontroller.cpp
    src/appcontroller.h
    src/localstore.cpp
    src/localstore.h
    src/routeguardrequestinterceptor.cpp
    src/routeguardrequestinterceptor.h
    src/syncmanager.cpp
    src/syncmanager.h
)

qt_add_qml_module(routeguard-bus
    URI RouteGuard.Bus
    VERSION 1.0
    QML_FILES
        qml/Main.qml
    RESOURCES
        assets/text-logo.png
        web/leaflet.css
        web/leaflet.js
        web/map.css
        web/map.html
        web/map.js
)

target_link_libraries(routeguard-bus PRIVATE
    Qt6::Core
    Qt6::Gui
    Qt6::Quick
    Qt6::Network
    Qt6::Sql
    Qt6::WebChannel
    Qt6::WebEngineCore
    Qt6::WebEngineQuick
)

if(CMAKE_SYSTEM_NAME STREQUAL "Linux")
    target_link_libraries(routeguard-bus PRIVATE ALSA::ALSA)
endif()

target_include_directories(routeguard-bus PRIVATE
    ${CMAKE_CURRENT_BINARY_DIR}/generated
)

if(ROUTEGUARD_BUILD_SLINT)
    find_package(Slint QUIET CONFIG)

    if(NOT Slint_FOUND)
        find_program(
            ROUTEGUARD_CARGO_EXECUTABLE
            cargo
            HINTS
                "$ENV{HOME}/.cargo/bin"
                "$ENV{USERPROFILE}/.cargo/bin"
        )

        if(ROUTEGUARD_CARGO_EXECUTABLE)
            include(FetchContent)

            set(SLINT_FEATURE_BACKEND_QT ON CACHE BOOL "Enable the Slint Qt backend" FORCE)
            set(SLINT_FEATURE_BACKEND_WINIT OFF CACHE BOOL "Disable the Slint winit backend" FORCE)

            FetchContent_Declare(
                Slint
                GIT_REPOSITORY https://github.com/slint-ui/slint.git
                GIT_TAG release/1
                SOURCE_SUBDIR api/cpp
            )
            FetchContent_MakeAvailable(Slint)
            set(Slint_FOUND ON)
        else()
            message(WARNING "Skipping routeguard-bus-slint: no Slint package was found and cargo is unavailable. Install the Slint SDK or Rust/Cargo to enable the Slint shell target.")
        endif()
    endif()
endif()

if(ROUTEGUARD_BUILD_SLINT AND Slint_FOUND)
    add_executable(routeguard-bus-slint
        src/main_slint.cpp
        src/device_ui_controller.cpp
        src/device_ui_controller.h
        src/device_ui_state.h
        src/localstore.cpp
        src/localstore.h
        src/syncmanager.cpp
        src/syncmanager.h
    )

    target_compile_features(routeguard-bus-slint PRIVATE cxx_std_20)
    slint_target_sources(routeguard-bus-slint ui/device_shell.slint)

    target_link_libraries(routeguard-bus-slint PRIVATE
        Slint::Slint
        Qt6::Core
        Qt6::Gui
        Qt6::Network
        Qt6::Sql
        Qt6::Widgets
    )

    if(CMAKE_SYSTEM_NAME STREQUAL "Linux")
        target_link_libraries(routeguard-bus-slint PRIVATE ALSA::ALSA)
    endif()

    target_include_directories(routeguard-bus-slint PRIVATE
        ${CMAKE_CURRENT_BINARY_DIR}/generated
    )

    if(WIN32)
        add_custom_command(
            TARGET routeguard-bus-slint
            POST_BUILD
            COMMAND ${CMAKE_COMMAND} -E copy $<TARGET_RUNTIME_DLLS:routeguard-bus-slint> $<TARGET_FILE_DIR:routeguard-bus-slint>
            COMMAND_EXPAND_LISTS
        )
    endif()
endif()
