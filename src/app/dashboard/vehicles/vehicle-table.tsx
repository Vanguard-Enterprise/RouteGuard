"use client";

import { useRouter } from "next/navigation";
import { Column, DataTable } from "@/components/dashboard/data-table";
import { StatusBadge } from "@/components/dashboard/status-badge";
import type { Vehicle } from "@/db/schema";

interface VehicleTableProps {
  vehicles: Vehicle[];
}

export function VehicleTable({ vehicles }: VehicleTableProps) {
  const router = useRouter();

  const columns: Column<Vehicle>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      searchable: true,
      cell: (row) => <span className="font-medium">{row.name}</span>,
    },
    {
      key: "number",
      header: "Number",
      sortable: true,
      searchable: true,
      cell: (row) =>
        row.number || <span className="text-muted-foreground">--</span>,
    },
    {
      key: "capacity",
      header: "Capacity",
      sortable: true,
      searchable: false,
      cell: (row) =>
        row.capacity ?? <span className="text-muted-foreground">--</span>,
    },
    {
      key: "make",
      header: "Year/Make/Model",
      sortable: true,
      searchable: true,
      cell: (row) => {
        const parts = [row.year, row.make, row.model].filter(Boolean);
        return parts.length > 0 ? (
          parts.join(" ")
        ) : (
          <span className="text-muted-foreground">--</span>
        );
      },
    },
    {
      key: "licensePlate",
      header: "License Plate",
      sortable: true,
      searchable: true,
      cell: (row) =>
        row.licensePlate || (
          <span className="text-muted-foreground">--</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      searchable: false,
      cell: (row) => <StatusBadge status={row.status} />,
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={vehicles as any}
      searchPlaceholder="Search vehicles..."
      onRowClick={(row) =>
        router.push(`/dashboard/vehicles/${(row as any).id}`)
      }
      emptyMessage="No vehicles found. Add your first vehicle to get started."
    />
  );
}
