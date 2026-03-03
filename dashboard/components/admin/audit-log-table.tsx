'use client'

import { type ColumnDef } from '@tanstack/react-table'
import { ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { type AuditLog } from '@/lib/api'
import { AdminDataTable } from '@/components/admin/admin-data-table'

interface AuditLogTableProps {
  logs: AuditLog[]
}

export function AuditLogTable({ logs }: AuditLogTableProps) {
  const columns: ColumnDef<AuditLog>[] = [
    {
      accessorKey: 'action',
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Action
          <ArrowUpDown className="ml-2 size-3.5" />
        </Button>
      ),
      cell: ({ row }) => (
        <span className="font-mono text-sm">{row.original.action}</span>
      ),
    },
    {
      accessorKey: 'actor_id',
      header: 'Actor',
      enableSorting: false,
      cell: ({ row }) => {
        const { actor_id, actor_type } = row.original
        if (!actor_id) return <span className="text-muted-foreground">system</span>
        return (
          <span className="text-sm">
            {actor_type}{' '}
            <span className="text-muted-foreground font-mono">{actor_id.slice(0, 8)}</span>
          </span>
        )
      },
    },
    {
      accessorKey: 'target_id',
      header: 'Target',
      enableSorting: false,
      cell: ({ row }) => {
        const { target_type, target_id } = row.original
        if (!target_type || !target_id) return <span className="text-muted-foreground">—</span>
        return (
          <span className="text-sm">
            {target_type} <span className="font-mono">{target_id.slice(0, 8)}</span>
          </span>
        )
      },
    },
    {
      accessorKey: 'ip_address',
      header: 'IP',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-mono text-sm text-muted-foreground">
          {row.original.ip_address ?? '—'}
        </span>
      ),
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Timestamp
          <ArrowUpDown className="ml-2 size-3.5" />
        </Button>
      ),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {new Date(row.original.created_at).toLocaleString()}
        </span>
      ),
    },
  ]

  return <AdminDataTable columns={columns} data={logs} />
}
