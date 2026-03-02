'use client'

export interface ScanEvent {
  id: string
  rfid_tag_id: string
  student_name?: string
  scan_type: 'board' | 'exit' | 'unauthorized'
  timestamp: number
}

interface StudentScanListProps {
  stopId: string
  scans: ScanEvent[]
}

const BADGE_STYLES: Record<ScanEvent['scan_type'], { label: string; className: string }> = {
  board: { label: 'Boarded', className: 'bg-green-900 text-green-200' },
  exit: { label: 'Exited', className: 'bg-yellow-900 text-yellow-200' },
  unauthorized: { label: 'Unknown', className: 'bg-red-900 text-red-200' },
}

export default function StudentScanList({ stopId, scans }: StudentScanListProps) {
  if (scans.length === 0) {
    return (
      <div className="text-blue-300 text-sm text-center py-4">
        Awaiting scans for this stop…
      </div>
    )
  }

  return (
    <div className="w-full overflow-auto">
      <table className="w-full text-sm text-left text-blue-100">
        <thead>
          <tr className="border-b border-blue-700">
            <th className="py-2 pr-4 text-blue-300 font-medium">Student</th>
            <th className="py-2 pr-4 text-blue-300 font-medium">Tag</th>
            <th className="py-2 text-blue-300 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {scans.map((scan) => {
            const badge = BADGE_STYLES[scan.scan_type]
            return (
              <tr key={scan.id} className="border-b border-blue-800">
                <td className="py-2 pr-4">
                  {scan.student_name ?? <span className="text-blue-400 italic">Unknown</span>}
                </td>
                <td className="py-2 pr-4 font-mono text-xs text-blue-300">
                  {scan.rfid_tag_id.slice(0, 8)}…
                </td>
                <td className="py-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${badge.className}`}>
                    {badge.label}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="text-xs text-blue-400 mt-2 text-right">Stop: {stopId}</p>
    </div>
  )
}
