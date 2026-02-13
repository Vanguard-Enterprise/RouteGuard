"use client";

import { Column, DataTable } from "@/components/dashboard/data-table";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Badge } from "@/components/ui/badge";

interface RidershipRow {
  id: string;
  date: string;
  totalStudents: number;
  boardedCount: number;
  onTime: boolean;
  delayMinutes: number | null;
  notes: string | null;
  routeName: string;
  routeId: string;
}

interface RidershipTableProps {
  data: RidershipRow[];
}

export function RidershipTable({ data }: RidershipTableProps) {
  const columns: Column<RidershipRow>[] = [
    {
      key: "date",
      header: "Date",
      sortable: true,
      searchable: true,
      cell: (row) => <span className="font-medium">{row.date}</span>,
    },
    {
      key: "routeName",
      header: "Route",
      sortable: true,
      searchable: true,
      cell: (row) => row.routeName,
    },
    {
      key: "totalStudents",
      header: "Total Students",
      sortable: true,
      searchable: false,
      cell: (row) => row.totalStudents,
    },
    {
      key: "boardedCount",
      header: "Boarded",
      sortable: true,
      searchable: false,
      cell: (row) => (
        <span>
          {row.boardedCount}
          {row.totalStudents > 0 && (
            <span className="ml-1 text-muted-foreground text-xs">
              ({Math.round((row.boardedCount / row.totalStudents) * 100)}%)
            </span>
          )}
        </span>
      ),
    },
    {
      key: "onTime",
      header: "On-Time",
      sortable: true,
      searchable: false,
      cell: (row) =>
        row.onTime ? (
          <Badge
            variant="secondary"
            className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
          >
            On Time
          </Badge>
        ) : (
          <Badge
            variant="secondary"
            className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
          >
            Delayed {row.delayMinutes ? `(${row.delayMinutes}m)` : ""}
          </Badge>
        ),
    },
    {
      key: "notes",
      header: "Notes",
      sortable: false,
      searchable: true,
      cell: (row) =>
        row.notes || (
          <span className="text-muted-foreground">--</span>
        ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={data as any}
      searchPlaceholder="Search ridership data..."
      emptyMessage="No ridership data found. Adjust your filters or check back after trips are completed."
    />
  );
}
