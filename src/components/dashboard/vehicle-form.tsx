"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardFooter,
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
import type { Vehicle } from "@/db/schema";

const vehicleSchema = z.object({
  name: z.string().min(1, "Name is required"),
  number: z.string().optional(),
  capacity: z.coerce.number().int().positive().optional().or(z.literal("")),
  year: z.coerce.number().int().min(1900).max(2100).optional().or(z.literal("")),
  make: z.string().optional(),
  model: z.string().optional(),
  vin: z.string().optional(),
  licensePlate: z.string().optional(),
  status: z.enum(["active", "maintenance", "retired"]),
});

type VehicleFormValues = z.infer<typeof vehicleSchema>;

interface VehicleFormProps {
  mode: "create" | "edit";
  vehicle?: Vehicle;
}

export function VehicleForm({ mode, vehicle }: VehicleFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(vehicleSchema),
    defaultValues: {
      name: vehicle?.name ?? "",
      number: vehicle?.number ?? "",
      capacity: vehicle?.capacity ?? "",
      year: vehicle?.year ?? "",
      make: vehicle?.make ?? "",
      model: vehicle?.model ?? "",
      vin: vehicle?.vin ?? "",
      licensePlate: vehicle?.licensePlate ?? "",
      status: vehicle?.status ?? "active",
    },
  });

  const statusValue = watch("status");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function onSubmit(data: any) {
    setLoading(true);
    setError(null);

    try {
      const body = {
        ...data,
        capacity: data.capacity === "" ? null : data.capacity,
        year: data.year === "" ? null : data.year,
      };

      const url =
        mode === "create"
          ? "/api/vehicles"
          : `/api/vehicles/${vehicle!.id}`;
      const method = mode === "create" ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to save vehicle.");
      }

      const result = await res.json();
      router.push(`/dashboard/vehicles/${result.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Card>
        <CardHeader>
          <CardTitle>
            {mode === "create" ? "Vehicle Details" : "Edit Vehicle Details"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input id="name" {...register("name")} placeholder="Bus 12" />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="number">Number</Label>
              <Input id="number" {...register("number")} placeholder="12" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="capacity">Capacity</Label>
              <Input
                id="capacity"
                type="number"
                {...register("capacity")}
                placeholder="72"
              />
              {errors.capacity && (
                <p className="text-sm text-destructive">
                  {errors.capacity.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="year">Year</Label>
              <Input
                id="year"
                type="number"
                {...register("year")}
                placeholder="2024"
              />
              {errors.year && (
                <p className="text-sm text-destructive">{errors.year.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="make">Make</Label>
              <Input id="make" {...register("make")} placeholder="Blue Bird" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="model">Model</Label>
              <Input
                id="model"
                {...register("model")}
                placeholder="Vision"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="vin">VIN</Label>
              <Input id="vin" {...register("vin")} placeholder="1BAKBCEA..." />
            </div>

            <div className="space-y-2">
              <Label htmlFor="licensePlate">License Plate</Label>
              <Input
                id="licensePlate"
                {...register("licensePlate")}
                placeholder="ABC-1234"
              />
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={statusValue}
                onValueChange={(val) =>
                  setValue("status", val as VehicleFormValues["status"])
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="retired">Retired</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {error && (
            <p className="mt-4 text-sm text-destructive">{error}</p>
          )}
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading
              ? "Saving..."
              : mode === "create"
                ? "Create Vehicle"
                : "Save Changes"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
