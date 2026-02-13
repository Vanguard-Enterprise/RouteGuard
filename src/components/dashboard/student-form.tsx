"use client";

import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2 } from "lucide-react";

const studentSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  studentNumber: z.string().optional().default(""),
  grade: z.string().optional().default(""),
  schoolId: z.string().min(1, "School is required"),
  rfidTagId: z.string().optional().default(""),
  address: z.string().optional().default(""),
  city: z.string().optional().default(""),
  state: z.string().optional().default(""),
  zip: z.string().optional().default(""),
  medicalNotes: z.string().optional().default(""),
  status: z.enum(["active", "inactive", "graduated"]).default("active"),
});

type StudentFormValues = z.infer<typeof studentSchema>;

interface StudentFormProps {
  mode: "create" | "edit";
  schools: { id: string; name: string }[];
  initialData?: StudentFormValues & { id: string };
}

export function StudentForm({ mode, schools, initialData }: StudentFormProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(studentSchema),
    defaultValues: initialData ?? {
      firstName: "",
      lastName: "",
      studentNumber: "",
      grade: "",
      schoolId: "",
      rfidTagId: "",
      address: "",
      city: "",
      state: "",
      zip: "",
      medicalNotes: "",
      status: "active",
    },
  });

  const schoolId = watch("schoolId");
  const status = watch("status");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function onSubmit(data: any) {
    setSubmitting(true);
    setError(null);

    try {
      const url =
        mode === "create"
          ? "/api/students"
          : `/api/students/${initialData?.id}`;
      const method = mode === "create" ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to save student");
      }

      const result = await res.json();

      if (mode === "create" && result.id) {
        router.push(`/dashboard/students/${result.id}`);
      } else if (mode === "edit" && initialData?.id) {
        router.push(`/dashboard/students/${initialData.id}`);
      } else {
        router.push("/dashboard/students");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Card>
        <CardHeader>
          <CardTitle>
            {mode === "create" ? "New Student" : "Edit Student"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name *</Label>
              <Input
                id="firstName"
                {...register("firstName")}
                placeholder="First name"
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
                placeholder="Last name"
              />
              {errors.lastName && (
                <p className="text-sm text-destructive">
                  {errors.lastName.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="studentNumber">Student Number</Label>
              <Input
                id="studentNumber"
                {...register("studentNumber")}
                placeholder="e.g. STU-001"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="grade">Grade</Label>
              <Input
                id="grade"
                {...register("grade")}
                placeholder="e.g. 5th"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>School *</Label>
              <Select
                value={schoolId}
                onValueChange={(val) => setValue("schoolId", val)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a school" />
                </SelectTrigger>
                <SelectContent>
                  {schools.map((school) => (
                    <SelectItem key={school.id} value={school.id}>
                      {school.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.schoolId && (
                <p className="text-sm text-destructive">
                  {errors.schoolId.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="rfidTagId">RFID Tag ID</Label>
              <Input
                id="rfidTagId"
                {...register("rfidTagId")}
                placeholder="Scan or enter RFID tag"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              {...register("address")}
              placeholder="Street address"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input id="city" {...register("city")} placeholder="City" />
            </div>
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
            <Label>Status</Label>
            <Select
              value={status}
              onValueChange={(val) =>
                setValue(
                  "status",
                  val as "active" | "inactive" | "graduated"
                )
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="graduated">Graduated</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="medicalNotes">Medical Notes</Label>
            <Textarea
              id="medicalNotes"
              {...register("medicalNotes")}
              placeholder="Any medical conditions, allergies, or special needs..."
              rows={3}
            />
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === "create" ? "Create Student" : "Save Changes"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
