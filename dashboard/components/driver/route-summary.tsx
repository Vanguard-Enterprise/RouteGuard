'use client'
import { User, MapPin, Bus, Hash, Navigation } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

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
      {/* Driver card */}
      <Card>
        <CardContent className="pt-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center shrink-0">
            <User className="size-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-foreground text-xl font-semibold">{driverName}</p>
            <p className="text-muted-foreground text-sm">{dateString}</p>
          </div>
        </CardContent>
      </Card>

      {/* Assignment card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xs text-muted-foreground uppercase tracking-widest font-medium">
            Today&apos;s Assignment
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 flex flex-col gap-3">
          {loading && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col gap-3">
              <p className="text-destructive text-sm">{error}</p>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="self-start text-muted-foreground text-xs px-3 py-1.5 rounded-lg border border-border hover:text-foreground transition-colors"
                >
                  Retry
                </button>
              )}
            </div>
          )}

          {!loading && !error && preview && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <MapPin className="size-4 shrink-0" style={{ color: 'var(--color-brand-amber)' }} />
                <p className="text-xl font-bold" style={{ color: 'var(--color-brand-amber)' }}>
                  {preview.route_name}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  <Bus className="size-3 mr-1" />
                  {preview.vehicle_name}
                </Badge>
                <Badge variant="secondary">
                  <Hash className="size-3 mr-1" />
                  {preview.stop_count} stops
                </Badge>
                <Badge variant="secondary" className="capitalize">
                  <Navigation className="size-3 mr-1" />
                  {preview.route_type}
                </Badge>
              </div>
            </div>
          )}

          {!loading && !error && !preview && (
            <div className="flex flex-col gap-3">
              <p className="text-muted-foreground text-sm">No route assigned for today.</p>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="self-start text-muted-foreground text-xs px-3 py-1.5 rounded-lg border border-border hover:text-foreground transition-colors"
                >
                  Retry
                </button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
