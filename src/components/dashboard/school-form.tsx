"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { School } from "@/db/schema";

const schoolSchema = z.object({
  name: z.string().min(1, "School name is required"),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  phone: z.string().optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().email("Invalid email address").optional().or(z.literal("")),
});

type SchoolFormData = z.infer<typeof schoolSchema>;

interface SchoolFormProps {
  school?: School;
}

export function SchoolForm({ school }: SchoolFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isEditing = !!school;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SchoolFormData>({
    resolver: zodResolver(schoolSchema),
    defaultValues: {
      name: school?.name ?? "",
      address: school?.address ?? "",
      city: school?.city ?? "",
      state: school?.state ?? "",
      zip: school?.zip ?? "",
      phone: school?.phone ?? "",
      contactName: school?.contactName ?? "",
      contactEmail: school?.contactEmail ?? "",
    },
  });

  async function onSubmit(data: SchoolFormData) {
    setSubmitting(true);
    setError(null);

    try {
      const url = isEditing ? `/api/schools/${school.id}` : "/api/schools";
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to save school");
      }

      const result = await res.json();

      if (isEditing) {
        router.push(`/dashboard/schools/${school.id}`);
      } else {
        router.push("/dashboard/schools");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Card>
        <CardHeader>
          <CardTitle>{isEditing ? "Edit School" : "New School"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="name">School Name *</Label>
              <Input id="name" {...register("name")} placeholder="Enter school name" />
              {errors.name && (
                <p className="text-sm text-red-600">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" {...register("address")} placeholder="Street address" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input id="city" {...register("city")} placeholder="City" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <Input id="state" {...register("state")} placeholder="State" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="zip">ZIP Code</Label>
                <Input id="zip" {...register("zip")} placeholder="ZIP" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" {...register("phone")} placeholder="(555) 123-4567" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contactName">Contact Name</Label>
              <Input id="contactName" {...register("contactName")} placeholder="Primary contact name" />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="contactEmail">Contact Email</Label>
              <Input
                id="contactEmail"
                type="email"
                {...register("contactEmail")}
                placeholder="contact@school.edu"
              />
              {errors.contactEmail && (
                <p className="text-sm text-red-600">{errors.contactEmail.message}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-4">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : isEditing ? "Update School" : "Create School"}
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
        </CardContent>
      </Card>
    </form>
  );
}
