'use client'
import { User, MapPin, Bus, Hash, Navigation, Phone } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

interface RoutePreview {
  route_name: string
  route_type: string
  stop_count: number
  vehicle_name: string
  date: string
}

interface KioskContact {
  name: string
  phone: string
}

interface RouteSummaryProps {
  driverName: string
  preview: RoutePreview | null
  loading: boolean
  error: string | null
  contacts?: KioskContact[]
  onRetry?: () => void
}

export default function RouteSummary({ driverName, preview, loading, error, contacts = [], onRetry }: RouteSummaryProps) {
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
                <Button variant="outline" size="sm" onClick={onRetry} className="self-start">
                  Retry
                </Button>
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
              <p className="text-foreground text-sm font-medium">No routes assigned for today.</p>
              <p className="text-muted-foreground text-sm">
                Your work may be done, or a route may be assigned shortly.
              </p>
              {contacts.length > 0 && (
                <div className="flex flex-col gap-2 pt-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-widest font-medium">
                    Need help? Contact:
                  </p>
                  {contacts.map((c) => (
                    <a
                      key={c.phone}
                      href={`tel:${c.phone}`}
                      className="flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors"
                    >
                      <Phone className="size-4 shrink-0 text-muted-foreground" />
                      <span className="font-medium">{c.name}</span>
                      <span className="text-muted-foreground">{c.phone}</span>
                    </a>
                  ))}
                </div>
              )}
              {contacts.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  Contact your dispatcher or administrator if you need assistance.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
