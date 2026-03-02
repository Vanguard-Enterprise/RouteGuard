'use client'

import React, { useEffect, useRef, useState } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown, SearchX } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

export interface ColumnDef<T> {
  key: string
  header: string
  render?: (row: T) => React.ReactNode
  sortable?: boolean
  className?: string
}

interface PaginationProps {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}

interface DataTableProps<T> {
  columns: ColumnDef<T>[]
  data: T[]
  loading?: boolean
  searchPlaceholder?: string
  onSearch?: (query: string) => void
  searchValue?: string
  onSort?: (key: string, direction: 'asc' | 'desc') => void
  pagination?: PaginationProps
}

type SortDirection = 'asc' | 'desc' | null

export function DataTable<T>({
  columns,
  data,
  loading = false,
  searchPlaceholder = 'Search...',
  onSearch,
  searchValue = '',
  onSort,
  pagination,
}: DataTableProps<T>) {
  const [localSearch, setLocalSearch] = useState(searchValue)
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDirection>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync external searchValue changes
  useEffect(() => {
    setLocalSearch(searchValue)
  }, [searchValue])

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setLocalSearch(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onSearch?.(val)
    }, 300)
  }

  function handleSortClick(key: string) {
    let nextDir: SortDirection
    if (sortKey !== key) {
      nextDir = 'asc'
    } else if (sortDir === 'asc') {
      nextDir = 'desc'
    } else {
      nextDir = 'asc'
    }
    setSortKey(key)
    setSortDir(nextDir)
    onSort?.(key, nextDir)
  }

  const totalPages = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize)) : 1

  return (
    <div className="space-y-3">
      {onSearch && (
        <div className="flex items-center gap-2">
          <Input
            placeholder={searchPlaceholder}
            value={localSearch}
            onChange={handleSearchChange}
            className="max-w-xs"
          />
        </div>
      )}

      <div className="rounded-md border bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={col.className}
                >
                  {col.sortable ? (
                    <button
                      onClick={() => handleSortClick(col.key)}
                      className="flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                      {col.header}
                      {sortKey === col.key && sortDir === 'asc' ? (
                        <ChevronUp size={14} />
                      ) : sortKey === col.key && sortDir === 'desc' ? (
                        <ChevronDown size={14} />
                      ) : (
                        <ChevronsUpDown size={14} className="text-muted-foreground" />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, rowIdx) => (
                <TableRow key={rowIdx}>
                  {columns.map((col) => (
                    <TableCell key={col.key} className={col.className}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="py-12 text-center text-muted-foreground"
                >
                  <div className="flex flex-col items-center gap-2">
                    <SearchX size={24} className="text-muted-foreground/50" />
                    <span>No results found.</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              data.map((row, rowIdx) => (
                <TableRow key={rowIdx}>
                  {columns.map((col) => (
                    <TableCell key={col.key} className={col.className}>
                      {col.render
                        ? col.render(row)
                        : String((row as Record<string, unknown>)[col.key] ?? '')}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {pagination && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {pagination.page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              disabled={pagination.page >= totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
