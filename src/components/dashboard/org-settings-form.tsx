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
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Organization } from "@/db/schema";

const US_TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "America/Anchorage", label: "Alaska Time (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (HT)" },
  { value: "America/Phoenix", label: "Arizona (no DST)" },
];

const orgSettingsSchema = z.object({
  name: z.string().min(1, "Organization name is required"),
  timezone: z.string().min(1, "Timezone is required"),
  logoUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
});

type OrgSettingsFormData = z.infer<typeof orgSettingsSchema>;

interface OrgSettingsFormProps {
  organization: Organization;
}

export function OrgSettingsForm({ organization }: OrgSettingsFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<OrgSettingsFormData>({
    resolver: zodResolver(orgSettingsSchema),
    defaultValues: {
      name: organization.name,
      timezone: organization.timezone,
      logoUrl: organization.logoUrl ?? "",
    },
  });

  const currentTimezone = watch("timezone");

  async function onSubmit(data: OrgSettingsFormData) {
    setSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch("/api/settings/organization", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          timezone: data.timezone,
          logoUrl: data.logoUrl || null,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to update organization settings");
      }

      setSuccess(true);
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
          <CardTitle>General</CardTitle>
          <CardDescription>
            Update your organization name, timezone, and branding.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
              Settings updated successfully.
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Organization Name *</Label>
              <Input
                id="name"
                {...register("name")}
                placeholder="Enter organization name"
              />
              {errors.name && (
                <p className="text-sm text-red-600">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={organization.slug}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                The slug cannot be changed after creation.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone *</Label>
              <Select
                value={currentTimezone}
                onValueChange={(value) => setValue("timezone", value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  {US_TIMEZONES.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.timezone && (
                <p className="text-sm text-red-600">{errors.timezone.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="logoUrl">Logo URL</Label>
              <Input
                id="logoUrl"
                {...register("logoUrl")}
                placeholder="https://example.com/logo.png"
              />
              {errors.logoUrl && (
                <p className="text-sm text-red-600">{errors.logoUrl.message}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-4">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
