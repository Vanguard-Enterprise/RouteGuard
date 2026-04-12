(function () {
  const defaultCenter = [32.7767, -96.797];
  let controller = null;
  let map = null;
  let tileLayer = null;
  let routeLayer = null;
  let directionsLayer = null;
  let stopMarkers = [];
  let destinationMarker = null;
  let initialFitComplete = false;

  function setStatus(message) {
    const element = document.getElementById("map-status");
    if (element) {
      element.textContent = message;
      element.style.display = message ? "block" : "none";
    }
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

  function ensureTileLayer(apiBase) {
    if (tileLayer) {
      return;
    }

    const upstreamTemplate = "https://api.mapbox.com/styles/v1/mapbox/navigation-day-v1/tiles/512/{z}/{x}/{y}@2x";
    const proxyTemplate = `${apiBase}/device/mapbox/proxy?url=${encodeURIComponent(upstreamTemplate)}`;
    tileLayer = L.tileLayer(proxyTemplate, {
      tileSize: 512,
      zoomOffset: -1,
      maxZoom: 18,
      crossOrigin: true,
      updateWhenIdle: true,
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
      setStatus("No assigned route to display");
      return;
    }

    if (selectedDestination && directionsGeometry.length <= 1) {
      setStatus("Directions unavailable");
      return;
    }

    setStatus("");
  }

  function refreshState() {
    if (!controller) {
      return;
    }
    controller.mapState(function (state) {
      renderState(state || {});
    });
  }

  function init() {
    map = L.map("map", {
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
    });
    map.setView(defaultCenter, 11);
    L.control.zoom({ position: "bottomright" }).addTo(map);

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
})();
