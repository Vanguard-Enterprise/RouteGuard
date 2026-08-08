"use client"

import { BusFrontIcon, MapPinIcon } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type FakeBus = {
  id: string
  route: string
  status: "On Time" | "Delayed" | "At Stop" | "Out of Service" | "Emergency"
  x: number
  y: number
}

type FakeBusTrackingMapProps = { mode?: "fleet" | "driver" }

const driverBus: FakeBus = { id: "DEMO-BUS-42", route: "North Loop", status: "On Time", x: 52, y: 48 }
const fakeBuses: FakeBus[] = [
  { id: "BUS-12", route: "North Loop", status: "On Time", x: 21, y: 30 },
  { id: "BUS-21", route: "Riverside", status: "Delayed", x: 39, y: 61 },
  { id: "BUS-07", route: "Oak Ridge", status: "On Time", x: 55, y: 25 },
  { id: "BUS-33", route: "Hillcrest", status: "Out of Service", x: 73, y: 66 },
  { id: "BUS-18", route: "Lakeside", status: "On Time", x: 82, y: 35 },
  { id: "BUS-05", route: "Cedar Run", status: "Emergency", x: 64, y: 82 },
]

function statusColor(status: FakeBus["status"]) {
  return status === "Emergency" ? "#ef4444" : status === "Out of Service" ? "#eab308" : status === "Delayed" ? "#f59e0b" : status === "At Stop" ? "#0ea5e9" : "#10b981"
}

export function FakeBusTrackingMap({ mode = "fleet" }: FakeBusTrackingMapProps = {}) {
  const buses = mode === "driver" ? [driverBus] : fakeBuses
  const mapSurface = (
    <div className={`relative h-full overflow-hidden bg-[#dfe9e5] ${mode === "driver" ? "rounded-[1.65rem] border border-slate-200/90" : "rounded-lg border"}`}>
      <div className="absolute inset-0 opacity-60" style={{ backgroundImage: "linear-gradient(28deg, transparent 47%, #b4cbc2 48%, #b4cbc2 51%, transparent 52%), linear-gradient(112deg, transparent 46%, #c1d4cd 47%, #c1d4cd 52%, transparent 53%), linear-gradient(#c8d9d3 1px, transparent 1px), linear-gradient(90deg, #c8d9d3 1px, transparent 1px)", backgroundSize: "190px 150px, 230px 180px, 36px 36px, 36px 36px" }} />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 800 420" role="img" aria-label="Local demo bus tracking map" preserveAspectRatio="none">
        <path d="M55 330 C150 210 185 315 280 175 S450 70 520 190 S665 330 760 105" fill="none" stroke="#ffffff" strokeWidth="20" opacity=".8" />
        <path d="M55 330 C150 210 185 315 280 175 S450 70 520 190 S665 330 760 105" fill="none" stroke="#91b6a9" strokeWidth="3" strokeDasharray="10 8" />
        <path d="M125 35 C230 130 245 105 330 245 S560 305 675 390" fill="none" stroke="#ffffff" strokeWidth="14" opacity=".75" />
        <path d="M125 35 C230 130 245 105 330 245 S560 305 675 390" fill="none" stroke="#a4c4b8" strokeWidth="2" />
        {buses.map((bus) => <g key={bus.id} transform={`translate(${bus.x * 8}, ${bus.y * 4.2})`}><circle r="15" fill={statusColor(bus.status)} opacity=".2" /><circle r="7" fill={mode === "driver" ? "#2563eb" : statusColor(bus.status)} stroke="white" strokeWidth="3" /><text x="11" y="4" fontSize="12" fill="#334155" fontWeight="600">{bus.id}</text></g>)}
      </svg>
      <div className="absolute bottom-3 right-3 rounded-md border border-slate-900/10 bg-white/90 px-2.5 py-2 text-[11px] text-slate-700 shadow-sm">
        <div className="mb-1.5 font-semibold text-slate-800">Local demo map</div>
        {mode === "fleet" ? ["On Time", "Delayed", "At Stop", "Out of Service", "Emergency"].map((status) => <div className="flex items-center gap-1.5" key={status}><span className="size-2 rounded-full" style={{ backgroundColor: statusColor(status as FakeBus["status"]) }} />{status}</div>) : <div className="flex items-center gap-1.5"><BusFrontIcon className="size-3 text-blue-600" />Your demo bus</div>}
      </div>
    </div>
  )

  if (mode === "driver") return <div className="h-full">{mapSurface}</div>

  return <div className="px-4 lg:px-6"><Card className="@container/card overflow-hidden"><CardHeader><CardTitle className="flex items-center gap-2"><MapPinIcon className="size-4 text-primary" />Local Bus Tracking</CardTitle></CardHeader><CardContent><div className="h-[270px] sm:h-[340px]">{mapSurface}</div></CardContent></Card></div>
}
