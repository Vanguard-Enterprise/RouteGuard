"use client";

import dynamic from "next/dynamic";
import type { MapMarker } from "@/components/map/map-view";

const MapView = dynamic(() => import("@/components/map/map-view"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[400px] items-center justify-center rounded-md border bg-muted">
      <p className="text-muted-foreground">Loading map...</p>
    </div>
  ),
});

interface TripDetailMapProps {
  markers: MapMarker[];
  routeLine?: [number, number][];
}

export function TripDetailMap({ markers, routeLine }: TripDetailMapProps) {
  return <MapView markers={markers} routeLine={routeLine} />;
}
