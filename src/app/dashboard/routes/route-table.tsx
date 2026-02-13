"use client";

import { useRouter } from "next/navigation";
import { Column, DataTable } from "@/components/dashboard/data-table";
import { StatusBadge } from "@/components/dashboard/status-badge";

interface RouteRow {
  id: string;
  name: string;
  type: string;
  status: string;
  stopCount: number;
  estimatedDurationMin: number | null;
  assignment: { vehicleName: string; driverName: string } | null;
  [key: string]: unknown;
}

interface RouteTableProps {
  routes: RouteRow[];
}

export function RouteTable({ routes }: RouteTableProps) {
  const router = useRouter();

  const columns: Column<RouteRow>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      searchable: true,
      cell: (row) => <span className="font-medium">{row.name}</span>,
    },
    {
      key: "type",
      header: "Type",
      sortable: true,
      searchable: false,
      cell: (row) => <StatusBadge status={row.type} />,
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      searchable: false,
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "stopCount",
      header: "Stops",
      sortable: true,
      searchable: false,
      cell: (row) => row.stopCount,
    },
    {
      key: "estimatedDurationMin",
      header: "Est. Duration",
      sortable: true,
      searchable: false,
      cell: (row) =>
        row.estimatedDurationMin != null ? (
          `${row.estimatedDurationMin} min`
        ) : (
          <span className="text-muted-foreground">--</span>
        ),
    },
    {
      key: "assignment",
      header: "Assigned",
      searchable: false,
      cell: (row) =>
        row.assignment ? (
          <div className="text-sm">
            <div>{row.assignment.vehicleName}</div>
            <div className="text-muted-foreground">{row.assignment.driverName}</div>
          </div>
        ) : (
          <span className="text-muted-foreground">Unassigned</span>
        ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={routes as any}
      searchPlaceholder="Search routes..."
      onRowClick={(row) => router.push(`/dashboard/routes/${(row as any).id}`)}
      emptyMessage="No routes found. Create your first route to get started."
    />
  );
}
