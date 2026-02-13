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
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
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

const organizationSchema = z.object({
  name: z.string().min(1, "Organization name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  type: z.enum(["district", "company"]),
  timezone: z.string().min(1, "Timezone is required"),
  logoUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  adminEmail: z.string().email("Must be a valid email").optional().or(z.literal("")),
  adminName: z.string().optional(),
});

type OrganizationFormValues = z.infer<typeof organizationSchema>;

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

interface OrganizationFormProps {
  mode: "create" | "edit";
  organization?: Organization;
}

export function OrganizationForm({ mode, organization }: OrganizationFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<OrganizationFormValues>({
    resolver: zodResolver(organizationSchema),
    defaultValues: {
      name: organization?.name ?? "",
      slug: organization?.slug ?? "",
      type: (organization?.type as "district" | "company") ?? "district",
      timezone: organization?.timezone ?? "America/New_York",
      logoUrl: organization?.logoUrl ?? "",
      adminEmail: "",
      adminName: "",
    },
  });

  const typeValue = watch("type");
  const timezoneValue = watch("timezone");

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const name = e.target.value;
    setValue("name", name);
    if (mode === "create") {
      setValue("slug", generateSlug(name));
    }
  }

  async function onSubmit(data: OrganizationFormValues) {
    setLoading(true);
    setError(null);

    try {
      const url =
        mode === "create"
          ? "/api/admin/organizations"
          : `/api/admin/organizations/${organization!.id}`;
      const method = mode === "create" ? "POST" : "PUT";

      const body: Record<string, unknown> = {
        name: data.name,
        slug: data.slug,
        type: data.type,
        timezone: data.timezone,
        logoUrl: data.logoUrl || null,
      };

      if (mode === "create" && data.adminEmail) {
        body.adminEmail = data.adminEmail;
        body.adminName = data.adminName || data.adminEmail;
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to save organization.");
      }

      const result = await res.json();
      router.push(`/admin/organizations/${result.id}`);
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
            {mode === "create" ? "Organization Details" : "Edit Organization"}
          </CardTitle>
          <CardDescription>
            {mode === "create"
              ? "Set up a new organization on the platform."
              : "Update organization information."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Organization Name *</Label>
              <Input
                id="name"
                {...register("name")}
                onChange={handleNameChange}
                placeholder="Lincoln School District"
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">Slug *</Label>
              <Input
                id="slug"
                {...register("slug")}
                placeholder="lincoln-sd"
              />
              {errors.slug && (
                <p className="text-sm text-destructive">{errors.slug.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Unique identifier. Auto-generated from name.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Type *</Label>
              <Select
                value={typeValue}
                onValueChange={(val) => setValue("type", val as "district" | "company")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="district">School District</SelectItem>
                  <SelectItem value="company">Bus Company</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Timezone *</Label>
              <Select
                value={timezoneValue}
                onValueChange={(val) => setValue("timezone", val)}
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
                <p className="text-sm text-destructive">{errors.timezone.message}</p>
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
                <p className="text-sm text-destructive">{errors.logoUrl.message}</p>
              )}
            </div>
          </div>

          {mode === "create" && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-medium mb-3">Create First Admin (Optional)</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Optionally create an org_admin user who can manage this organization.
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="adminEmail">Admin Email</Label>
                    <Input
                      id="adminEmail"
                      type="email"
                      {...register("adminEmail")}
                      placeholder="admin@lincoln.edu"
                    />
                    {errors.adminEmail && (
                      <p className="text-sm text-destructive">{errors.adminEmail.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="adminName">Admin Name</Label>
                    <Input
                      id="adminName"
                      {...register("adminName")}
                      placeholder="Jane Smith"
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
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
                ? "Create Organization"
                : "Save Changes"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
