(function () {
  const defaultCenter = [32.7767, -96.797];
  let controller = null;
  let map = null;
  let tileLayer = null;
  let routeLayer = null;
  let directionsLayer = null;
  let stopMarkers = [];
  let destinationMarker = null;
  let mapContainer = null;
  let resizeObserver = null;
  let initialFitComplete = false;
  let tileLayerReady = false;
  let tileLayerFailed = false;

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

  function toLatLngPairs(geometry) {
    if (!geometry || !Array.isArray(geometry.coordinates)) {
      return [];
    }

    return geometry.coordinates
      .filter((coordinate) => Array.isArray(coordinate) && coordinate.length >= 2)
      .map((coordinate) => [coordinate[1], coordinate[0]]);
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
  }

  function fitMap(boundsParts) {
    const bounds = [];
    boundsParts.forEach((part) => {
      if (Array.isArray(part)) {
        part.forEach((item) => bounds.push(item));
      }
    });

    if (bounds.length === 0) {
      if (!initialFitComplete) {
        map.setView(defaultCenter, 11);
      }
      return;
    }

    map.fitBounds(bounds, { padding: [52, 52] });
    initialFitComplete = true;
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
    const directions = state.directions || {};
    const stops = Array.isArray(route.stops) ? route.stops : [];
    const routeGeometry = toLatLngPairs(route.geometry);
    const directionsGeometry = toLatLngPairs(directions.geometry);

    stops.forEach((stop) => {
      const isSelected =
        (selectedStop.id && stop.id === selectedStop.id) ||
        (selectedStop.stop_id && stop.stop_id === selectedStop.stop_id);

      const marker = L.marker([stop.latitude, stop.longitude], {
        icon: createStopIcon(isSelected),
        riseOnHover: true,
      }).addTo(map);

      marker.bindTooltip(stop.name || "Stop", {
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

    if (
      selectedDestination &&
      Number.isFinite(selectedDestination.latitude) &&
      Number.isFinite(selectedDestination.longitude)
    ) {
      destinationMarker = L.marker(
        [selectedDestination.latitude, selectedDestination.longitude],
        { icon: createDestinationIcon(), riseOnHover: true }
      ).addTo(map);
      destinationMarker.bindTooltip(selectedDestination.label || "Destination", {
        direction: "top",
        offset: [0, -8],
      });
    }

    fitMap([
      directionsGeometry.length > 1 ? directionsGeometry : [],
      routeGeometry.length > 1 ? routeGeometry : [],
      stops.map((stop) => [stop.latitude, stop.longitude]),
      destinationMarker ? [[selectedDestination.latitude, selectedDestination.longitude]] : [],
    ]);

    if (stops.length === 0) {
      setStatus(tileLayerFailed ? "Map tiles unavailable" : "No assigned route to display");
      return;
    }

    if (selectedDestination && directionsGeometry.length <= 1) {
      setStatus("Directions unavailable");
      return;
    }

    if (tileLayerFailed) {
      setStatus("Map tiles unavailable");
      return;
    }

    if (!tileLayerReady) {
      setStatus("Loading map");
      return;
    }

    setStatus("");
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
