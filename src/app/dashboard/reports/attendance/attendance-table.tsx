"use client";

import { Column, DataTable } from "@/components/dashboard/data-table";
import { Badge } from "@/components/ui/badge";

interface AttendanceRow {
  studentId: string | null;
  studentName: string;
  studentNumber: string | null;
  schoolName: string | null;
  routeName: string;
  date: string;
  boarded: boolean;
  boardTime: Date | null;
  exitTime: Date | null;
}

interface AttendanceTableProps {
  data: AttendanceRow[];
}

function formatTime(date: Date | null): string {
  if (!date) return "--";
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function AttendanceTable({ data }: AttendanceTableProps) {
  const columns: Column<AttendanceRow>[] = [
    {
      key: "date",
      header: "Date",
      sortable: true,
      searchable: true,
      cell: (row) => <span className="font-medium">{row.date}</span>,
    },
    {
      key: "studentName",
      header: "Student",
      sortable: true,
      searchable: true,
      cell: (row) => (
        <div>
          <span className="font-medium">{row.studentName}</span>
          {row.studentNumber && (
            <span className="ml-2 text-xs text-muted-foreground">
              #{row.studentNumber}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "schoolName",
      header: "School",
      sortable: true,
      searchable: true,
      cell: (row) =>
        row.schoolName || (
          <span className="text-muted-foreground">--</span>
        ),
    },
    {
      key: "routeName",
      header: "Route",
      sortable: true,
      searchable: true,
      cell: (row) => row.routeName,
    },
    {
      key: "boarded",
      header: "Boarded",
      sortable: true,
      searchable: false,
      cell: (row) =>
        row.boarded ? (
          <Badge
            variant="secondary"
            className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
          >
            Yes
          </Badge>
        ) : (
          <Badge
            variant="secondary"
            className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
          >
            No
          </Badge>
        ),
    },
    {
      key: "boardTime",
      header: "Board Time",
      sortable: true,
      searchable: false,
      cell: (row) => formatTime(row.boardTime),
    },
    {
      key: "exitTime",
      header: "Exit Time",
      sortable: true,
      searchable: false,
      cell: (row) => formatTime(row.exitTime),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={data as any}
      searchPlaceholder="Search by student or school..."
      emptyMessage="No attendance data found. Adjust your filters or check back after trips are completed."
    />
  );
}
