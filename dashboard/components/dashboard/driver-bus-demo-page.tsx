"use client"

import { useEffect, useRef, useState } from "react"
import { BusFrontIcon, DeleteIcon, MapPinIcon, RouteIcon } from "lucide-react"
import { FakeBusTrackingMap } from "@/components/dashboard/fake-bus-tracking-map"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type DemoRoute = {
  id: string
  route_name: string
  stops: number
  eta_minutes: number
  status: "On Time" | "Delayed" | "At Stop"
}

const demoBusId = "DEMO-BUS-42"

const demoRoutes: DemoRoute[] = [
  { id: "R-101", route_name: "North Loop", stops: 8, eta_minutes: 27, status: "On Time" },
  { id: "R-203", route_name: "Riverside Connector", stops: 6, eta_minutes: 31, status: "Delayed" },
  { id: "R-312", route_name: "Oak Ridge Express", stops: 5, eta_minutes: 24, status: "At Stop" },
]
const keypadDigits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]

function statusTextClass(status: DemoRoute["status"]) {
  if (status === "Delayed") {
    return "text-amber-600"
  }
  if (status === "At Stop") {
    return "text-sky-600"
  }
  return "text-emerald-600"
}

export function DriverBusDemoPage() {
  const [pin, setPin] = useState("")
  const [pinError, setPinError] = useState("")
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [showMap, setShowMap] = useState(false)
  const [isLoadingRoutes, setIsLoadingRoutes] = useState(false)
  const [loadedRoutes, setLoadedRoutes] = useState<DemoRoute[]>([])
  const [clockText, setClockText] = useState("")
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const demoNameRef = useRef<string>("Avery")

  useEffect(() => {
    const names = ["Avery", "Jordan", "Taylor", "Reese", "Skyler", "Parker", "Quinn", "Rowan"]
    demoNameRef.current = names[Math.floor(Math.random() * names.length)]

    const updateClock = () => {
      const now = new Date()
      setClockText(
        now.toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        })
      )
    }
    updateClock()
    const clockInterval = setInterval(updateClock, 30000)

    return () => {
      clearInterval(clockInterval)
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (isUnlocked) return
    if (/^\d{4}$/.test(pin)) {
      handlePinSubmit()
    }
    // Auto-submit when the 4th digit is entered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, isUnlocked])

  function handlePinSubmit() {
    if (!/^\d{4}$/.test(pin)) {
      setPinError("Enter exactly 4 digits to continue.")
      return
    }
    setIsUnlocked(true)
    setPinError("")
  }

  function handleSkipToMap() {
    setShowMap(true)
  }

  function handleDigitTap(digit: string) {
    if (pin.length >= 4) return
    setPin((current) => `${current}${digit}`)
    if (pinError) {
      setPinError("")
    }
  }

  function handleDeleteTap() {
    setPin((current) => current.slice(0, -1))
    if (pinError) {
      setPinError("")
    }
  }

  function handleLoadRoutes() {
    if (isLoadingRoutes) return
    setIsLoadingRoutes(true)
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current)
    }
    loadTimeoutRef.current = setTimeout(() => {
      setLoadedRoutes(demoRoutes)
      setIsLoadingRoutes(false)
      loadTimeoutRef.current = null
    }, 900)
  }

  return (
    <div className="flex min-h-[calc(100svh-8rem)] items-center justify-center p-4 lg:p-6">
      <div className="h-[min(88svh,920px)] w-[min(96vw,560px)] overflow-hidden rounded-[2.25rem] border bg-card shadow-xl">
        <div className="flex h-full flex-col overflow-hidden p-4 pt-6 sm:p-5 sm:pt-7">
          <div className="pb-2 text-center">
            <div className="text-4xl leading-tight font-semibold tracking-tight">{clockText}</div>
            {isUnlocked ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Good morning, {demoNameRef.current}
              </p>
            ) : null}
          </div>

          {!isUnlocked ? (
            <div className="flex min-h-0 flex-1 flex-col justify-between gap-5">
              <div className="pt-4 text-center">
                <p className="text-sm font-medium text-muted-foreground">Enter Passcode</p>
                <div className="mt-5 flex items-center justify-center gap-3">
                  {[0, 1, 2, 3].map((slot) => {
                    const filled = pin.length > slot
                    return (
                      <span
                        key={slot}
                        className={`size-3 rounded-full border ${filled ? "border-primary bg-primary" : "border-muted-foreground/60 bg-transparent"}`}
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
                      onClick={() => handleDigitTap(digit)}
                    >
                      {digit}
                    </Button>
                  ))}
                  <div />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-16 rounded-full text-2xl font-medium"
                    onClick={() => handleDigitTap("0")}
                  >
                    0
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-16 rounded-full"
                    onClick={handleDeleteTap}
                    aria-label="Delete digit"
                  >
                    <DeleteIcon className="size-5" />
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2">
                    <BusFrontIcon className="size-4 text-primary" />
                    Demo Actions
                  </CardTitle>
                  <CardDescription>Bus ID: {demoBusId}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <Button onClick={handleSkipToMap}>
                    <MapPinIcon className="size-4" />
                    Skip to Map
                  </Button>
                  <Button variant="outline" onClick={handleLoadRoutes} disabled={isLoadingRoutes}>
                    <RouteIcon className="size-4" />
                    {isLoadingRoutes ? "Loading Routes..." : "Load Routes"}
                  </Button>
                </CardContent>
              </Card>

              {loadedRoutes.length > 0 ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle>Loaded Demo Routes</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {loadedRoutes.map((route) => (
                      <div key={route.id} className="rounded-md border px-3 py-2 text-xs sm:text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{route.route_name}</span>
                          <span className={statusTextClass(route.status)}>{route.status}</span>
                        </div>
                        <div className="mt-1 text-muted-foreground">
                          {route.id} • {route.stops} stops • {route.eta_minutes}m
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ) : null}

              {showMap ? (
                <div className="min-h-0 flex-1">
                  <FakeBusTrackingMap />
                </div>
              ) : null}
            </div>
          )}

          <p className="pt-2 text-center text-xs text-muted-foreground/80">{demoBusId}</p>
        </div>
      </div>
    </div>
  )
}
