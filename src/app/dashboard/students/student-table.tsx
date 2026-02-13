"use client";

import { useRouter } from "next/navigation";
import { Column, DataTable } from "@/components/dashboard/data-table";
import { StatusBadge } from "@/components/dashboard/status-badge";

interface StudentRow {
  id: string;
  firstName: string;
  lastName: string;
  studentNumber: string | null;
  grade: string | null;
  rfidTagId: string | null;
  status: string;
  schoolName: string | null;
  [key: string]: unknown;
}

interface StudentTableProps {
  students: StudentRow[];
}

export function StudentTable({ students }: StudentTableProps) {
  const router = useRouter();

  const columns: Column<StudentRow>[] = [
    {
      key: "lastName",
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
      key: "studentNumber",
      header: "Student Number",
      sortable: true,
      searchable: true,
      cell: (row) =>
        row.studentNumber || (
          <span className="text-muted-foreground">--</span>
        ),
    },
    {
      key: "grade",
      header: "Grade",
      sortable: true,
      searchable: false,
      cell: (row) =>
        row.grade || <span className="text-muted-foreground">--</span>,
    },
    {
      key: "schoolName",
      header: "School",
      sortable: true,
      searchable: true,
      cell: (row) =>
        row.schoolName || <span className="text-muted-foreground">--</span>,
    },
    {
      key: "rfidTagId",
      header: "RFID Tag",
      sortable: false,
      searchable: false,
      cell: (row) =>
        row.rfidTagId ? (
          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
            {row.rfidTagId}
          </code>
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
      data={students as any}
      searchPlaceholder="Search students..."
      onRowClick={(row) =>
        router.push(
          `/dashboard/students/${(row as any).id}`
        )
      }
      emptyMessage="No students found. Add your first student to get started."
    />
  );
}
