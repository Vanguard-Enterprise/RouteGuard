"use client"

import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"
import { TrendingUpIcon } from "lucide-react"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Separator } from "@/components/ui/separator"

const routeChartData = [
  { month: "January", riders: 186, onTime: 160 },
  { month: "February", riders: 305, onTime: 280 },
  { month: "March", riders: 237, onTime: 210 },
  { month: "April", riders: 273, onTime: 250 },
  { month: "May", riders: 209, onTime: 190 },
  { month: "June", riders: 214, onTime: 195 },
]

const routeChartConfig = {
  riders: { label: "Riders", color: "var(--primary)" },
  onTime: { label: "On-Time", color: "var(--primary)" },
} satisfies ChartConfig

export function RouteRidershipChart() {
  return (
    <>
      <ChartContainer config={routeChartConfig}>
        <AreaChart accessibilityLayer data={routeChartData} margin={{ left: 0, right: 10 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" hide />
          <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
          <Area dataKey="onTime" type="natural" fill="var(--color-onTime)" fillOpacity={0.6} stroke="var(--color-onTime)" stackId="a" />
          <Area dataKey="riders" type="natural" fill="var(--color-riders)" fillOpacity={0.4} stroke="var(--color-riders)" stackId="a" />
        </AreaChart>
      </ChartContainer>
      <Separator />
      <div className="grid gap-2">
        <div className="flex gap-2 leading-none font-medium">
          Trending up by 5.2% this month <TrendingUpIcon className="size-4" />
        </div>
        <div className="text-muted-foreground">
          Showing ridership data for the last 6 months on this route.
        </div>
      </div>
      <Separator />
    </>
  )
}
