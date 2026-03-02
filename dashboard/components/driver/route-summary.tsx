'use client'

interface RouteSummaryProps {
  driverName: string
  routeAssignmentId: string
  onRouteAssignmentChange: (value: string) => void
}

export default function RouteSummary({
  driverName,
  routeAssignmentId,
  onRouteAssignmentChange,
}: RouteSummaryProps) {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="flex flex-col gap-6 w-full max-w-sm">
      <div className="flex flex-col gap-1">
        <p className="text-blue-300 text-sm uppercase tracking-widest">Driver</p>
        <p className="text-white text-2xl font-semibold">{driverName}</p>
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-blue-300 text-sm uppercase tracking-widest">Date</p>
        <p className="text-white text-lg">{today}</p>
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="route-assignment-id"
          className="text-blue-300 text-sm uppercase tracking-widest"
        >
          Route Assignment ID
        </label>
        <input
          id="route-assignment-id"
          type="text"
          value={routeAssignmentId}
          onChange={(e) => onRouteAssignmentChange(e.target.value)}
          placeholder="Enter route assignment ID"
          className="
            w-full px-4 py-3 rounded-lg text-white text-lg
            bg-blue-900 border border-blue-600
            placeholder-blue-400
            focus:outline-none focus:border-amber-400
            transition-colors
          "
        />
      </div>
    </div>
  )
}
