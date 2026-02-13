"use client";

import { Column, DataTable } from "@/components/dashboard/data-table";
import { Badge } from "@/components/ui/badge";

interface PerformanceRow {
  routeId: string;
  routeName: string;
  totalTrips: number;
  avgDelay: number;
  onTimePercent: number;
  totalStudents: number;
  totalBoarded: number;
}

interface PerformanceTableProps {
  data: PerformanceRow[];
}

export function PerformanceTable({ data }: PerformanceTableProps) {
  const columns: Column<PerformanceRow>[] = [
    {
      key: "routeName",
      header: "Route",
      sortable: true,
      searchable: true,
      cell: (row) => <span className="font-medium">{row.routeName}</span>,
    },
    {
      key: "totalTrips",
      header: "Total Trips",
      sortable: true,
      searchable: false,
      cell: (row) => row.totalTrips,
    },
    {
      key: "avgDelay",
      header: "Avg Delay",
      sortable: true,
      searchable: false,
      cell: (row) => (
        <span
          className={
            row.avgDelay > 5
              ? "text-red-600 font-medium"
              : row.avgDelay > 0
                ? "text-yellow-600"
                : "text-green-600"
          }
        >
          {row.avgDelay} min
        </span>
      ),
    },
    {
      key: "onTimePercent",
      header: "On-Time %",
      sortable: true,
      searchable: false,
      cell: (row) => (
        <Badge
          variant="secondary"
          className={
            row.onTimePercent >= 90
              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
              : row.onTimePercent >= 75
                ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
          }
        >
          {row.onTimePercent}%
        </Badge>
      ),
    },
    {
      key: "totalStudents",
      header: "Total Students",
      sortable: true,
      searchable: false,
      cell: (row) => row.totalStudents,
    },
    {
      key: "totalBoarded",
      header: "Total Boarded",
      sortable: true,
      searchable: false,
      cell: (row) => (
        <span>
          {row.totalBoarded}
          {row.totalStudents > 0 && (
            <span className="ml-1 text-muted-foreground text-xs">
              ({Math.round((row.totalBoarded / row.totalStudents) * 100)}%)
            </span>
          )}
        </span>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={data as any}
      searchPlaceholder="Search routes..."
      emptyMessage="No performance data found. Adjust your filters or check back after trips are completed."
    />
  );
}
