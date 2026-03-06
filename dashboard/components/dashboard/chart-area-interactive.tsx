"use client"

import { useState, useMemo } from "react"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useIsMobile } from "@/hooks/use-mobile"

// Generate 90 days of placeholder ridership data
const chartData = Array.from({ length: 90 }, (_, i) => {
  const date = new Date(2026, 0, 1)
  date.setDate(date.getDate() + i)
  return {
    date: date.toISOString().split("T")[0],
    riders: Math.floor(Math.random() * 400 + 800),
    onTime: Math.floor(Math.random() * 50 + 750),
  }
})

const chartConfig = {
  riders: { label: "Total Riders", color: "var(--chart-1)" },
  onTime: { label: "On-Time", color: "var(--chart-2)" },
} satisfies ChartConfig

export function ChartAreaInteractive() {
  const isMobile = useIsMobile()
  const [timeRange, setTimeRange] = useState("30d")

  const filtered = useMemo(() => {
    const now = new Date(2026, 2, 31)
    const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90
    const cutoff = new Date(now)
    cutoff.setDate(cutoff.getDate() - days)
    return chartData.filter((d) => new Date(d.date) >= cutoff)
  }, [timeRange])

  return (
    <Card>
      <CardHeader className="flex items-center gap-2 space-y-0 border-b py-5 sm:flex-row">
        <div className="grid flex-1 gap-1 text-center sm:text-left">
          <CardTitle>Daily Ridership</CardTitle>
          <CardDescription>Riders scanned per day</CardDescription>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-40 rounded-lg" aria-label="Select time range">
            <SelectValue placeholder="Last 30 days" />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="90d" className="rounded-lg">Last 3 months</SelectItem>
            <SelectItem value="30d" className="rounded-lg">Last 30 days</SelectItem>
            <SelectItem value="7d" className="rounded-lg">Last 7 days</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
          <AreaChart data={filtered}>
            <defs>
              <linearGradient id="fillRiders" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-riders)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--color-riders)" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="fillOnTime" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-onTime)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--color-onTime)" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) => {
                const date = new Date(value)
                return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
              }}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(value) =>
                    new Date(value).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })
                  }
                  indicator="dot"
                />
              }
            />
            <Area
              dataKey="onTime"
              type="natural"
              fill="url(#fillOnTime)"
              stroke="var(--color-onTime)"
              stackId="a"
            />
            <Area
              dataKey="riders"
              type="natural"
              fill="url(#fillRiders)"
              stroke="var(--color-riders)"
              stackId="b"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
