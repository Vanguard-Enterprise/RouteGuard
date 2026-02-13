"use client";

import { useRouter } from "next/navigation";
import { Column, DataTable } from "@/components/dashboard/data-table";
import { StatusBadge } from "@/components/dashboard/status-badge";

interface TripRow {
  id: string;
  date: string;
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  notes: string | null;
  routeName: string;
  routeType: string;
  driverFirstName: string;
  driverLastName: string;
  vehicleName: string;
  vehicleNumber: string | null;
}

interface TripTableProps {
  trips: TripRow[];
}

function formatTime(date: Date | null): string {
  if (!date) return "--";
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(start: Date | null, end: Date | null): string {
  if (!start) return "--";
  const endTime = end ? new Date(end).getTime() : Date.now();
  const diffMs = endTime - new Date(start).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

export function TripTable({ trips }: TripTableProps) {
  const router = useRouter();

  const columns: Column<TripRow>[] = [
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
      cell: (row) => (
        <div>
          <span className="font-medium">{row.routeName}</span>
          <span className="ml-2">
            <StatusBadge status={row.routeType} />
          </span>
        </div>
      ),
    },
    {
      key: "driverFirstName",
      header: "Driver",
      sortable: true,
      searchable: true,
      cell: (row) => `${row.driverFirstName} ${row.driverLastName}`,
    },
    {
      key: "vehicleName",
      header: "Vehicle",
      sortable: true,
      searchable: true,
      cell: (row) =>
        row.vehicleNumber
          ? `${row.vehicleName} (#${row.vehicleNumber})`
          : row.vehicleName,
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      searchable: false,
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "startedAt",
      header: "Started At",
      sortable: true,
      searchable: false,
      cell: (row) => formatTime(row.startedAt),
    },
    {
      key: "duration",
      header: "Duration",
      sortable: false,
      searchable: false,
      cell: (row) => formatDuration(row.startedAt, row.completedAt),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={trips as any}
      searchPlaceholder="Search trips..."
      onRowClick={(row) =>
        router.push(`/dashboard/trips/${(row as any).id}`)
      }
      emptyMessage="No trips found. Trips appear here when drivers start their routes."
    />
  );
}
