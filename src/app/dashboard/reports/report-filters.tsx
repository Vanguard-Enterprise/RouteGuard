"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Filter } from "lucide-react";

interface RouteOption {
  id: string;
  name: string;
}

interface SchoolOption {
  id: string;
  name: string;
}

interface ReportFiltersProps {
  routes: RouteOption[];
  schools: SchoolOption[];
  reportType: "ridership" | "attendance" | "performance";
}

export function ReportFilters({
  routes,
  schools,
  reportType,
}: ReportFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [startDate, setStartDate] = useState(
    searchParams.get("startDate") ?? ""
  );
  const [endDate, setEndDate] = useState(searchParams.get("endDate") ?? "");
  const [routeId, setRouteId] = useState(searchParams.get("routeId") ?? "all");
  const [schoolId, setSchoolId] = useState(
    searchParams.get("schoolId") ?? "all"
  );

  const applyFilters = useCallback(() => {
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    if (routeId && routeId !== "all") params.set("routeId", routeId);
    if (schoolId && schoolId !== "all") params.set("schoolId", schoolId);

    router.push(`${pathname}?${params.toString()}`);
  }, [startDate, endDate, routeId, schoolId, pathname, router]);

  const exportCsv = useCallback(() => {
    const params = new URLSearchParams();
    params.set("type", reportType);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    if (routeId && routeId !== "all") params.set("routeId", routeId);
    if (schoolId && schoolId !== "all") params.set("schoolId", schoolId);

    window.open(`/api/reports/export?${params.toString()}`, "_blank");
  }, [reportType, startDate, endDate, routeId, schoolId]);

  return (
    <div className="flex flex-wrap items-end gap-4 rounded-lg border p-4">
      <div className="space-y-1.5">
        <Label htmlFor="startDate">Start Date</Label>
        <Input
          id="startDate"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-[160px]"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="endDate">End Date</Label>
        <Input
          id="endDate"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="w-[160px]"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Route</Label>
        <Select value={routeId} onValueChange={setRouteId}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Routes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Routes</SelectItem>
            {routes.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>School</Label>
        <Select value={schoolId} onValueChange={setSchoolId}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Schools" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Schools</SelectItem>
            {schools.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button onClick={applyFilters}>
        <Filter className="mr-2 h-4 w-4" />
        Apply
      </Button>

      <Button variant="outline" onClick={exportCsv}>
        <Download className="mr-2 h-4 w-4" />
        Export CSV
      </Button>
    </div>
  );
}
