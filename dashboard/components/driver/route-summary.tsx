'use client'

interface RoutePreview {
  route_name: string
  route_type: string
  stop_count: number
  vehicle_name: string
  date: string
}

interface RouteSummaryProps {
  driverName: string
  preview: RoutePreview | null
  loading: boolean
  error: string | null
  onRetry?: () => void
}

export default function RouteSummary({ driverName, preview, loading, error, onRetry }: RouteSummaryProps) {
  const dateString = preview
    ? new Date(preview.date + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })

  return (
    <div className="flex flex-col gap-4 w-full max-w-sm">
      {/* Driver */}
      <div
        className="rounded-2xl px-6 py-4 flex flex-col gap-1"
        style={{ background: '#152D47', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <p className="text-blue-300 text-xs uppercase tracking-widest">Driver</p>
        <p className="text-white text-2xl font-semibold">{driverName}</p>
        <p className="text-blue-400 text-sm">{dateString}</p>
      </div>

      {/* Route assignment */}
      <div
        className="rounded-2xl px-6 py-4 flex flex-col gap-3"
        style={{ background: '#152D47', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <p className="text-blue-300 text-xs uppercase tracking-widest">Today&apos;s Assignment</p>

        {loading && (
          <div className="flex items-center gap-3">
            <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-blue-300 text-sm">Loading assignment...</span>
          </div>
        )}

        {!loading && error && (
          <p className="text-red-400 text-sm">{error}</p>
        )}

        {!loading && !error && preview && (
          <div className="flex flex-col gap-2">
            <p style={{ color: '#F5A825' }} className="text-xl font-bold">
              {preview.route_name}
            </p>
            <div className="flex gap-4 text-sm text-blue-300">
              <span>{preview.vehicle_name}</span>
              <span>{preview.stop_count} stops</span>
              <span className="capitalize">{preview.route_type}</span>
            </div>
          </div>
        )}

        {!loading && !error && !preview && (
          <div className="flex flex-col gap-3">
            <p className="text-blue-400 text-sm">No route assigned for today.</p>
            {onRetry && (
              <button
                onClick={onRetry}
                className="self-start text-blue-300 text-xs px-3 py-1.5 rounded-lg border border-blue-700 hover:border-blue-500 transition-colors"
              >
                Retry
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
