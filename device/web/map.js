(function () {
  const defaultCenter = [32.7767, -96.797];
  let controller = null;
  let map = null;
  let tileLayer = null;
  let routeLayer = null;
  let directionsLayer = null;
  let currentLocationMarker = null;
  let currentLocationAccuracy = null;
  let stopMarkers = [];
  let destinationMarker = null;
  let mapContainer = null;
  let resizeObserver = null;
  let initialFitComplete = false;
  let tileLayerReady = false;
  let tileLayerFailed = false;
  let lastUiMode = "";
  let lastViewportKey = "";
  let lastHadCurrentLocation = false;

  function setStatus(message) {
    const element = document.getElementById("map-status");
    if (element) {
      element.textContent = message;
      element.style.display = message ? "block" : "none";
    }
  }

  function failMap(message) {
    console.error(message);
    setStatus(message);
  }

  function toFiniteNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function toLatLngPairs(geometry) {
    if (!geometry || !Array.isArray(geometry.coordinates)) {
      return [];
    }

    return geometry.coordinates
      .map((coordinate) => {
        if (!Array.isArray(coordinate) || coordinate.length < 2) {
          return null;
        }

        const latitude = toFiniteNumber(coordinate[1]);
        const longitude = toFiniteNumber(coordinate[0]);
        if (latitude === null || longitude === null) {
          return null;
        }

        return [latitude, longitude];
      })
      .filter(Boolean);
  }

  function toPoint(location, fallbackLabel) {
    if (!location || typeof location !== "object") {
      return null;
    }

    const latitude = toFiniteNumber(location.latitude);
    const longitude = toFiniteNumber(location.longitude);
    if (latitude === null || longitude === null) {
      return null;
    }

    const accuracy = toFiniteNumber(location.accuracy);
    return {
      latitude,
      longitude,
      accuracy,
      label: String(location.label || location.name || fallbackLabel || ""),
      address: String(location.address || ""),
    };
  }

  function createStopIcon(isSelected) {
    return L.divIcon({
      className: "routeguard-stop-marker",
      html: `<div class="routeguard-stop-pin${isSelected ? " is-selected" : ""}"></div>`,
      iconSize: isSelected ? [22, 22] : [18, 18],
      iconAnchor: isSelected ? [11, 11] : [9, 9],
    });
  }

  function createDestinationIcon() {
    return L.divIcon({
      className: "routeguard-destination-marker",
      html: '<div class="routeguard-destination-pin"></div>',
      iconSize: [24, 24],
      iconAnchor: [12, 20],
    });
  }

  function buildProxyTileUrl(apiBase, coords) {
    const normalizedBase = String(apiBase || "").replace(/\/+$/, "");
    const upstream = `https://api.mapbox.com/styles/v1/mapbox/navigation-day-v1/tiles/256/${coords.z}/${coords.x}/${coords.y}@2x`;
    return `${normalizedBase}/device/mapbox/proxy?url=${encodeURIComponent(upstream)}`;
  }

  function invalidateMapSize() {
    if (!map) {
      return;
    }

    window.requestAnimationFrame(function () {
      if (map) {
        map.invalidateSize(false);
      }
    });
  }

  function ensureTileLayer(apiBase) {
    if (tileLayer && tileLayer._routeguardApiBase === apiBase) {
      return;
    }

    if (tileLayer) {
      tileLayer.remove();
      tileLayer = null;
    }

    tileLayer = L.tileLayer("", {
      tileSize: 256,
      zoomOffset: 0,
      maxZoom: 18,
      keepBuffer: 4,
      updateWhenIdle: true,
    });
    tileLayer._routeguardApiBase = apiBase;
    tileLayer.getTileUrl = function (coords) {
      return buildProxyTileUrl(apiBase, coords);
    };
    tileLayer.on("loading", function () {
      tileLayerReady = false;
      tileLayerFailed = false;
      setStatus("Loading map");
    });
    tileLayer.on("load", function () {
      tileLayerReady = true;
      tileLayerFailed = false;
      setStatus("");
      invalidateMapSize();
    });
    tileLayer.on("tileerror", function (event) {
      tileLayerReady = false;
      tileLayerFailed = true;
      console.error(
        "Map tile failed",
        event && event.coords ? JSON.stringify(event.coords) : "unknown",
        event && event.tile && event.tile.src ? event.tile.src : ""
      );
      setStatus("Map tiles unavailable");
    });
    tileLayer.addTo(map);
  }

  function clearLayers() {
    stopMarkers.forEach((marker) => marker.remove());
    stopMarkers = [];

    if (routeLayer) {
      routeLayer.remove();
      routeLayer = null;
    }
    if (directionsLayer) {
      directionsLayer.remove();
      directionsLayer = null;
    }
    if (destinationMarker) {
      destinationMarker.remove();
      destinationMarker = null;
    }
    if (currentLocationMarker) {
      currentLocationMarker.remove();
      currentLocationMarker = null;
    }
    if (currentLocationAccuracy) {
      currentLocationAccuracy.remove();
      currentLocationAccuracy = null;
    }
  }

  function setViewToPoint(point, zoom) {
    map.setView([point.latitude, point.longitude], zoom);
    initialFitComplete = true;
    invalidateMapSize();
  }

  function fitPoints(points) {
    if (points.length === 0) {
      if (!initialFitComplete) {
        map.setView(defaultCenter, 11);
        initialFitComplete = true;
      }
      return;
    }

    if (points.length === 1) {
      map.setView(points[0], 14);
      initialFitComplete = true;
      invalidateMapSize();
      return;
    }

    map.fitBounds(points, { padding: [52, 52] });
    initialFitComplete = true;
    invalidateMapSize();
  }

  function updateViewport(state, context) {
    const uiMode = String(state.ui_mode || "");
    const uiModeChanged = uiMode !== lastUiMode;
    const currentLocationAvailable = Boolean(context.currentLocationPoint);
    const currentLocationBecameAvailable = currentLocationAvailable && !lastHadCurrentLocation;

    lastUiMode = uiMode;
    lastHadCurrentLocation = currentLocationAvailable;

    const viewportKey = JSON.stringify({
      mode: uiMode,
      route: String(context.routeId || ""),
      stop: String(context.selectedStopId || ""),
      destination: context.destinationPoint
        ? `${context.destinationPoint.latitude.toFixed(4)},${context.destinationPoint.longitude.toFixed(4)}`
        : "",
      directions: context.directionsGeometry.length > 1 ? 1 : 0,
      stops: context.stopPoints.length,
      hasLocation: currentLocationAvailable ? 1 : 0,
    });

    if (
      initialFitComplete &&
      viewportKey === lastViewportKey &&
      !uiModeChanged &&
      !currentLocationBecameAvailable
    ) {
      return;
    }
    lastViewportKey = viewportKey;

    if (
      (uiModeChanged || currentLocationBecameAvailable) &&
      context.currentLocationPoint &&
      context.directionsGeometry.length <= 1 &&
      !context.destinationPoint
    ) {
      setViewToPoint(context.currentLocationPoint, 15);
      return;
    }

    if (context.directionsGeometry.length > 1) {
      const points = context.directionsGeometry.slice();
      if (context.currentLocationPoint) {
        points.push([context.currentLocationPoint.latitude, context.currentLocationPoint.longitude]);
      }
      if (context.destinationPoint) {
        points.push([context.destinationPoint.latitude, context.destinationPoint.longitude]);
      }
      fitPoints(points);
      return;
    }

    if (context.destinationPoint && context.currentLocationPoint) {
      fitPoints([
        [context.currentLocationPoint.latitude, context.currentLocationPoint.longitude],
        [context.destinationPoint.latitude, context.destinationPoint.longitude],
      ]);
      return;
    }

    if (context.currentLocationPoint && uiMode === "map_only") {
      setViewToPoint(context.currentLocationPoint, 15);
      return;
    }

    if (context.routeGeometry.length > 1) {
      fitPoints(context.routeGeometry);
      return;
    }

    if (context.stopPoints.length > 0) {
      fitPoints(context.stopPoints);
      return;
    }

    if (context.currentLocationPoint) {
      setViewToPoint(context.currentLocationPoint, 15);
      return;
    }

    if (context.destinationPoint) {
      setViewToPoint(context.destinationPoint, 15);
      return;
    }

    fitPoints([]);
  }

  function renderState(state) {
    if (!map || !controller) {
      return;
    }

    clearLayers();
    ensureTileLayer(state.api_base || controller.apiBase);

    const route = state.route || {};
    const selectedStop = state.selected_stop || {};
    const selectedDestination = state.selected_destination || {};
    const currentLocation = state.current_location || {};
    const directions = state.directions || {};
    const stops = Array.isArray(route.stops) ? route.stops : [];
    const routeGeometry = toLatLngPairs(route.geometry);
    const directionsGeometry = toLatLngPairs(directions.geometry);
    const currentLocationPoint = toPoint(currentLocation, "Current location");
    const destinationPoint = toPoint(
      selectedDestination,
      selectedDestination.label || "Destination"
    );
    const stopPoints = [];

    stops.forEach((stop) => {
      const stopPoint = toPoint(stop, stop.name || "Stop");
      if (!stopPoint) {
        return;
      }

      const isSelected =
        (selectedStop.id && stop.id === selectedStop.id) ||
        (selectedStop.stop_id && stop.stop_id === selectedStop.stop_id);

      const marker = L.marker([stopPoint.latitude, stopPoint.longitude], {
        icon: createStopIcon(isSelected),
        riseOnHover: true,
      }).addTo(map);

      marker.bindTooltip(stopPoint.label || "Stop", {
        direction: "top",
        offset: [0, -8],
      });

      marker.on("click", function () {
        const stopId = stop.stop_id || stop.id;
        if (stopId) {
          controller.selectStopAnchor(stopId);
        }
      });

      stopMarkers.push(marker);
      stopPoints.push([stopPoint.latitude, stopPoint.longitude]);
    });

    if (routeGeometry.length > 1) {
      routeLayer = L.polyline(routeGeometry, {
        color: "#2563eb",
        weight: 6,
        opacity: 0.92,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(map);
    }

    if (directionsGeometry.length > 1) {
      directionsLayer = L.polyline(directionsGeometry, {
        color: "#0f172a",
        weight: 5,
        opacity: 0.9,
        dashArray: "10 8",
        lineCap: "round",
        lineJoin: "round",
      }).addTo(map);
    }

    if (destinationPoint) {
      destinationMarker = L.marker(
        [destinationPoint.latitude, destinationPoint.longitude],
        { icon: createDestinationIcon(), riseOnHover: true }
      ).addTo(map);
      destinationMarker.bindTooltip(destinationPoint.label || "Destination", {
        direction: "top",
        offset: [0, -8],
      });
    }

    if (currentLocationPoint) {
      if (Number.isFinite(currentLocationPoint.accuracy) && currentLocationPoint.accuracy > 0) {
        currentLocationAccuracy = L.circle(
          [currentLocationPoint.latitude, currentLocationPoint.longitude],
          {
            radius: Math.min(currentLocationPoint.accuracy, 500),
            color: "#3b82f6",
            weight: 1,
            opacity: 0.45,
            fillColor: "#60a5fa",
            fillOpacity: 0.16,
            interactive: false,
          }
        ).addTo(map);
      }

      currentLocationMarker = L.circleMarker(
        [currentLocationPoint.latitude, currentLocationPoint.longitude],
        {
          radius: 9,
          color: "#ffffff",
          weight: 3,
          fillColor: "#1d4ed8",
          fillOpacity: 1,
          interactive: false,
        }
      ).addTo(map);
      currentLocationMarker.bindTooltip("Current location", {
        direction: "top",
        offset: [0, -10],
      });
    }

    updateViewport(state, {
      routeId: route.id,
      selectedStopId: selectedStop.stop_id || selectedStop.id || "",
      routeGeometry,
      directionsGeometry,
      stopPoints,
      destinationPoint,
      currentLocationPoint,
    });

    if (tileLayerFailed) {
      setStatus("Map tiles unavailable");
      return;
    }

    if (!tileLayerReady) {
      setStatus("Loading map");
      return;
    }

    if (destinationPoint && directionsGeometry.length <= 1) {
      setStatus("Directions unavailable");
      return;
    }

    if (currentLocationPoint || stopPoints.length > 0 || routeGeometry.length > 1) {
      setStatus("");
      return;
    }

    setStatus("Current location unavailable");
  }

  function refreshState() {
    if (!controller) {
      return;
    }
    controller.mapState(function (state) {
      invalidateMapSize();
      renderState(state || {});
    });
  }

  function init() {
    if (typeof L === "undefined") {
      failMap("Map library unavailable");
      return;
    }
    if (typeof QWebChannel === "undefined") {
      failMap("Web channel unavailable");
      return;
    }

    mapContainer = document.getElementById("map");
    map = L.map(mapContainer, {
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
    });
    map.setView(defaultCenter, 11);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    map.whenReady(invalidateMapSize);

    window.addEventListener("resize", invalidateMapSize);
    if (typeof ResizeObserver !== "undefined" && mapContainer) {
      resizeObserver = new ResizeObserver(invalidateMapSize);
      resizeObserver.observe(mapContainer);
    }

    new QWebChannel(qt.webChannelTransport, function (channel) {
      controller = channel.objects.appController;
      controller.mapStateChanged.connect(refreshState);
      refreshState();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.addEventListener("error", function (event) {
    if (event && event.message) {
      failMap(event.message);
      return;
    }
    failMap("Map failed to initialize");
  });
})();
