import {
  IconTrendingUp,
  IconTrendingDown,
} from "@tabler/icons-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function SectionCards() {
  return (
    <div className="grid gap-4 px-4 lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Active Routes</CardTitle>
          <Badge variant="outline" className="flex gap-1 rounded-lg text-xs">
            <IconTrendingUp className="size-3" />
            +12%
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">24</div>
          <p className="text-xs text-muted-foreground">6 currently in transit</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Total Students</CardTitle>
          <Badge variant="outline" className="flex gap-1 rounded-lg text-xs">
            <IconTrendingUp className="size-3" />
            +8%
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">1,284</div>
          <p className="text-xs text-muted-foreground">Across all active routes</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">On-Time Rate</CardTitle>
          <Badge variant="outline" className="flex gap-1 rounded-lg text-xs">
            <IconTrendingDown className="size-3" />
            -2%
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">94.2%</div>
          <p className="text-xs text-muted-foreground">Last 30 days average</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Active Drivers</CardTitle>
          <Badge variant="outline" className="flex gap-1 rounded-lg text-xs">
            <IconTrendingUp className="size-3" />
            +4%
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">18</div>
          <p className="text-xs text-muted-foreground">3 on break today</p>
        </CardContent>
      </Card>
    </div>
  )
}
