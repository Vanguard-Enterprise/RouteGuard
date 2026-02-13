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
import type { Driver } from "@/db/schema";

const driverSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().optional(),
  licenseNumber: z.string().optional(),
  licenseExpiry: z.string().optional(),
  status: z.enum(["active", "inactive"]),
});

type DriverFormValues = z.infer<typeof driverSchema>;

function formatDateForInput(date: Date | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  return d.toISOString().split("T")[0];
}

interface DriverFormProps {
  mode: "create" | "edit";
  driver?: Driver;
}

export function DriverForm({ mode, driver }: DriverFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<DriverFormValues>({
    resolver: zodResolver(driverSchema),
    defaultValues: {
      firstName: driver?.firstName ?? "",
      lastName: driver?.lastName ?? "",
      phone: driver?.phone ?? "",
      licenseNumber: driver?.licenseNumber ?? "",
      licenseExpiry: formatDateForInput(driver?.licenseExpiry),
      status: driver?.status ?? "active",
    },
  });

  const statusValue = watch("status");

  async function onSubmit(data: DriverFormValues) {
    setLoading(true);
    setError(null);

    try {
      const body = {
        ...data,
        licenseExpiry: data.licenseExpiry || null,
      };

      const url =
        mode === "create"
          ? "/api/drivers"
          : `/api/drivers/${driver!.id}`;
      const method = mode === "create" ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to save driver.");
      }

      const result = await res.json();
      router.push(`/dashboard/drivers/${result.id}`);
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
            {mode === "create" ? "Driver Details" : "Edit Driver Details"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name *</Label>
              <Input
                id="firstName"
                {...register("firstName")}
                placeholder="John"
              />
              {errors.firstName && (
                <p className="text-sm text-destructive">
                  {errors.firstName.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name *</Label>
              <Input
                id="lastName"
                {...register("lastName")}
                placeholder="Doe"
              />
              {errors.lastName && (
                <p className="text-sm text-destructive">
                  {errors.lastName.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                {...register("phone")}
                placeholder="(555) 123-4567"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="licenseNumber">License Number</Label>
              <Input
                id="licenseNumber"
                {...register("licenseNumber")}
                placeholder="CDL-123456"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="licenseExpiry">License Expiry</Label>
              <Input
                id="licenseExpiry"
                type="date"
                {...register("licenseExpiry")}
              />
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={statusValue}
                onValueChange={(val) =>
                  setValue("status", val as DriverFormValues["status"])
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
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
                ? "Create Driver"
                : "Save Changes"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
