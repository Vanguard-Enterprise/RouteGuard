"use client";

import dynamic from "next/dynamic";
import type { MapMarker } from "@/components/map/map-view";

const MapView = dynamic(() => import("@/components/map/map-view"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[400px] bg-muted/50 rounded-lg">
      <p className="text-sm text-muted-foreground">Loading map...</p>
    </div>
  ),
});

interface RouteDetailMapProps {
  markers: MapMarker[];
  routeCoords: [number, number][];
}

export function RouteDetailMap({ markers, routeCoords }: RouteDetailMapProps) {
  return (
    <MapView
      markers={markers}
      routeLine={routeCoords.length >= 2 ? routeCoords : undefined}
      className="h-[400px]"
    />
  );
}
