'use client'

import { useRef, useState } from 'react'
import Papa from 'papaparse'
import { api } from '@/lib/api'

type Step = 'upload' | 'preview' | 'confirm' | 'done'

interface ParsedRow {
  first_name: string
  last_name: string
  student_number: string
  grade: string
  school_id: string
  status: string
  valid: boolean
}

const EXPECTED_COLUMNS = 'first_name,last_name,student_number,grade,school_id,status'

function parseCSV(text: string): ParsedRow[] {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  })

  return result.data.map((row) => {
    const first_name = row['first_name'] ?? ''
    const last_name = row['last_name'] ?? ''
    const valid = first_name.length > 0 && last_name.length > 0

    return {
      first_name,
      last_name,
      student_number: row['student_number'] ?? '',
      grade: row['grade'] ?? '',
      school_id: row['school_id'] ?? '',
      status: row['status'] ?? 'active',
      valid,
    }
  })
}

export default function ImportWizard() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('upload')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [fileName, setFileName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [importedCount, setImportedCount] = useState(0)
  const [importErrors, setImportErrors] = useState<string[]>([])

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0]
    if (!selected) return
    setFileName(selected.name)
    setFile(selected)
    const reader = new FileReader()
    reader.onload = (evt) => {
      const text = evt.target?.result as string
      const parsed = parseCSV(text)
      setRows(parsed)
      setStep('preview')
    }
    reader.readAsText(selected)
  }

  async function handleImport() {
    if (!file) return
    setStep('confirm')
    setImportedCount(0)
    setImportErrors([])

    try {
      const result = await api.students.import(file)
      setImportedCount(result.imported)
      setImportErrors(result.errors ?? [])
    } catch {
      setImportErrors(['Import failed. Please try again.'])
    }

    setStep('done')
  }

  const validRows = rows.filter((r) => r.valid)
  const invalidRows = rows.filter((r) => !r.valid)

  if (step === 'upload') {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 max-w-lg">
        <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-brand-navy)' }}>
          Upload CSV
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Upload a CSV file to import students in bulk. Expected columns:
        </p>
        <pre className="bg-gray-50 border border-gray-100 rounded-md px-3 py-2 text-xs text-gray-700 mb-6 overflow-x-auto">
          {EXPECTED_COLUMNS}
        </pre>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          onChange={handleFile}
          className="hidden"
          id="csv-upload"
        />
        <label
          htmlFor="csv-upload"
          className="inline-flex items-center gap-2 px-5 py-2 rounded-md text-sm font-semibold text-white cursor-pointer transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--color-brand-navy)' }}
        >
          Choose CSV file
        </label>
      </div>
    )
  }

  if (step === 'preview') {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 max-w-3xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--color-brand-navy)' }}>
              Preview
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {fileName} — {rows.length} rows ({validRows.length} valid, {invalidRows.length}{' '}
              invalid)
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border border-gray-100 mb-5">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-3 py-2 text-left font-medium text-gray-600">First Name</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Last Name</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Student #</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Grade</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">School ID</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={i}
                  className={row.valid ? 'border-b border-gray-50' : 'border-b border-gray-50 bg-red-50'}
                >
                  <td className={`px-3 py-2 ${!row.first_name ? 'text-red-500 font-medium' : ''}`}>
                    {row.first_name || <span className="italic text-red-400">missing</span>}
                  </td>
                  <td className={`px-3 py-2 ${!row.last_name ? 'text-red-500 font-medium' : ''}`}>
                    {row.last_name || <span className="italic text-red-400">missing</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-500">{row.student_number || '—'}</td>
                  <td className="px-3 py-2 text-gray-500">{row.grade || '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">
                    {row.school_id ? row.school_id.slice(0, 12) + (row.school_id.length > 12 ? '…' : '') : '—'}
                  </td>
                  <td className="px-3 py-2 text-gray-500">{row.status || 'active'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {invalidRows.length > 0 && (
          <p className="text-sm text-red-500 mb-4">
            {invalidRows.length} row{invalidRows.length !== 1 ? 's' : ''} highlighted in red will be
            skipped (missing first_name or last_name).
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleImport}
            disabled={validRows.length === 0}
            className="px-5 py-2 rounded-md text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-brand-navy)' }}
          >
            Import {validRows.length} student{validRows.length !== 1 ? 's' : ''}
          </button>
          <button
            onClick={() => {
              setStep('upload')
              setRows([])
              setFileName('')
              if (fileRef.current) fileRef.current.value = ''
            }}
            className="px-5 py-2 rounded-md text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Choose different file
          </button>
        </div>
      </div>
    )
  }

  if (step === 'confirm') {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 max-w-sm">
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-brand-navy)' }}>
          Importing…
        </h2>
        <div className="mb-4">
          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
            <div
              className="h-2 rounded-full animate-pulse"
              style={{ width: '100%', backgroundColor: 'var(--color-brand-navy)' }}
            />
          </div>
        </div>
        <p className="text-sm text-gray-500">Please wait, do not close this page.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 max-w-sm">
      <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-brand-navy)' }}>
        Import Complete
      </h2>
      <div className="space-y-2 mb-6">
        <div className="flex items-center gap-2 text-sm">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
            {importedCount} imported
          </span>
        </div>
        {importErrors.length > 0 && (
          <div className="mt-3">
            <p className="text-sm font-medium text-red-600 mb-1">
              {importErrors.length} error{importErrors.length !== 1 ? 's' : ''}:
            </p>
            <ul className="space-y-1">
              {importErrors.map((err, i) => (
                <li key={i} className="text-xs text-red-500">
                  {err}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <a
        href="/dashboard/students"
        className="inline-flex items-center px-5 py-2 rounded-md text-sm font-semibold text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: 'var(--color-brand-navy)' }}
      >
        View Students
      </a>
    </div>
  )
}
