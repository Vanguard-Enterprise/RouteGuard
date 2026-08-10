"use client"

import { BusFrontIcon, MapPinIcon, RadioIcon } from "lucide-react"
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
  x: 52,
  y: 48,
  motionPath: "M416 202 C470 180 520 205 560 240 S650 280 720 230",
  duration: 9,
}

const fakeBuses: FakeBus[] = [
  { id: "BUS-12", route: "North Loop", status: "On Time", x: 21, y: 30, motionPath: "M168 126 C224 111 240 103 280 175 S360 150 430 105", duration: 12 },
  { id: "BUS-21", route: "Riverside", status: "Delayed", x: 39, y: 61, motionPath: "M312 256 C360 270 410 285 470 300 S570 305 675 390", duration: 15 },
  { id: "BUS-07", route: "Oak Ridge", status: "On Time", x: 55, y: 25, motionPath: "M440 105 C485 88 510 130 520 190 S610 290 700 190", duration: 10 },
  { id: "BUS-33", route: "Hillcrest", status: "Out of Service", x: 73, y: 66, duration: 0 },
  { id: "BUS-18", route: "Lakeside", status: "At Stop", x: 82, y: 35, duration: 0 },
  { id: "BUS-05", route: "Cedar Run", status: "Emergency", x: 64, y: 82, duration: 0 },
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
    <div className={`relative h-full overflow-hidden bg-[#d7ebe6] ${mode === "driver" ? "rounded-[1.65rem] border border-slate-200/90" : "rounded-xl border border-[#b8d4cc]"}`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,.8),transparent_28%),linear-gradient(135deg,#e7f4ef_0%,#c9e4dc_50%,#b9d8d1_100%)]" />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 800 420" role="img" aria-label="Local demo bus tracking map" preserveAspectRatio="none">
        <defs>
          <pattern id="map-grid" width="36" height="36" patternUnits="userSpaceOnUse">
            <path d="M36 0H0V36" fill="none" stroke="#b3d2ca" strokeWidth="1" opacity=".45" />
          </pattern>
          <linearGradient id="water" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#a9d9e1" stopOpacity=".8" />
            <stop offset="1" stopColor="#7bb9c9" stopOpacity=".35" />
          </linearGradient>
          <filter id="bus-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#164e63" floodOpacity=".25" />
          </filter>
        </defs>
        <rect width="800" height="420" fill="url(#map-grid)" />
        <path d="M-40 78 C120 18 165 136 292 86 S497 4 592 88 S720 126 842 76 L842 0 L-40 0Z" fill="#c0dfc7" opacity=".56" />
        <path d="M-20 356 C110 274 169 386 294 328 S502 272 610 342 S744 382 824 320 L824 440 L-20 440Z" fill="#b8d6bb" opacity=".62" />
        <path d="M640 -20 C574 78 690 126 626 213 S626 341 712 455" fill="none" stroke="url(#water)" strokeWidth="30" opacity=".7" />
        <path id="road-north" d="M55 330 C150 210 185 315 280 175 S450 70 520 190 S665 330 760 105" fill="none" stroke="#f8fbfa" strokeWidth="25" opacity=".95" />
        <path d="M55 330 C150 210 185 315 280 175 S450 70 520 190 S665 330 760 105" fill="none" stroke="#6fa99a" strokeWidth="3" strokeDasharray="12 9" />
        <path id="road-riverside" d="M125 35 C230 130 245 105 330 245 S560 305 675 390" fill="none" stroke="#f8fbfa" strokeWidth="17" opacity=".92" />
        <path d="M125 35 C230 130 245 105 330 245 S560 305 675 390" fill="none" stroke="#82b3a4" strokeWidth="2" />
        <path d="M20 180 H218 M412 122 H790 M205 382 H470" stroke="#a6c7bd" strokeWidth="2" strokeDasharray="5 8" opacity=".75" />
        <g fill="#397267" fontFamily="ui-sans-serif,system-ui,sans-serif" fontSize="12" fontWeight="600" opacity=".72">
          <text x="72" y="110">North Ridge</text>
          <text x="315" y="105">Oak Ridge</text>
          <text x="585" y="285">Lakeside</text>
          <text x="115" y="365">Riverside</text>
        </g>
        {buses.map((bus) => {
          const color = mode === "driver" ? "#2563eb" : statusColor(bus.status)
          return (
            <g key={bus.id} filter="url(#bus-shadow)">
              {isMoving(bus.status) && bus.motionPath ? <animateMotion path={bus.motionPath} dur={`${bus.duration}s`} repeatCount="indefinite" rotate="0" /> : null}
              <g transform={isMoving(bus.status) ? undefined : `translate(${bus.x * 8}, ${bus.y * 4.2})`}>
                <circle r="17" fill={color} opacity=".18" />
                <circle r="8" fill={color} stroke="white" strokeWidth="3" />
                <circle r="3" fill="white" opacity=".9" />
                <rect x="12" y="-13" width="62" height="21" rx="10.5" fill="white" opacity=".92" />
                <text x="21" y="1" fontSize="11" fill="#1e3a3a" fontWeight="700">{bus.id}</text>
              </g>
            </g>
          )
        })}
      </svg>
      <div className="absolute bottom-3 right-3 rounded-xl border border-white/70 bg-white/90 px-3 py-2.5 text-[11px] text-slate-700 shadow-lg backdrop-blur-sm">
        <div className="mb-2 flex items-center gap-1.5 font-semibold text-slate-800"><RadioIcon className="size-3 text-emerald-600" />Fleet status</div>
        {(mode === "fleet" ? ["On Time", "Delayed", "At Stop", "Out of Service", "Emergency"] : ["On Time"]).map((status) => <div className="flex items-center gap-2 leading-5" key={status}><span className="size-2 rounded-full ring-2 ring-white" style={{ backgroundColor: statusColor(status as BusStatus) }} />{status}</div>)}
      </div>
    </div>
  )

  if (mode === "driver") return <div className="h-full">{mapSurface}</div>

  return <div className="px-4 lg:px-6"><Card className="@container/card overflow-hidden border-0 shadow-sm"><CardHeader className="border-b bg-card/80"><CardTitle className="flex items-center gap-2"><MapPinIcon className="size-4 text-primary" />Live Bus Tracking</CardTitle></CardHeader><CardContent className="bg-card p-3 sm:p-4"><div className="h-[300px] sm:h-[360px]">{mapSurface}</div><div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><BusFrontIcon className="size-3.5" />{buses.length} buses tracked</span></div></CardContent></Card></div>
}
