"use client";

import { useRouter } from "next/navigation";
import { Column, DataTable } from "@/components/dashboard/data-table";
import { StatusBadge } from "@/components/dashboard/status-badge";
import type { Driver } from "@/db/schema";

interface DriverTableProps {
  drivers: Driver[];
}

export function DriverTable({ drivers }: DriverTableProps) {
  const router = useRouter();

  const columns: Column<Driver>[] = [
    {
      key: "firstName",
      header: "Name",
      sortable: true,
      searchable: true,
      cell: (row) => (
        <span className="font-medium">
          {row.firstName} {row.lastName}
        </span>
      ),
    },
    {
      key: "phone",
      header: "Phone",
      searchable: true,
      cell: (row) =>
        row.phone || <span className="text-muted-foreground">--</span>,
    },
    {
      key: "licenseNumber",
      header: "License Number",
      sortable: true,
      searchable: true,
      cell: (row) =>
        row.licenseNumber || (
          <span className="text-muted-foreground">--</span>
        ),
    },
    {
      key: "licenseExpiry",
      header: "License Expiry",
      sortable: true,
      searchable: false,
      cell: (row) =>
        row.licenseExpiry ? (
          new Date(row.licenseExpiry).toLocaleDateString()
        ) : (
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
      data={drivers as any}
      searchPlaceholder="Search drivers..."
      onRowClick={(row) =>
        router.push(`/dashboard/drivers/${(row as any).id}`)
      }
      emptyMessage="No drivers found. Add your first driver to get started."
    />
  );
}
