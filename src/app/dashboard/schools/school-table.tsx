"use client";

import { useRouter } from "next/navigation";
import { Column, DataTable } from "@/components/dashboard/data-table";
import type { School } from "@/db/schema";

interface SchoolTableProps {
  schools: School[];
  studentCounts: Record<string, number>;
}

type SchoolRow = School & { studentCount: number };

export function SchoolTable({ schools, studentCounts }: SchoolTableProps) {
  const router = useRouter();

  const rows: SchoolRow[] = schools.map((school) => ({
    ...school,
    studentCount: studentCounts[school.id] ?? 0,
  }));

  const columns: Column<SchoolRow>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      searchable: true,
      cell: (row) => <span className="font-medium">{row.name}</span>,
    },
    {
      key: "city",
      header: "Address",
      sortable: true,
      searchable: true,
      cell: (row) => {
        const parts = [row.city, row.state].filter(Boolean);
        return parts.length > 0 ? parts.join(", ") : <span className="text-muted-foreground">--</span>;
      },
    },
    {
      key: "phone",
      header: "Phone",
      searchable: false,
      cell: (row) => row.phone || <span className="text-muted-foreground">--</span>,
    },
    {
      key: "studentCount",
      header: "Students",
      sortable: true,
      searchable: false,
      cell: (row) => row.studentCount,
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows as any}
      searchPlaceholder="Search schools..."
      onRowClick={(row) => router.push(`/dashboard/schools/${(row as any).id}`)}
      emptyMessage="No schools found. Add your first school to get started."
    />
  );
}
