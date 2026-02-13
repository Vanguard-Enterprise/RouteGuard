"use client";

import { useRouter } from "next/navigation";
import { Column, DataTable } from "@/components/dashboard/data-table";

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  userCount: number;
  schoolCount: number;
  createdAt: Date | null;
}

interface OrgTableProps {
  organizations: OrgRow[];
}

export function OrgTable({ organizations }: OrgTableProps) {
  const router = useRouter();

  const columns: Column<OrgRow>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      searchable: true,
      cell: (row) => <span className="font-medium">{row.name}</span>,
    },
    {
      key: "slug",
      header: "Slug",
      sortable: true,
      searchable: true,
      cell: (row) => (
        <span className="text-muted-foreground font-mono text-xs">{row.slug}</span>
      ),
    },
    {
      key: "userCount",
      header: "Users",
      sortable: true,
      cell: (row) => row.userCount,
    },
    {
      key: "schoolCount",
      header: "Schools",
      sortable: true,
      cell: (row) => row.schoolCount,
    },
    {
      key: "createdAt",
      header: "Created",
      sortable: true,
      cell: (row) =>
        row.createdAt
          ? new Date(row.createdAt).toLocaleDateString()
          : "--",
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={organizations as any}
      searchPlaceholder="Search organizations..."
      onRowClick={(row) => router.push(`/admin/organizations/${(row as any).id}`)}
      emptyMessage="No organizations found. Create your first organization to get started."
    />
  );
}
