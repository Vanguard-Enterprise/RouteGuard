"use client"

import { MapPinIcon, RadioIcon } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type BusStatus = "On Time" | "Delayed" | "At Stop" | "Out of Service" | "Emergency"

type FakeBus = {
  id: string
  route: string
  status: BusStatus
  x: number
  y: number
  motionPath?: string
  duration: number
}

type FakeBusTrackingMapProps = { mode?: "fleet" | "driver" }

const driverBus: FakeBus = {
  id: "DEMO-BUS-42",
  route: "North Loop",
  status: "On Time",
  x: 628,
  y: 238,
  motionPath: "M628 238 L690 236 L760 236 L830 238 L900 241 L970 246",
  duration: 10,
}

const fakeBuses: FakeBus[] = [
  { id: "BUS-12", route: "North Loop", status: "On Time", x: 180, y: 92, motionPath: "M180 92 L245 135 L320 171 L405 196 L480 220 L545 238 L585 245", duration: 16 },
  { id: "BUS-21", route: "Riverside", status: "Delayed", x: 628, y: 245, motionPath: "M628 245 L615 275 L605 315 L603 360 L606 410 L612 460 L618 512", duration: 20 },
  { id: "BUS-07", route: "Oak Ridge", status: "On Time", x: 690, y: 236, motionPath: "M628 238 L690 236 L760 236 L830 238 L900 241 L970 246", duration: 14 },
  { id: "BUS-33", route: "Hillcrest", status: "Out of Service", x: 870, y: 237, duration: 0 },
  { id: "BUS-18", route: "Lakeside", status: "At Stop", x: 850, y: 170, duration: 0 },
  { id: "BUS-05", route: "Cedar Run", status: "Emergency", x: 606, y: 410, duration: 0 },
]

function statusColor(status: BusStatus) {
  return status === "Emergency" ? "#ef4444" : status === "Out of Service" ? "#eab308" : status === "Delayed" ? "#f59e0b" : status === "At Stop" ? "#0ea5e9" : "#10b981"
}

function isMoving(status: BusStatus) {
  return status === "On Time" || status === "Delayed"
}

export function FakeBusTrackingMap({ mode = "fleet" }: FakeBusTrackingMapProps = {}) {
  const buses = mode === "driver" ? [driverBus] : fakeBuses
  const mapSurface = (
    <div className={`relative h-full overflow-hidden bg-[#e8e5dc] ${mode === "driver" ? "rounded-[1.65rem] border border-slate-200/90" : "rounded-xl border border-slate-300"}`}>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1024 512" role="img" aria-label="Culpeper Virginia street map with live demo buses" preserveAspectRatio="none">
        <image href="/maps/culpeper-streets.webp" x="0" y="0" width="1024" height="512" preserveAspectRatio="none" />
        <rect width="1024" height="512" fill="#0f766e" opacity=".06" />
        <g fill="none" stroke="#0f766e" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2 16" opacity=".6">
          <path d="M132 0 L155 52 L190 92 L245 135 L320 171 L405 196 L480 220 L545 238 L585 245" />
          <path d="M628 245 L615 275 L605 315 L603 360 L606 410 L612 460 L618 512" />
          <path d="M628 238 L690 236 L760 236 L830 238 L900 241 L970 246 L1024 250" />
        </g>
        {buses.map((bus) => {
          const color = mode === "driver" ? "#2563eb" : statusColor(bus.status)
          return (
            <g key={bus.id}>
              {isMoving(bus.status) && bus.motionPath ? <animateMotion path={bus.motionPath} dur={`${bus.duration}s`} repeatCount="indefinite" rotate="0" /> : null}
              <g transform={isMoving(bus.status) ? undefined : `translate(${bus.x}, ${bus.y})`}>
                <circle r="19" fill={color} opacity=".25" />
                <circle r="9" fill={color} stroke="white" strokeWidth="3" />
                <circle r="3" fill="white" opacity=".95" />
                <rect x="14" y="-14" width="68" height="23" rx="11.5" fill="white" opacity=".95" />
                <text x="24" y="2" fontSize="12" fill="#172b3a" fontWeight="700">{bus.id}</text>
              </g>
            </g>
          )
        })}
      </svg>
      <div className="absolute bottom-3 right-3 rounded-xl border border-white/80 bg-white/95 px-3 py-2.5 text-[11px] text-slate-700 shadow-lg">
        <div className="mb-2 flex items-center gap-1.5 font-semibold text-slate-800"><RadioIcon className="size-3 text-emerald-600" />Fleet status</div>
        {(mode === "fleet" ? ["On Time", "Delayed", "At Stop", "Out of Service", "Emergency"] : ["On Time"]).map((status) => <div className="flex items-center gap-2 leading-5" key={status}><span className="size-2 rounded-full ring-2 ring-white" style={{ backgroundColor: statusColor(status as BusStatus) }} />{status}</div>)}
      </div>
      <div className="absolute bottom-2 left-2 rounded bg-white/85 px-1.5 py-0.5 text-[9px] text-slate-600 shadow-sm">© OpenStreetMap contributors</div>
    </div>
  )

  if (mode === "driver") return <div className="h-full">{mapSurface}</div>

  return <div className="px-4 lg:px-6"><Card className="@container/card overflow-hidden border-0 shadow-sm"><CardHeader className="border-b bg-card/80"><CardTitle className="flex items-center gap-2"><MapPinIcon className="size-4 text-primary" />Live Bus Tracking</CardTitle></CardHeader><CardContent className="bg-card p-3 sm:p-4"><div className="h-[300px] sm:h-[360px]">{mapSurface}</div></CardContent></Card></div>
}
