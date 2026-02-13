"use client";

import { useRef, useEffect } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { cn } from "@/lib/utils";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

export interface MapMarker {
  lat: number;
  lng: number;
  label?: string;
  color?: string;
}

interface MapViewProps {
  center?: { lat: number; lng: number };
  zoom?: number;
  markers?: MapMarker[];
  routeLine?: [number, number][];
  className?: string;
  onMapClick?: (lngLat: { lng: number; lat: number }) => void;
}

export default function MapView({
  center = { lat: 39.8283, lng: -98.5795 },
  zoom = 4,
  markers = [],
  routeLine,
  className,
  onMapClick,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [center.lng, center.lat],
      zoom,
    });

    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    if (onMapClick) {
      map.on("click", (e) => {
        onMapClick({ lng: e.lngLat.lng, lat: e.lngLat.lat });
      });
    }

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear existing markers
    for (const m of markersRef.current) {
      m.remove();
    }
    markersRef.current = [];

    // Add new markers
    for (const marker of markers) {
      const el = document.createElement("div");
      el.className = "mapboxgl-marker-custom";
      el.style.width = "24px";
      el.style.height = "24px";
      el.style.borderRadius = "50%";
      el.style.backgroundColor = marker.color ?? "#3b82f6";
      el.style.border = "3px solid white";
      el.style.boxShadow = "0 2px 4px rgba(0,0,0,0.3)";
      el.style.cursor = "pointer";

      const m = new mapboxgl.Marker({ element: el })
        .setLngLat([marker.lng, marker.lat])
        .addTo(map);

      if (marker.label) {
        m.setPopup(
          new mapboxgl.Popup({ offset: 16 }).setHTML(
            `<div style="font-size:13px;font-weight:500;padding:2px 4px;">${marker.label}</div>`
          )
        );
      }

      markersRef.current.push(m);
    }

    // Fit bounds to markers if there are any
    if (markers.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      for (const marker of markers) {
        bounds.extend([marker.lng, marker.lat]);
      }
      map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 500 });
    }
  }, [markers]);

  // Draw route line
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function addRoute() {
      // Remove existing route layer/source
      if (map!.getLayer("route-line")) {
        map!.removeLayer("route-line");
      }
      if (map!.getSource("route-source")) {
        map!.removeSource("route-source");
      }

      if (!routeLine || routeLine.length < 2) return;

      map!.addSource("route-source", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: routeLine,
          },
        },
      });

      map!.addLayer({
        id: "route-line",
        type: "line",
        source: "route-source",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#3b82f6",
          "line-width": 4,
          "line-opacity": 0.8,
        },
      });
    }

    if (map.isStyleLoaded()) {
      addRoute();
    } else {
      map.on("style.load", addRoute);
    }

    return () => {
      map.off("style.load", addRoute);
    };
  }, [routeLine]);

  return (
    <div
      ref={containerRef}
      className={cn("h-full w-full min-h-[300px] rounded-lg", className)}
    />
  );
}
