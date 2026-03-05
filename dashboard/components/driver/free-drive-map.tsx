'use client'
import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Search, X } from 'lucide-react'
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
    setDestination({ lat, lng, name: feature.place_name })
    setSearchResults([])
    setSearchQuery(feature.place_name)
  }

  const clearSearch = () => {
    setSearchQuery('')
    setSearchResults([])
    setDestination(null)
  }

  return (
    <div className="fixed inset-0">
      <NavigationMap mode="free-drive" destination={destination}>
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 z-10 p-3 flex items-start gap-2">
          <Button
            size="icon" variant="secondary"
            className="shrink-0 h-11 w-11 rounded-full shadow-lg bg-background/95 backdrop-blur-sm"
            onClick={() => router.back()}
          >
            <ArrowLeft className="size-5" />
          </Button>
          <div className="flex-1 relative">
            <div className="flex items-center gap-2 bg-background/95 backdrop-blur-sm rounded-2xl shadow-lg px-4 h-11">
              <Search className="size-4 text-muted-foreground shrink-0" />
              <input
                className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
                placeholder="Search address or place..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
              {searchQuery && (
                <button onClick={clearSearch} className="shrink-0 text-muted-foreground hover:text-foreground">
                  <X className="size-4" />
                </button>
              )}
            </div>
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-background/95 backdrop-blur-sm rounded-2xl shadow-lg overflow-hidden">
                {searchResults.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => handleSelectResult(r)}
                    className="w-full text-left px-4 py-3 text-sm hover:bg-muted transition-colors border-b border-border last:border-0"
                  >
                    <span className="line-clamp-1">{r.place_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </NavigationMap>
    </div>
  )
}
