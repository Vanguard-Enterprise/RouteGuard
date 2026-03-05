'use client'
import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Search, X, Navigation } from 'lucide-react'
import { Button } from '@/components/ui/button'
import NavigationMap from '@/components/driver/navigation-map'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

interface GeocodingFeature {
  id: string
  place_name: string
  center: [number, number]
}

export default function FreeDriveMap() {
  const router = useRouter()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<GeocodingFeature[]>([])
  const [pending, setPending] = useState<{ lat: number; lng: number; name: string } | null>(null)
  const [destination, setDestination] = useState<{ lat: number; lng: number; name: string } | null>(null)

  const runSearch = useCallback(async (query: string) => {
    if (!query.trim()) { setSearchResults([]); return }
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&types=address,place,poi&limit=5`
      )
      const data = (await res.json()) as { features?: GeocodingFeature[] }
      setSearchResults(data.features ?? [])
    } catch { setSearchResults([]) }
  }, [])

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(value), 400)
  }

  const handleSelectResult = (feature: GeocodingFeature) => {
    const [lng, lat] = feature.center
    setPending({ lat, lng, name: feature.place_name })
    setSearchResults([])
    setSearchQuery(feature.place_name)
  }

  const startNavigation = () => {
    if (!pending) return
    setDestination(pending)
    setPending(null)
  }

  const clearDestination = () => {
    setSearchQuery('')
    setSearchResults([])
    setPending(null)
    setDestination(null)
  }

  return (
    <div className="fixed inset-0">
      <NavigationMap mode="free-drive" destination={destination}>
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 z-[1000] p-3 flex items-start gap-2">
          <Button
            size="icon" variant="secondary"
            className="shrink-0 h-12 w-12 rounded-full shadow-lg bg-background/95 backdrop-blur-sm"
            onClick={() => router.push('/driver')}
          >
            <ArrowLeft className="size-5" />
          </Button>
          <div className="flex-1 relative">
            <div className="flex items-center gap-2 bg-background/95 backdrop-blur-sm rounded-2xl shadow-lg px-4 h-12">
              <Search className="size-4 text-muted-foreground shrink-0" />
              <input
                className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
                placeholder="Search address or place..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
              {searchQuery && (
                <button onClick={clearDestination} className="shrink-0 p-1 text-muted-foreground">
                  <X className="size-4" />
                </button>
              )}
            </div>
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-background rounded-2xl shadow-lg overflow-hidden">
                {searchResults.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => handleSelectResult(r)}
                    className="w-full text-left px-4 py-4 text-sm hover:bg-muted transition-colors border-b border-border last:border-0"
                  >
                    <span className="line-clamp-1">{r.place_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Start navigation panel */}
        {pending && !destination && (
          <div className="absolute bottom-0 left-0 right-0 z-[1000] p-4 bg-background shadow-2xl rounded-t-3xl">
            <p className="text-xs text-muted-foreground mb-1">Navigate to</p>
            <p className="font-semibold text-foreground text-base mb-4 line-clamp-2">{pending.name}</p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 h-14 text-base rounded-2xl"
                onClick={clearDestination}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 h-14 text-base rounded-2xl bg-[#1B3A5C] text-white gap-2"
                onClick={startNavigation}
              >
                <Navigation className="size-5" />
                Start
              </Button>
            </div>
          </div>
        )}

        {/* Active navigation - stop button */}
        {destination && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000]">
            <Button
              variant="destructive"
              className="h-12 px-6 rounded-full shadow-lg text-sm font-semibold"
              onClick={clearDestination}
            >
              Stop Navigation
            </Button>
          </div>
        )}
      </NavigationMap>
    </div>
  )
}
