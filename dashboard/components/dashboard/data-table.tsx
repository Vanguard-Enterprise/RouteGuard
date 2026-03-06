"use client"

import { useState } from "react"
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface RouteRow {
  id: string
  name: string
  status: "active" | "inactive" | "delayed"
  driver: string
  students: number
  stops: number
}

const data: RouteRow[] = [
  { id: "R-001", name: "North Elementary AM", status: "active", driver: "Sarah Johnson", students: 32, stops: 12 },
  { id: "R-002", name: "South Middle PM", status: "active", driver: "Mike Chen", students: 28, stops: 9 },
  { id: "R-003", name: "West High AM", status: "delayed", driver: "James Williams", students: 45, stops: 15 },
  { id: "R-004", name: "East Elementary PM", status: "active", driver: "Lisa Park", students: 22, stops: 8 },
  { id: "R-005", name: "Central Middle AM", status: "inactive", driver: "Tom Garcia", students: 38, stops: 11 },
  { id: "R-006", name: "North High PM", status: "active", driver: "Amy Rodriguez", students: 41, stops: 14 },
  { id: "R-007", name: "South Elementary AM", status: "active", driver: "David Kim", students: 26, stops: 10 },
  { id: "R-008", name: "West Middle PM", status: "delayed", driver: "Rachel Scott", students: 35, stops: 13 },
]

const statusVariant: Record<RouteRow["status"], "default" | "secondary" | "destructive"> = {
  active: "default",
  inactive: "secondary",
  delayed: "destructive",
}

const columns: ColumnDef<RouteRow>[] = [
  { accessorKey: "id", header: "Route ID" },
  { accessorKey: "name", header: "Route Name" },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("status") as RouteRow["status"]
      return <Badge variant={statusVariant[status]}>{status}</Badge>
    },
  },
  { accessorKey: "driver", header: "Driver" },
  { accessorKey: "students", header: "Students" },
  { accessorKey: "stops", header: "Stops" },
]

export function DataTable() {
  const [sorting, setSorting] = useState<SortingState>([])

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div className="px-4 lg:px-6">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No routes found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
