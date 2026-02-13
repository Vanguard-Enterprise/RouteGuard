"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Vehicle, Driver } from "@/db/schema";
import type { MapMarker } from "@/components/map/map-view";
import { geocodeAddress } from "@/lib/mapbox";
import {
  GripVertical,
  Plus,
  Trash2,
  MapPin,
  Search,
} from "lucide-react";

const MapView = dynamic(() => import("@/components/map/map-view"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-muted/50 rounded-lg">
      <p className="text-sm text-muted-foreground">Loading map...</p>
    </div>
  ),
});

interface StopData {
  id?: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  sequenceOrder: number;
  scheduledTime: string | null;
}

interface InitialData {
  id: string;
  name: string;
  type: string;
  status: string;
  description: string | null;
  estimatedDurationMin: number | null;
  stops: StopData[];
}

interface RouteBuilderProps {
  mode: "create" | "edit";
  initialData?: InitialData;
  vehicles: Vehicle[];
  drivers: Driver[];
}

export function RouteBuilder({ mode, initialData, vehicles, drivers }: RouteBuilderProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Route fields
  const [name, setName] = useState(initialData?.name ?? "");
  const [type, setType] = useState(initialData?.type ?? "morning");
  const [status, setStatus] = useState(initialData?.status ?? "draft");
  const [description, setDescription] = useState(initialData?.description ?? "");

  // Stops
  const [stopsList, setStopsList] = useState<StopData[]>(
    initialData?.stops ?? []
  );

  // Address geocoding input
  const [addressInput, setAddressInput] = useState("");
  const [geocoding, setGeocoding] = useState(false);

  // Assignment
  const [vehicleId, setVehicleId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [daysOfWeek, setDaysOfWeek] = useState("MTWRF");

  // Drag state
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  // Handle map click to add stop
  const handleMapClick = useCallback(
    (lngLat: { lng: number; lat: number }) => {
      const newStop: StopData = {
        name: `Stop ${stopsList.length + 1}`,
        address: null,
        lat: lngLat.lat,
        lng: lngLat.lng,
        sequenceOrder: stopsList.length + 1,
        scheduledTime: null,
      };
      setStopsList((prev) => [...prev, newStop]);
    },
    [stopsList.length]
  );

  // Geocode address and add stop
  async function handleAddByAddress() {
    if (!addressInput.trim()) return;
    setGeocoding(true);
    setError(null);

    try {
      const result = await geocodeAddress(addressInput.trim());
      if (!result) {
        setError("Could not find that address. Please try a different query.");
        return;
      }

      const newStop: StopData = {
        name: addressInput.trim(),
        address: addressInput.trim(),
        lat: result.lat,
        lng: result.lng,
        sequenceOrder: stopsList.length + 1,
        scheduledTime: null,
      };
      setStopsList((prev) => [...prev, newStop]);
      setAddressInput("");
    } catch {
      setError("Failed to geocode address.");
    } finally {
      setGeocoding(false);
    }
  }

  // Update a stop field
  function updateStop(index: number, field: keyof StopData, value: any) {
    setStopsList((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }

  // Remove stop
  function removeStop(index: number) {
    setStopsList((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      return updated.map((s, i) => ({ ...s, sequenceOrder: i + 1 }));
    });
  }

  // Drag reorder
  function handleDragStart(index: number) {
    setDragIdx(index);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === index) return;

    setStopsList((prev) => {
      const updated = [...prev];
      const [dragged] = updated.splice(dragIdx, 1);
      updated.splice(index, 0, dragged);
      return updated.map((s, i) => ({ ...s, sequenceOrder: i + 1 }));
    });
    setDragIdx(index);
  }

  function handleDragEnd() {
    setDragIdx(null);
  }

  // Map markers from stops
  const markers: MapMarker[] = stopsList
    .filter((s) => s.lat != null && s.lng != null)
    .map((s, idx) => ({
      lat: s.lat!,
      lng: s.lng!,
      label: `${idx + 1}. ${s.name}`,
      color:
        idx === 0
          ? "#22c55e"
          : idx === stopsList.length - 1
          ? "#ef4444"
          : "#3b82f6",
    }));

  // Route line from stops
  const routeLine: [number, number][] = stopsList
    .filter((s) => s.lat != null && s.lng != null)
    .map((s) => [s.lng!, s.lat!]);

  // Submit
  async function handleSubmit() {
    if (!name.trim()) {
      setError("Route name is required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const routePayload = {
        name: name.trim(),
        type,
        status,
        description: description.trim() || null,
        estimatedDurationMin: null as number | null,
        stops: stopsList.map((s, idx) => ({
          name: s.name,
          address: s.address,
          lat: s.lat,
          lng: s.lng,
          sequenceOrder: idx + 1,
          scheduledTime: s.scheduledTime,
        })),
      };

      const url =
        mode === "edit"
          ? `/api/routes/${initialData!.id}`
          : "/api/routes";
      const method = mode === "edit" ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(routePayload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to save route");
      }

      const savedRoute = await res.json();

      // Create assignment if vehicle and driver selected (new route or explicit assignment)
      if (vehicleId && driverId) {
        const routeId = mode === "edit" ? initialData!.id : savedRoute.id;
        await fetch(`/api/routes/${routeId}/assignments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vehicleId,
            driverId,
            daysOfWeek,
            effectiveDate: new Date().toISOString().split("T")[0],
          }),
        });
      }

      if (mode === "edit") {
        router.push(`/dashboard/routes/${initialData!.id}`);
      } else {
        router.push("/dashboard/routes");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Left Panel: Form */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Route Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="routeName">Route Name *</Label>
              <Input
                id="routeName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Morning Route A"
              />
            </div>

            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="morning">Morning</SelectItem>
                    <SelectItem value="afternoon">Afternoon</SelectItem>
                    <SelectItem value="field_trip">Field Trip</SelectItem>
                    <SelectItem value="activity">Activity</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional route description..."
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        {/* Stops */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Stops ({stopsList.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Add by address */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Enter address to add stop..."
                  value={addressInput}
                  onChange={(e) => setAddressInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddByAddress();
                    }
                  }}
                  className="pl-8"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleAddByAddress}
                disabled={geocoding || !addressInput.trim()}
              >
                {geocoding ? "..." : <Plus className="h-4 w-4" />}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              <MapPin className="inline h-3 w-3 mr-1" />
              You can also click on the map to add a stop.
            </p>

            {/* Stops list */}
            {stopsList.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No stops added yet. Click on the map or enter an address above.
              </div>
            ) : (
              <div className="space-y-2">
                {stopsList.map((stop, idx) => (
                  <div
                    key={idx}
                    className={`flex items-start gap-2 rounded-lg border p-3 transition-colors ${
                      dragIdx === idx ? "border-primary bg-muted/50" : ""
                    }`}
                    draggable
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDragEnd={handleDragEnd}
                  >
                    <div className="flex items-center gap-1 pt-2 cursor-grab active:cursor-grabbing">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-semibold text-muted-foreground w-4">
                        {idx + 1}
                      </span>
                    </div>

                    <div className="flex-1 grid gap-2">
                      <Input
                        placeholder="Stop name"
                        value={stop.name}
                        onChange={(e) => updateStop(idx, "name", e.target.value)}
                        className="h-8 text-sm"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          placeholder="Address"
                          value={stop.address ?? ""}
                          onChange={(e) =>
                            updateStop(idx, "address", e.target.value || null)
                          }
                          className="h-8 text-sm"
                        />
                        <Input
                          type="time"
                          placeholder="Time"
                          value={stop.scheduledTime ?? ""}
                          onChange={(e) =>
                            updateStop(idx, "scheduledTime", e.target.value || null)
                          }
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-red-600 mt-1"
                      onClick={() => removeStop(idx)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Assignment */}
        <Card>
          <CardHeader>
            <CardTitle>Assignment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label>Vehicle</Label>
                <Select value={vehicleId} onValueChange={setVehicleId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select vehicle..." />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name} {v.number ? `(#${v.number})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Driver</Label>
                <Select value={driverId} onValueChange={setDriverId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select driver..." />
                  </SelectTrigger>
                  <SelectContent>
                    {drivers.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.firstName} {d.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="daysOfWeek">Days of Week</Label>
              <Input
                id="daysOfWeek"
                value={daysOfWeek}
                onChange={(e) => setDaysOfWeek(e.target.value)}
                placeholder="MTWRF"
              />
              <p className="text-xs text-muted-foreground">
                M=Monday, T=Tuesday, W=Wednesday, R=Thursday, F=Friday
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting
              ? "Saving..."
              : mode === "edit"
              ? "Update Route"
              : "Create Route"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={submitting}
          >
            Cancel
          </Button>
        </div>
      </div>

      {/* Right Panel: Map */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle>Route Map</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-hidden rounded-b-lg">
            <MapView
              markers={markers}
              routeLine={routeLine.length >= 2 ? routeLine : undefined}
              onMapClick={handleMapClick}
              className="h-[600px]"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
