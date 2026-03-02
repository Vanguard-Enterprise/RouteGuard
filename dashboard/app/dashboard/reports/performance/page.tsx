'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import Papa from 'papaparse'
import { api, DailySummary } from '@/lib/api'
import ReportFilters from '@/components/dashboard/report-filters'
import { DataTable, ColumnDef } from '@/components/dashboard/data-table'

const columns: ColumnDef<DailySummary>[] = [
  { key: 'date', header: 'Date', sortable: true },
  { key: 'route_id', header: 'Route', render: (row) => <span className="font-mono text-xs">{row.route_id.slice(0, 8)}…</span> },
  { key: 'on_time', header: 'On Time', render: (row) => (row.on_time ? 'Yes' : 'No') },
  {
    key: 'delay_minutes',
    header: 'Delay (min)',
    render: (row) => (row.delay_minutes != null ? String(row.delay_minutes) : '—'),
  },
  { key: 'notes', header: 'Notes', render: (row) => row.notes ?? '—' },
]

export default function PerformancePage() {
  const [data, setData] = useState<DailySummary[]>([])
  const [loading, setLoading] = useState(false)

  async function handleFilter(params: { start_date: string; end_date: string; route_id?: string }) {
    setLoading(true)
    try {
      const results = await api.reports.dailySummaries.list(
        Object.fromEntries(
          Object.entries(params).filter(([, v]) => v !== undefined),
        ) as Record<string, string>,
      )
      setData(results)
    } catch {
      setData([])
    } finally {
      setLoading(false)
    }
  }

  function handleExport() {
    const csv = Papa.unparse(
      data.map((row) => ({
        Date: row.date,
        Route: row.route_id,
        'On Time': row.on_time ? 'Yes' : 'No',
        'Delay (min)': row.delay_minutes ?? '',
        Notes: row.notes ?? '',
      })),
    )
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'performance-report.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-brand-navy)' }}>
          Performance Report
        </h1>
        <button
          onClick={handleExport}
          disabled={data.length === 0}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
        >
          <Download size={15} />
          Export CSV
        </button>
      </div>

      <ReportFilters onFilter={handleFilter} />

      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        rowKey={(row) => row.id}
      />
    </div>
  )
}
