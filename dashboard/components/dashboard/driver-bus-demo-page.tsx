"use client"

import type { CSSProperties, ReactNode } from "react"
import { useEffect, useState } from "react"
import {
  DeleteIcon,
  LogOutIcon,
  MinusIcon,
  PlayIcon,
  RouteIcon,
  SearchIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react"

import { FakeBusTrackingMap } from "@/components/dashboard/fake-bus-tracking-map"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Toaster, toast } from "sonner"

type DemoRoute = {
  id: string
  route_name: string
  stops: number
  eta_minutes: number
  pickup_time: string
  school_name: string
  status: "On Time" | "Delayed" | "At Stop"
}

type DemoAddressResult = {
  id: string
  label: string
  detail: string
}

type ActiveSheet = "route" | "search" | "panic" | null
type RouteStage = "pretrip" | "boarding" | "enroute" | "dropoff" | "completed"
type BoardingState = "pending" | "scanned" | "manual" | "skipped" | "absent"
type OffboardingState = "not-needed" | "pending" | "scanned" | "confirmed"
type ScanTone = "green" | "red" | "blue"

type DemoStudent = {
  id: string
  name: string
  grade: string
  seatLabel: string
  pickupStop: string
  dropoffStop: string
  boarding: BoardingState
  offboarding: OffboardingState
}

type ScreenPulse = {
  id: number
  tone: ScanTone
}

type ConfirmationSheet =
  | {
      kind: "continue-route"
      studentIds: string[]
    }
  | {
      kind: "end-route"
      studentIds: string[]
    }
  | null

const demoBusId = "DEMO-BUS-42"

const demoRoute: DemoRoute = {
  id: "R-101",
  route_name: "North Loop",
  stops: 8,
  eta_minutes: 27,
  pickup_time: "6:45 AM",
  school_name: "North Ridge Elementary",
  status: "On Time",
}

const demoAddressResults: DemoAddressResult[] = [
  { id: "ADDR-1", label: "200 Elm St", detail: "Dallas, TX 75201" },
  { id: "ADDR-2", label: "1201 Main St", detail: "Dallas, TX 75202" },
  { id: "ADDR-3", label: "400 Young St", detail: "Dallas, TX 75202" },
]

const keypadDigits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]
const driverDemoToasterId = "driver-demo-screen"
const driverToastClassNames = {
  toast: "driver-screen-toast",
  content: "driver-screen-toast-content",
  title: "driver-screen-toast-title",
  description: "driver-screen-toast-description",
  icon: "driver-screen-toast-icon",
}
const busSeatRows = [
  ["1A", "1B"],
  ["2A", "2B"],
  ["3A", "3B"],
  ["4A", "4B"],
  ["5A", "5B"],
]

function createDemoStudents(): DemoStudent[] {
  return [
    {
      id: "STU-1",
      name: "Maya Chen",
      grade: "4th Grade",
      seatLabel: "1A",
      pickupStop: "Harwood District",
      dropoffStop: "North Ridge Front Loop",
      boarding: "pending",
      offboarding: "not-needed",
    },
    {
      id: "STU-2",
      name: "Julian Cruz",
      grade: "3rd Grade",
      seatLabel: "1B",
      pickupStop: "Elm & Ervay",
      dropoffStop: "North Ridge Front Loop",
      boarding: "pending",
      offboarding: "not-needed",
    },
    {
      id: "STU-3",
      name: "Ari Brooks",
      grade: "5th Grade",
      seatLabel: "2A",
      pickupStop: "Main & Field",
      dropoffStop: "North Ridge West Door",
      boarding: "absent",
      offboarding: "not-needed",
    },
    {
      id: "STU-4",
      name: "Leah Patel",
      grade: "2nd Grade",
      seatLabel: "2B",
      pickupStop: "Young & Griffin",
      dropoffStop: "North Ridge West Door",
      boarding: "pending",
      offboarding: "not-needed",
    },
  ]
}

function getFirstActionableStudentId(students: DemoStudent[], routeStage: RouteStage) {
  if (routeStage === "boarding") {
    return students.find((student) => student.boarding === "pending")?.id ?? null
  }

  if (routeStage === "dropoff") {
    return students.find((student) => student.offboarding === "pending")?.id ?? null
  }

  return null
}

function boardingBadgeLabel(state: BoardingState) {
  if (state === "scanned") return "Scanned On"
  if (state === "manual") return "Manual Board"
  if (state === "skipped") return "Skipped"
  if (state === "absent") return "Absent"
  return "Waiting"
}

function boardingBadgeClass(state: BoardingState) {
  if (state === "scanned") return "border-emerald-500/30 bg-emerald-500/12 text-emerald-700"
  if (state === "manual") return "border-amber-500/30 bg-amber-500/12 text-amber-700"
  if (state === "skipped") return "border-slate-400/30 bg-slate-400/12 text-slate-700"
  if (state === "absent") return "border-rose-500/30 bg-rose-500/12 text-rose-700"
  return "border-slate-300/70 bg-white text-slate-600"
}

function offboardingBadgeLabel(state: OffboardingState) {
  if (state === "scanned") return "Scanned Off"
  if (state === "confirmed") return "Driver Confirmed"
  if (state === "pending") return "Waiting"
  return "Not Riding"
}

function offboardingBadgeClass(state: OffboardingState) {
  if (state === "scanned") return "border-emerald-500/30 bg-emerald-500/12 text-emerald-700"
  if (state === "confirmed") return "border-amber-500/30 bg-amber-500/12 text-amber-700"
  if (state === "pending") return "border-slate-300/70 bg-white text-slate-600"
  return "border-slate-300/40 bg-slate-100 text-slate-500"
}

function pulseToneStyle(tone: ScanTone): CSSProperties {
  if (tone === "green") {
    return {
      ["--pulse-core" as string]: "rgba(16, 185, 129, 0.95)",
      ["--pulse-glow" as string]: "rgba(16, 185, 129, 0.42)",
      ["--pulse-fade" as string]: "rgba(16, 185, 129, 0.16)",
    }
  }

  if (tone === "red") {
    return {
      ["--pulse-core" as string]: "rgba(244, 63, 94, 0.98)",
      ["--pulse-glow" as string]: "rgba(244, 63, 94, 0.44)",
      ["--pulse-fade" as string]: "rgba(244, 63, 94, 0.18)",
    }
  }

  return {
    ["--pulse-core" as string]: "rgba(14, 165, 233, 0.94)",
    ["--pulse-glow" as string]: "rgba(14, 165, 233, 0.4)",
    ["--pulse-fade" as string]: "rgba(14, 165, 233, 0.16)",
  }
}

function nextClockLabel() {
  return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

function nextDriverName() {
  const names = ["Avery", "Jordan", "Taylor", "Reese", "Skyler", "Parker", "Quinn", "Rowan"]
  return names[Math.floor(Math.random() * names.length)]
}

export function DriverBusDemoPage() {
  const [pin, setPin] = useState("")
  const [pinError, setPinError] = useState("")
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [routeStage, setRouteStage] = useState<RouteStage>("pretrip")
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null)
  const [confirmationSheet, setConfirmationSheet] = useState<ConfirmationSheet>(null)
  const [isBoardingTrayMinimized, setIsBoardingTrayMinimized] = useState(false)
  const [clockText, setClockText] = useState(() => nextClockLabel())
  const [driverName] = useState(() => nextDriverName())
  const [addressQuery, setAddressQuery] = useState("")
  const [panicSent, setPanicSent] = useState(false)
  const [students, setStudents] = useState<DemoStudent[]>(() => createDemoStudents())
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [screenPulse, setScreenPulse] = useState<ScreenPulse | null>(null)

  const showMap =
    routeStage === "pretrip" ||
    routeStage === "enroute" ||
    routeStage === "completed" ||
    ((routeStage === "boarding" || routeStage === "dropoff") && isBoardingTrayMinimized)
  const actionableStudents =
    routeStage === "boarding"
      ? students.filter((student) => student.boarding === "pending")
      : routeStage === "dropoff"
        ? students.filter((student) => student.offboarding === "pending")
        : []
  const filteredAddresses = demoAddressResults.filter((result) => {
    const query = addressQuery.trim().toLowerCase()
    if (!query) return true
    return `${result.label} ${result.detail}`.toLowerCase().includes(query)
  })
  const boardingPendingStudents = students.filter((student) => student.boarding === "pending")
  const boardedStudents = students.filter(
    (student) => student.boarding === "scanned" || student.boarding === "manual"
  )
  const clearedDropoffs = students.filter(
    (student) => student.offboarding === "scanned" || student.offboarding === "confirmed"
  )
  const dropoffPendingStudents = students.filter((student) => student.offboarding === "pending")

  useEffect(() => {
    const clockInterval = setInterval(() => {
      setClockText(nextClockLabel())
    }, 30000)

    return () => clearInterval(clockInterval)
  }, [])

  function pushScanEvent(tone: ScanTone, title: string, detail: string) {
    setScreenPulse({ id: Date.now(), tone })
    const duration = tone === "red" ? 2800 : tone === "blue" ? 2200 : 2400
    const toastOptions = {
      description: detail,
      duration,
      toasterId: driverDemoToasterId,
      style: {
        ["--driver-toast-duration" as string]: `${duration}ms`,
      } as CSSProperties,
    }

    if (tone === "green") {
      toast.success(title, toastOptions)
      return
    }

    if (tone === "red") {
      toast.error(title, toastOptions)
      return
    }

    toast.info(title, toastOptions)
  }

  function resetRouteState() {
    setRouteStage("pretrip")
    setActiveSheet("route")
    setConfirmationSheet(null)
    setIsBoardingTrayMinimized(false)
    setStudents(createDemoStudents())
    setSelectedStudentId(null)
    setScreenPulse(null)
  }

  function handleDigitTap(digit: string) {
    if (pin.length >= 4) return
    const nextPin = `${pin}${digit}`
    setPin(nextPin)
    if (pinError) setPinError("")
    if (nextPin.length === 4) {
      setIsUnlocked(true)
      setActiveSheet("route")
      setPinError("")
    }
  }

  function handleDeleteTap() {
    setPin((current) => current.slice(0, -1))
    if (pinError) setPinError("")
  }

  function handleStartRoute() {
    const nextStudents = createDemoStudents()
    setRouteStage("boarding")
    setActiveSheet(null)
    setConfirmationSheet(null)
    setIsBoardingTrayMinimized(false)
    setStudents(nextStudents)
    setSelectedStudentId(getFirstActionableStudentId(nextStudents, "boarding"))
  }

  function handleSuccessfulScan(studentId: string) {
    const student = students.find((item) => item.id === studentId)
    if (!student) return
    setSelectedStudentId(studentId)

    if (routeStage === "boarding" && student.boarding === "pending") {
      setStudents((current) =>
        current.map((student) =>
          student.id === studentId ? { ...student, boarding: "scanned" } : student
        )
      )
      pushScanEvent("green", `${student.name} scanned on`, `Correct bus and stop: ${student.pickupStop}`)
      return
    }

    if (routeStage === "dropoff" && student.offboarding === "pending") {
      setStudents((current) =>
        current.map((student) =>
          student.id === studentId ? { ...student, offboarding: "scanned" } : student
        )
      )
      pushScanEvent("green", `${student.name} scanned off`, `Correct get off point: ${student.dropoffStop}`)
    }
  }

  function handleWrongBusScan(studentId: string) {
    const student = students.find((item) => item.id === studentId)
    if (!student) return
    setSelectedStudentId(studentId)
    const detail =
      routeStage === "boarding"
        ? `Wrong bus for ${student.name}.`
        : `Wrong drop off stop: ${student.dropoffStop}`
    pushScanEvent("red", `${student.name} rejected`, detail)
  }

  function handleBadReadScan() {
    pushScanEvent("blue", "Card unreadable", "Bad read on card. Ask the student to rescan.")
  }

  function handleOverrideStudent(studentId: string) {
    const student = students.find((item) => item.id === studentId)
    if (!student) return
    setSelectedStudentId(studentId)

    if (routeStage === "boarding" && student.boarding === "pending") {
      setStudents((current) =>
        current.map((item) =>
          item.id === studentId ? { ...item, boarding: "manual" } : item
        )
      )
      pushScanEvent("green", `${student.name} overridden`, "Manually boarded from display.")
      return
    }

    if (routeStage === "dropoff" && student.offboarding === "pending") {
      setStudents((current) =>
        current.map((item) =>
          item.id === studentId ? { ...item, offboarding: "confirmed" } : item
        )
      )
      pushScanEvent("green", `${student.name} overridden`, "Driver confirmed drop off from display.")
    }
  }

  function handleSkipStudent(studentId: string) {
    const student = students.find((item) => item.id === studentId)
    if (!student || routeStage !== "boarding" || student.boarding !== "pending") return
    setSelectedStudentId(studentId)
    setStudents((current) =>
      current.map((student) =>
        student.id === studentId ? { ...student, boarding: "skipped" } : student
      )
    )
  }

  function moveRouteToEnroute(markMissingAsManual: boolean) {
    setStudents((current) =>
      current.map((student) => {
        if (student.boarding === "pending" && markMissingAsManual) {
          return { ...student, boarding: "manual", offboarding: "pending" }
        }
        if (student.boarding === "scanned" || student.boarding === "manual") {
          return { ...student, offboarding: "pending" }
        }
        return { ...student, offboarding: "not-needed" }
      })
    )
    setRouteStage("enroute")
    setConfirmationSheet(null)
    setSelectedStudentId(null)
    setIsBoardingTrayMinimized(false)
  }

  function handleContinueRoute() {
    if (boardingPendingStudents.length > 0) {
      setConfirmationSheet({
        kind: "continue-route",
        studentIds: boardingPendingStudents.map((student) => student.id),
      })
      return
    }
    moveRouteToEnroute(false)
  }

  function handleBeginDropoff() {
    setRouteStage("dropoff")
    setIsBoardingTrayMinimized(false)
    setSelectedStudentId(getFirstActionableStudentId(students, "dropoff"))
  }

  function finalizeRoute(confirmRemainingRiders: boolean) {
    if (confirmRemainingRiders) {
      setStudents((current) =>
        current.map((student) =>
          student.offboarding === "pending" ? { ...student, offboarding: "confirmed" } : student
        )
      )
    }
    setRouteStage("completed")
    setConfirmationSheet(null)
    setSelectedStudentId(null)
    setActiveSheet(null)
  }

  function handleEndRoute() {
    if (dropoffPendingStudents.length > 0) {
      setConfirmationSheet({
        kind: "end-route",
        studentIds: dropoffPendingStudents.map((student) => student.id),
      })
      return
    }
    finalizeRoute(false)
  }

  function handleConfirmSheet() {
    if (!confirmationSheet) return
    if (confirmationSheet.kind === "continue-route") {
      moveRouteToEnroute(true)
      return
    }
    finalizeRoute(true)
  }

  function handleLogout() {
    setPin("")
    setPinError("")
    setIsUnlocked(false)
    setRouteStage("pretrip")
    setActiveSheet(null)
    setConfirmationSheet(null)
    setAddressQuery("")
    setPanicSent(false)
    setIsBoardingTrayMinimized(false)
    setStudents(createDemoStudents())
    setSelectedStudentId(null)
    setScreenPulse(null)
  }

  function handleSearchSelection(result: DemoAddressResult) {
    setAddressQuery(result.label)
    setActiveSheet(null)
  }

  function handleSendPanicAlert() {
    setPanicSent(true)
    setActiveSheet(null)
  }

  return (
    <div className="flex min-h-[calc(100svh-8rem)] items-center justify-center px-4 py-6 lg:px-6">
      <div className="grid w-full max-w-[1180px] gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,560px)] lg:items-end">
        <ControlDock
          isUnlocked={isUnlocked}
          routeStage={routeStage}
          actionableStudents={actionableStudents}
          onCorrectScan={handleSuccessfulScan}
          onWrongScan={handleWrongBusScan}
          onBadRead={handleBadReadScan}
          onSkipStudent={handleSkipStudent}
          onBeginDropoff={handleBeginDropoff}
        />

        <DeviceShell
          isUnlocked={isUnlocked}
          pin={pin}
          pinError={pinError}
          clockText={clockText}
          showMap={showMap}
          routeStage={routeStage}
          students={students}
          selectedStudentId={selectedStudentId}
          actionableStudents={actionableStudents}
          isBoardingTrayMinimized={isBoardingTrayMinimized}
          screenPulse={screenPulse}
          activeSheet={activeSheet}
          confirmationSheet={confirmationSheet}
          driverName={driverName}
          route={demoRoute}
          boardingPendingCount={boardingPendingStudents.length}
          boardedCount={boardedStudents.length}
          dropoffPendingCount={dropoffPendingStudents.length}
          clearedDropoffCount={clearedDropoffs.length}
          filteredAddresses={filteredAddresses}
          addressQuery={addressQuery}
          panicSent={panicSent}
          keypadDigits={keypadDigits}
          onDigitTap={handleDigitTap}
          onDeleteTap={handleDeleteTap}
          onOpenSheet={setActiveSheet}
          onCloseSheets={() => {
            setActiveSheet(null)
            setConfirmationSheet(null)
          }}
          onConfirmSheet={handleConfirmSheet}
          onStartRoute={handleStartRoute}
          onBeginDropoff={handleBeginDropoff}
          onSkipStudent={handleSkipStudent}
          onOverrideStudent={handleOverrideStudent}
          onContinueRoute={handleContinueRoute}
          onEndRoute={handleEndRoute}
          onMinimizeBoardingTray={() => setIsBoardingTrayMinimized(true)}
          onExpandBoardingTray={() => setIsBoardingTrayMinimized(false)}
          onResetRoute={resetRouteState}
          onLogout={handleLogout}
          onSearchChange={setAddressQuery}
          onSearchSelection={handleSearchSelection}
          onSendPanicAlert={handleSendPanicAlert}
          onPulseEnd={() => setScreenPulse(null)}
          demoBusId={demoBusId}
        />
      </div>
    </div>
  )
}

function ControlDock({
  isUnlocked,
  routeStage,
  actionableStudents,
  onCorrectScan,
  onWrongScan,
  onBadRead,
  onSkipStudent,
  onBeginDropoff,
}: {
  isUnlocked: boolean
  routeStage: RouteStage
  actionableStudents: DemoStudent[]
  onCorrectScan: (studentId: string) => void
  onWrongScan: (studentId: string) => void
  onBadRead: () => void
  onSkipStudent: (studentId: string) => void
  onBeginDropoff: () => void
}) {
  return (
    <div className="order-2 flex min-h-[280px] flex-col gap-4 lg:order-1 lg:min-h-[760px] lg:justify-end">
      <div className="flex-1" />

      {isUnlocked && routeStage === "enroute" ? (
        <div className="mt-auto self-start px-1">
          <Button type="button" className="rounded-full px-5" onClick={onBeginDropoff}>
            Begin Drop Off
          </Button>
        </div>
      ) : null}

      {isUnlocked && (routeStage === "boarding" || routeStage === "dropoff") ? (
        <div className="mt-auto flex items-center gap-3 self-start px-1">
          <StatusDotMenuButton
            tone="green"
            students={actionableStudents}
            onSelect={onCorrectScan}
            ariaLabel={routeStage === "boarding" ? "Scan student on" : "Scan student off"}
          />
          <StatusDotMenuButton
            tone="red"
            students={actionableStudents}
            onSelect={onWrongScan}
            ariaLabel="Reject student scan"
          />
          <StatusDotButton tone="blue" onClick={onBadRead} ariaLabel="Bad card read" />
          {routeStage === "boarding" ? (
            <StudentScanActionMenu
              compact
              tone="neutral"
              title="Skip"
              detail=""
              students={actionableStudents}
              onSelect={onSkipStudent}
              buttonClassName="h-10 rounded-full px-4 text-xs font-medium"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function LockedDriverScreen({
  clockText,
  pin,
  pinError,
  keypadDigits,
  onDigitTap,
  onDeleteTap,
}: {
  clockText: string
  pin: string
  pinError: string
  keypadDigits: string[]
  onDigitTap: (digit: string) => void
  onDeleteTap: () => void
}) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden p-4 pt-6 sm:p-5 sm:pt-7">
      <div className="shrink-0 pb-3 text-center">
        <div className="text-4xl leading-tight font-semibold tracking-tight">{clockText}</div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-between gap-5">
        <div className="pt-4 text-center">
          <p className="text-sm font-medium text-muted-foreground">Enter Passcode</p>
          <div className="mt-5 flex items-center justify-center gap-3">
            {[0, 1, 2, 3].map((slot) => {
              const filled = pin.length > slot
              return (
                <span
                  key={slot}
                  className={cn(
                    "size-3 rounded-full border",
                    filled ? "border-primary bg-primary" : "border-muted-foreground/60 bg-transparent"
                  )}
                />
              )
            })}
          </div>
          {pinError ? <p className="mt-3 text-sm text-destructive">{pinError}</p> : null}
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-3">
            {keypadDigits.slice(0, 9).map((digit) => (
              <Button
                key={digit}
                type="button"
                variant="outline"
                className="h-16 rounded-full text-2xl font-medium"
                onClick={() => onDigitTap(digit)}
              >
                {digit}
              </Button>
            ))}
            <div />
            <Button
              type="button"
              variant="outline"
              className="h-16 rounded-full text-2xl font-medium"
              onClick={() => onDigitTap("0")}
            >
              0
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-16 rounded-full"
              onClick={onDeleteTap}
              aria-label="Delete digit"
            >
              <DeleteIcon className="size-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function DeviceOverlay({
  activeSheet,
  confirmationSheet,
  routeStage,
  driverName,
  route,
  students,
  boardingPendingCount,
  boardedCount,
  dropoffPendingCount,
  clearedDropoffCount,
  filteredAddresses,
  addressQuery,
  onSearchChange,
  onSearchSelection,
  onClose,
  onConfirmSheet,
  onStartRoute,
  onBeginDropoff,
  onResetRoute,
  onSendPanicAlert,
}: {
  activeSheet: ActiveSheet
  confirmationSheet: ConfirmationSheet
  routeStage: RouteStage
  driverName: string
  route: DemoRoute
  students: DemoStudent[]
  boardingPendingCount: number
  boardedCount: number
  dropoffPendingCount: number
  clearedDropoffCount: number
  filteredAddresses: DemoAddressResult[]
  addressQuery: string
  onSearchChange: (value: string) => void
  onSearchSelection: (result: DemoAddressResult) => void
  onClose: () => void
  onConfirmSheet: () => void
  onStartRoute: () => void
  onBeginDropoff: () => void
  onResetRoute: () => void
  onSendPanicAlert: () => void
}) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-card/72 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="driver-sheet-title"
        className="relative flex max-h-full w-full max-w-[420px] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute top-2 right-2 z-10"
          onClick={onClose}
          aria-label="Close panel"
        >
          <XIcon className="size-4" />
        </Button>

        {confirmationSheet ? (
          <>
            <div className="border-b px-4 py-4 pr-12">
              <h2 id="driver-sheet-title" className="text-base font-medium">
                {confirmationSheet.kind === "continue-route" ? "Missing scan on" : "Missing scan off"}
              </h2>
            </div>

            <div className="space-y-4 p-4">
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-4 text-sm text-muted-foreground">
                {confirmationSheet.kind === "continue-route"
                  ? "These students did not scan on. Continue and mark them as manually boarded?"
                  : "These students did not scan off. Confirm that they got off the bus."}
              </div>

              <div className="space-y-2">
                {confirmationSheet.studentIds.map((studentId) => {
                  const student = students.find((item) => item.id === studentId)
                  if (!student) return null

                  return (
                    <div key={student.id} className="rounded-xl border px-3 py-3 text-sm">
                      <div className="font-medium text-foreground">{student.name}</div>
                      <div className="mt-1 text-muted-foreground">
                        {confirmationSheet.kind === "continue-route" ? student.pickupStop : student.dropoffStop}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="button" className="flex-1" onClick={onConfirmSheet}>
                  Confirm
                </Button>
              </div>
            </div>
          </>
        ) : null}

        {!confirmationSheet && activeSheet === "route" ? (
          <>
            <div className="border-b px-4 py-4 pr-12">
              <h2 id="driver-sheet-title" className="text-base font-medium">
                Good morning, {driverName}
              </h2>
            </div>

            <div className="space-y-4 p-4">
              <div className="rounded-xl border p-4">
                <div className="font-medium">{route.route_name}</div>
                <div className="mt-1 text-sm text-muted-foreground">{route.school_name}</div>
                <div className="mt-3 text-xs text-muted-foreground">
                  {route.id} - {route.pickup_time} - {route.stops} stops - {route.eta_minutes}m ETA
                </div>
                <div className="mt-3">
                  <Badge variant="outline" className="rounded-full border-border/70 px-2.5 py-1">
                    {routeStage === "pretrip"
                      ? "Ready to board"
                      : routeStage === "boarding"
                        ? "Boarding in progress"
                        : routeStage === "enroute"
                          ? "Route in progress"
                          : routeStage === "dropoff"
                            ? "Drop off in progress"
                            : "Route complete"}
                  </Badge>
                </div>
              </div>

              {routeStage === "boarding" || routeStage === "dropoff" ? (
                <div className="rounded-xl border bg-muted/35 p-4 text-sm text-muted-foreground">
                  {routeStage === "boarding"
                    ? `${boardedCount} students accounted for, ${boardingPendingCount} still waiting to scan on.`
                    : `${clearedDropoffCount} students cleared, ${dropoffPendingCount} still waiting to scan off.`}
                </div>
              ) : null}

              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
                  Exit to Map
                </Button>

                {routeStage === "pretrip" ? (
                  <Button type="button" className="flex-1" onClick={onStartRoute}>
                    <PlayIcon className="size-4" />
                    Start Route
                  </Button>
                ) : null}

                {routeStage === "boarding" ? (
                  <Button type="button" className="flex-1" onClick={onClose}>
                    Return to Boarding
                  </Button>
                ) : null}

                {routeStage === "enroute" ? (
                  <Button type="button" className="flex-1" onClick={onBeginDropoff}>
                    Begin Drop Off
                  </Button>
                ) : null}

                {routeStage === "dropoff" ? (
                  <Button type="button" className="flex-1" onClick={onClose}>
                    Return to Drop Off
                  </Button>
                ) : null}

                {routeStage === "completed" ? (
                  <Button type="button" className="flex-1" onClick={onResetRoute}>
                    Start Over
                  </Button>
                ) : null}
              </div>
            </div>
          </>
        ) : null}

        {!confirmationSheet && activeSheet === "search" ? (
          <>
            <div className="border-b px-4 py-4 pr-12">
              <h2 id="driver-sheet-title" className="text-base font-medium">
                Search addresses
              </h2>
            </div>

            <div className="space-y-4 p-4">
              <Input
                value={addressQuery}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Search destination or stop"
                autoFocus
              />

              <div className="space-y-2">
                {filteredAddresses.length > 0 ? (
                  filteredAddresses.map((result) => (
                    <button
                      key={result.id}
                      type="button"
                      className="w-full rounded-xl border px-3 py-3 text-left transition-colors hover:bg-muted"
                      onClick={() => onSearchSelection(result)}
                    >
                      <div className="font-medium">{result.label}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{result.detail}</div>
                    </button>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                    No addresses match that search.
                  </div>
                )}
              </div>
            </div>
          </>
        ) : null}

        {!confirmationSheet && activeSheet === "panic" ? (
          <>
            <div className="border-b px-4 py-4 pr-12">
              <h2 id="driver-sheet-title" className="text-base font-medium text-destructive">
                Panic alert
              </h2>
            </div>

            <div className="space-y-4 p-4">
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-muted-foreground">
                Send an emergency alert to dispatch with the current bus location.
              </div>

              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="flex-1 bg-destructive text-white hover:bg-destructive/90"
                  onClick={onSendPanicAlert}
                >
                  Send Alert
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

function DeviceShell({
  isUnlocked,
  pin,
  pinError,
  clockText,
  showMap,
  routeStage,
  students,
  selectedStudentId,
  actionableStudents,
  isBoardingTrayMinimized,
  screenPulse,
  activeSheet,
  confirmationSheet,
  driverName,
  route,
  boardingPendingCount,
  boardedCount,
  dropoffPendingCount,
  clearedDropoffCount,
  filteredAddresses,
  addressQuery,
  panicSent,
  keypadDigits,
  onDigitTap,
  onDeleteTap,
  onOpenSheet,
  onCloseSheets,
  onConfirmSheet,
  onStartRoute,
  onBeginDropoff,
  onSkipStudent,
  onOverrideStudent,
  onContinueRoute,
  onEndRoute,
  onMinimizeBoardingTray,
  onExpandBoardingTray,
  onResetRoute,
  onLogout,
  onSearchChange,
  onSearchSelection,
  onSendPanicAlert,
  onPulseEnd,
  demoBusId,
}: {
  isUnlocked: boolean
  pin: string
  pinError: string
  clockText: string
  showMap: boolean
  routeStage: RouteStage
  students: DemoStudent[]
  selectedStudentId: string | null
  actionableStudents: DemoStudent[]
  isBoardingTrayMinimized: boolean
  screenPulse: ScreenPulse | null
  activeSheet: ActiveSheet
  confirmationSheet: ConfirmationSheet
  driverName: string
  route: DemoRoute
  boardingPendingCount: number
  boardedCount: number
  dropoffPendingCount: number
  clearedDropoffCount: number
  filteredAddresses: DemoAddressResult[]
  addressQuery: string
  panicSent: boolean
  keypadDigits: string[]
  onDigitTap: (digit: string) => void
  onDeleteTap: () => void
  onOpenSheet: (sheet: ActiveSheet) => void
  onCloseSheets: () => void
  onConfirmSheet: () => void
  onStartRoute: () => void
  onBeginDropoff: () => void
  onSkipStudent: (studentId: string) => void
  onOverrideStudent: (studentId: string) => void
  onContinueRoute: () => void
  onEndRoute: () => void
  onMinimizeBoardingTray: () => void
  onExpandBoardingTray: () => void
  onResetRoute: () => void
  onLogout: () => void
  onSearchChange: (value: string) => void
  onSearchSelection: (result: DemoAddressResult) => void
  onSendPanicAlert: () => void
  onPulseEnd: () => void
  demoBusId: string
}) {
  return (
    <div className="order-1 flex justify-center lg:order-2">
      <div className="h-[min(88svh,920px)] w-[min(96vw,560px)] overflow-hidden rounded-[2.25rem] border bg-card shadow-xl">
        {!isUnlocked ? (
          <LockedDriverScreen
            clockText={clockText}
            pin={pin}
            pinError={pinError}
            keypadDigits={keypadDigits}
            onDigitTap={onDigitTap}
            onDeleteTap={onDeleteTap}
          />
        ) : (
          <div className="relative h-full overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.96),_rgba(244,247,251,0.92)_36%,_rgba(234,240,247,0.84)_100%)]">
            <Toaster
              id={driverDemoToasterId}
              richColors
              closeButton={false}
              visibleToasts={1}
              position="top-center"
              toastOptions={{
                classNames: driverToastClassNames,
              }}
              offset={{ top: 86 }}
              mobileOffset={{ top: 86, left: 18, right: 18 }}
              style={
                {
                  position: "absolute",
                  zIndex: 14,
                  ["--width" as string]: "min(94%, 420px)",
                } as CSSProperties
              }
            />

            {showMap ? (
              <div className="absolute inset-0">
                <FakeBusTrackingMap mode="driver" />
              </div>
            ) : null}

            {!showMap ? (
              <DriverStageScreen
                routeStage={routeStage}
                students={students}
                selectedStudentId={selectedStudentId}
                actionableStudents={actionableStudents}
                onSkipStudent={onSkipStudent}
                onOverrideStudent={onOverrideStudent}
                onContinueRoute={onContinueRoute}
                onEndRoute={onEndRoute}
                onMinimize={onMinimizeBoardingTray}
              />
            ) : null}

            {isBoardingTrayMinimized && (routeStage === "boarding" || routeStage === "dropoff") ? (
              <MinimizedBoardingTray
                routeStage={routeStage}
                waitingCount={actionableStudents.length}
                completedCount={
                  routeStage === "boarding"
                    ? students.filter((student) => student.boarding === "scanned" || student.boarding === "manual").length
                    : students.filter((student) => student.offboarding === "scanned" || student.offboarding === "confirmed").length
                }
                onExpand={onExpandBoardingTray}
              />
            ) : null}

            {screenPulse ? (
              <div
                key={screenPulse.id}
                className="pointer-events-none absolute inset-0 z-[5] driver-screen-pulse"
                style={pulseToneStyle(screenPulse.tone)}
                onAnimationEnd={onPulseEnd}
              />
            ) : null}

            <div className="absolute inset-x-0 top-0 z-10 px-4 pt-4 pb-8">
              <div className="mx-auto flex max-w-[500px] items-center justify-between rounded-[999px] border border-border/70 bg-background/78 px-3 py-2 shadow-lg backdrop-blur-xl">
                <div className="flex items-center gap-2">
                  <HeaderActionButton icon={<SearchIcon className="size-4" />} ariaLabel="Search addresses" onClick={() => onOpenSheet("search")} />
                  <HeaderActionButton icon={<RouteIcon className="size-4" />} ariaLabel="Open routes" onClick={() => onOpenSheet("route")} />
                </div>

                <div className="min-w-[5.5rem] text-center text-lg font-semibold tabular-nums text-foreground">
                  {clockText}
                </div>

                <div className="flex items-center gap-2">
                  <HeaderActionButton icon={<LogOutIcon className="size-4" />} ariaLabel="Logout" onClick={onLogout} />
                  <HeaderActionButton
                    icon={<TriangleAlertIcon className="size-4" />}
                    ariaLabel={panicSent ? "Panic alert sent" : "Open panic alert"}
                    tone={panicSent ? "destructive" : "panic"}
                    onClick={() => onOpenSheet("panic")}
                  />
                </div>
              </div>
            </div>

            <button
              type="button"
              className="absolute inset-x-0 bottom-3 z-10 text-center text-xs text-muted-foreground/80 transition-colors hover:text-foreground"
              onClick={() => onOpenSheet("route")}
            >
              {demoBusId}
            </button>

            {activeSheet || confirmationSheet ? (
              <DeviceOverlay
                activeSheet={activeSheet}
                confirmationSheet={confirmationSheet}
                routeStage={routeStage}
                driverName={driverName}
                route={route}
                students={students}
                boardingPendingCount={boardingPendingCount}
                boardedCount={boardedCount}
                dropoffPendingCount={dropoffPendingCount}
                clearedDropoffCount={clearedDropoffCount}
                filteredAddresses={filteredAddresses}
                addressQuery={addressQuery}
                onSearchChange={onSearchChange}
                onSearchSelection={onSearchSelection}
                onClose={onCloseSheets}
                onConfirmSheet={onConfirmSheet}
                onStartRoute={onStartRoute}
                onBeginDropoff={onBeginDropoff}
                onResetRoute={onResetRoute}
                onSendPanicAlert={onSendPanicAlert}
              />
            ) : null}

            <style jsx>{`
              .driver-screen-pulse {
                animation: driverScreenPulse 560ms cubic-bezier(0.22, 1, 0.36, 1);
                box-shadow:
                  inset 0 0 0 0 var(--pulse-core),
                  inset 0 0 0 0 var(--pulse-glow),
                  inset 0 0 0 0 var(--pulse-fade);
              }

              @keyframes driverScreenPulse {
                0% {
                  opacity: 0;
                  box-shadow:
                    inset 0 0 0 0 var(--pulse-core),
                    inset 0 0 0 0 var(--pulse-glow),
                    inset 0 0 0 0 var(--pulse-fade);
                }
                30% {
                  opacity: 1;
                  box-shadow:
                    inset 0 0 0 1px var(--pulse-core),
                    inset 0 0 18px 6px var(--pulse-glow),
                    inset 0 0 56px 18px var(--pulse-fade);
                }
                100% {
                  opacity: 0;
                  box-shadow:
                    inset 0 0 0 1px rgba(0, 0, 0, 0),
                    inset 0 0 8px 2px rgba(0, 0, 0, 0),
                    inset 0 0 24px 6px rgba(0, 0, 0, 0);
                }
              }

              :global(.driver-screen-toast) {
                align-items: flex-start;
                gap: 10px;
                border-radius: 1.35rem;
                padding: 14px 16px 16px;
                box-shadow: 0 18px 40px rgba(15, 23, 42, 0.16);
              }

              :global(.driver-screen-toast-icon) {
                margin-top: 2px;
              }

              :global(.driver-screen-toast-content) {
                position: relative;
                width: 100%;
                gap: 3px;
                padding-bottom: 10px;
              }

              :global(.driver-screen-toast-content::before) {
                content: "";
                position: absolute;
                inset: auto 0 0;
                height: 4px;
                border-radius: 999px;
                background: currentColor;
                opacity: 0.18;
              }

              :global(.driver-screen-toast-content::after) {
                content: "";
                position: absolute;
                inset: auto 0 0;
                height: 4px;
                border-radius: 999px;
                background: currentColor;
                transform-origin: left center;
                animation: driverToastProgress var(--driver-toast-duration, 2400ms) linear forwards;
              }

              :global(.driver-screen-toast:hover .driver-screen-toast-content::after),
              :global(.driver-screen-toast:focus-within .driver-screen-toast-content::after) {
                animation-play-state: paused;
              }

              :global(.driver-screen-toast-title) {
                font-size: 0.92rem;
                font-weight: 700;
                line-height: 1.3;
                overflow-wrap: normal;
                word-break: normal;
              }

              :global(.driver-screen-toast-description) {
                font-size: 0.8rem;
                line-height: 1.45;
                opacity: 0.92;
                overflow-wrap: normal;
                word-break: normal;
              }

              @keyframes driverToastProgress {
                from {
                  transform: scaleX(1);
                }

                to {
                  transform: scaleX(0);
                }
              }
            `}</style>
          </div>
        )}
      </div>
    </div>
  )
}

function DriverStageScreen({
  routeStage,
  students,
  selectedStudentId,
  actionableStudents,
  onSkipStudent,
  onOverrideStudent,
  onContinueRoute,
  onEndRoute,
  onMinimize,
}: {
  routeStage: RouteStage
  students: DemoStudent[]
  selectedStudentId: string | null
  actionableStudents: DemoStudent[]
  onSkipStudent: (studentId: string) => void
  onOverrideStudent: (studentId: string) => void
  onContinueRoute: () => void
  onEndRoute: () => void
  onMinimize: () => void
}) {
  const isBoarding = routeStage === "boarding"
  const waitingCount = actionableStudents.length

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.96),_rgba(245,247,252,0.94)_44%,_rgba(228,235,244,0.9)_100%)]" />
      <div className="relative flex h-full flex-col px-4 pb-14 pt-24">
        <div className="min-h-0 flex-1 overflow-hidden rounded-[2rem] border border-white/80 bg-white/72 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-3 pb-3">
              <div />
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-full px-4 text-xs font-medium"
                onClick={onMinimize}
              >
                <MinusIcon className="size-3.5" />
                Minimize
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden rounded-[1.9rem] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(241,245,249,0.92))] p-4">
              <div className="flex h-full flex-col">
                <div className="mb-4 flex items-center justify-between">
                  <div className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[0.7rem] font-medium uppercase tracking-[0.22em] text-slate-500">
                    Driver
                  </div>
                  <div className="text-xs text-muted-foreground">{waitingCount} waiting</div>
                </div>

                <div className="relative min-h-0 flex-1 overflow-y-auto rounded-[1.5rem] bg-slate-100/80 p-3">
                  <div className="pointer-events-none absolute inset-y-4 left-1/2 w-px -translate-x-1/2 bg-[repeating-linear-gradient(180deg,rgba(148,163,184,0.58)_0px,rgba(148,163,184,0.58)_12px,transparent_12px,transparent_24px)]" />
                  <div className="space-y-3">
                    {busSeatRows.map(([leftSeat, rightSeat]) => {
                      const leftStudent = students.find((student) => student.seatLabel === leftSeat) ?? null
                      const rightStudent = students.find((student) => student.seatLabel === rightSeat) ?? null

                      return (
                        <div key={`${leftSeat}-${rightSeat}`} className="grid grid-cols-[minmax(0,1fr)_2.4rem_minmax(0,1fr)] items-stretch gap-3">
                          <SeatTile
                            student={leftStudent}
                            routeStage={routeStage}
                            isSelected={leftStudent?.id === selectedStudentId}
                          />
                          <div className="flex items-center justify-center text-[0.65rem] font-medium uppercase tracking-[0.2em] text-slate-400">
                            {leftSeat.replace("A", "")}
                          </div>
                          <SeatTile
                            student={rightStudent}
                            routeStage={routeStage}
                            isSelected={rightStudent?.id === selectedStudentId}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className={cn("grid gap-3 pt-4", isBoarding ? "grid-cols-3" : "grid-cols-2")}>
              {isBoarding ? (
                <StudentScanActionMenu
                  tone="neutral"
                  title="Skip"
                  detail=""
                  students={actionableStudents}
                  onSelect={onSkipStudent}
                  buttonClassName="min-h-14 rounded-[1.5rem] px-4 text-center text-base font-semibold"
                />
              ) : null}

              <StudentScanActionMenu
                tone="green"
                title="Override"
                detail=""
                students={actionableStudents}
                onSelect={onOverrideStudent}
                buttonClassName="min-h-14 rounded-[1.5rem] px-4 text-center text-base font-semibold"
              />

              <Button
                type="button"
                className="min-h-14 rounded-[1.5rem] px-4 text-base font-semibold"
                onClick={isBoarding ? onContinueRoute : onEndRoute}
              >
                {isBoarding ? "Continue Route" : "End Route"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function HeaderActionButton({
  icon,
  ariaLabel,
  onClick,
  tone = "default",
}: {
  icon: ReactNode
  ariaLabel: string
  onClick: () => void
  tone?: "default" | "panic" | "destructive"
}) {
  const toneClass =
    tone === "destructive"
      ? "border-destructive/25 bg-destructive/12 text-destructive hover:bg-destructive/18"
      : tone === "panic"
        ? "border-amber-500/25 bg-amber-500/12 text-amber-700 hover:bg-amber-500/18"
        : "border-border/70 bg-background/70 text-foreground hover:bg-muted"

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn("flex size-11 items-center justify-center rounded-full border transition-colors", toneClass)}
    >
      {icon}
    </button>
  )
}

function MinimizedBoardingTray({
  routeStage,
  waitingCount,
  completedCount,
  onExpand,
}: {
  routeStage: RouteStage
  waitingCount: number
  completedCount: number
  onExpand: () => void
}) {
  return (
    <div className="absolute inset-x-4 bottom-10 z-10">
      <div className="rounded-[1.6rem] border border-border/70 bg-background/84 p-3 shadow-lg backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-foreground">
              {routeStage === "boarding" ? "Boarding minimized" : "Drop off minimized"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {waitingCount} waiting - {completedCount} complete
            </div>
          </div>
          <Button type="button" size="sm" className="rounded-full px-4" onClick={onExpand}>
            Open
          </Button>
        </div>
      </div>
    </div>
  )
}

function SeatTile({
  student,
  routeStage,
  isSelected,
}: {
  student: DemoStudent | null
  routeStage: RouteStage
  isSelected: boolean
}) {
  if (!student) {
    return (
      <div className="rounded-[1.3rem] border border-dashed border-slate-300/80 bg-white/55 px-3 py-4 text-center text-xs text-slate-400">
        Open seat
      </div>
    )
  }

  const isBoarding = routeStage === "boarding"
  const toneClass = isBoarding ? boardingBadgeClass(student.boarding) : offboardingBadgeClass(student.offboarding)
  const label = isBoarding ? boardingBadgeLabel(student.boarding) : offboardingBadgeLabel(student.offboarding)

  return (
    <div
      className={cn(
        "rounded-[1.3rem] border bg-white/88 px-3 py-3 shadow-[0_16px_36px_rgba(15,23,42,0.06)] transition-colors",
        isSelected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200/80"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{student.name}</div>
          <div className={cn("mt-0.5 text-[0.72rem]", isSelected ? "text-white/70" : "text-muted-foreground")}>
            {student.grade}
          </div>
        </div>
        <div className={cn("text-[0.65rem] font-medium uppercase tracking-[0.18em]", isSelected ? "text-white/60" : "text-slate-400")}>
          {student.seatLabel}
        </div>
      </div>

      <div className={cn("mt-3 rounded-full px-2.5 py-1 text-[0.65rem] font-medium", toneClass, isSelected && "border border-white/15 bg-white/12 text-white")}>
        {label}
      </div>
    </div>
  )
}

function StatusDot({ tone }: { tone: ScanTone }) {
  return (
    <span
      className={cn(
        "size-4 rounded-full ring-4 ring-white/70 shadow-sm",
        tone === "green" && "bg-emerald-500",
        tone === "red" && "bg-rose-500",
        tone === "blue" && "bg-sky-500"
      )}
    />
  )
}

function StatusDotMenuButton({
  tone,
  students,
  onSelect,
  ariaLabel,
}: {
  tone: "green" | "red"
  students: DemoStudent[]
  onSelect: (studentId: string) => void
  ariaLabel: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className="flex size-10 items-center justify-center rounded-full border border-white/80 bg-white/92 shadow-[0_14px_30px_rgba(15,23,42,0.08)] transition-transform hover:-translate-y-0.5 disabled:opacity-40"
          disabled={students.length === 0}
        >
          <StatusDot tone={tone} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="rounded-2xl p-2" align="start" sideOffset={10}>
        <DropdownMenuLabel>{ariaLabel}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {students.map((student) => (
          <DropdownMenuItem
            key={student.id}
            className="rounded-xl px-3 py-2.5"
            onClick={() => onSelect(student.id)}
          >
            <div>
              <div className="font-medium text-foreground">{student.name}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {student.grade} - {student.offboarding === "pending" ? student.dropoffStop : student.pickupStop}
              </div>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function StatusDotButton({
  tone,
  onClick,
  ariaLabel,
}: {
  tone: ScanTone
  onClick: () => void
  ariaLabel: string
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className="flex size-10 items-center justify-center rounded-full border border-white/80 bg-white/92 shadow-[0_14px_30px_rgba(15,23,42,0.08)] transition-transform hover:-translate-y-0.5"
      onClick={onClick}
    >
      <StatusDot tone={tone} />
    </button>
  )
}

function StudentScanActionMenu({
  tone,
  title,
  detail,
  students,
  onSelect,
  compact = false,
  buttonClassName,
}: {
  tone: "green" | "red" | "neutral"
  title: string
  detail: string
  students: DemoStudent[]
  onSelect: (studentId: string) => void
  compact?: boolean
  buttonClassName?: string
}) {
  const buttonClass =
    tone === "green"
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-900"
      : tone === "red"
        ? "border-rose-500/25 bg-rose-500/10 text-rose-900"
        : "border-slate-300/80 border-dashed bg-background text-foreground"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            compact
              ? "h-10 rounded-full border px-3.5 text-xs font-medium whitespace-nowrap"
              : "min-h-24 rounded-[1.5rem] border px-4 py-4 text-center transition-transform hover:-translate-y-0.5",
            buttonClass,
            buttonClassName
          )}
          disabled={students.length === 0}
        >
          <div className="font-medium">{title}</div>
          {!compact ? (
            <div className="mt-1 text-sm opacity-80">{students.length > 0 ? detail : "No students waiting"}</div>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="rounded-2xl p-2" align="start" sideOffset={10}>
        <DropdownMenuLabel>{title}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {students.map((student) => (
          <DropdownMenuItem
            key={student.id}
            className="rounded-xl px-3 py-2.5"
            onClick={() => onSelect(student.id)}
          >
            <div>
              <div className="font-medium text-foreground">{student.name}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {student.grade} - {student.offboarding === "pending" ? student.dropoffStop : student.pickupStop}
              </div>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

