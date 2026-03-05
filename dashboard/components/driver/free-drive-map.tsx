'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { ArrowLeft, Locate, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

interface GeocodingFeature {
  id: string
  place_name: string
  center: [number, number]
}

export default function FreeDriveMap() {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const locationMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const destMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const watchIdRef = useRef<number | null>(null)
  const followRef = useRef(true)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null)
  const [following, setFollowing] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<GeocodingFeature[]>([])
  const [locationDenied, setLocationDenied] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)

  // Init map
  useEffect(() => {
    if (!containerRef.current) return

    if (!mapboxgl.supported()) {
      setMapError('This device does not support WebGL, which is required for the map.')
      return
    }

    let map: mapboxgl.Map
    try {
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [-98.5, 39.5],
        zoom: 4,
      })
    } catch (err) {
      setMapError(err instanceof Error ? err.message : 'Failed to initialize map.')
      return
    }

    map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'bottom-right')
    mapRef.current = map

    map.on('dragstart', () => {
      followRef.current = false
      setFollowing(false)
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // GPS tracking
  useEffect(() => {
    if (!navigator.geolocation) return

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        setUserPos({ lat, lng })

        const map = mapRef.current
        if (!map) return

        if (locationMarkerRef.current) {
          locationMarkerRef.current.setLngLat([lng, lat])
        } else {
          const dot = document.createElement('div')
          dot.style.cssText = [
            'width:18px',
            'height:18px',
            'border-radius:50%',
            'background:#3b82f6',
            'border:3px solid #fff',
            'box-shadow:0 0 0 4px rgba(59,130,246,0.25)',
          ].join(';')
          locationMarkerRef.current = new mapboxgl.Marker({ element: dot })
            .setLngLat([lng, lat])
            .addTo(map)
        }

        if (followRef.current) {
          map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 15) })
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setLocationDenied(true)
      },
      { enableHighAccuracy: true, maximumAge: 3000 }
    )

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
    }
  }, [])

  // Address search with debounce
  const runSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([])
      return
    }
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&types=address,place,poi&limit=5`
      )
      const data = await res.json() as { features?: GeocodingFeature[] }
      setSearchResults(data.features ?? [])
    } catch {
      setSearchResults([])
    }
  }, [])

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(value), 400)
  }

  const handleSelectResult = (feature: GeocodingFeature) => {
    const [lng, lat] = feature.center
    const map = mapRef.current
    if (!map) return

    destMarkerRef.current?.remove()
    destMarkerRef.current = new mapboxgl.Marker({ color: '#ef4444' })
      .setLngLat([lng, lat])
      .setPopup(new mapboxgl.Popup({ offset: 25 }).setText(feature.place_name))
      .addTo(map)
      .togglePopup()

    map.flyTo({ center: [lng, lat], zoom: 15 })
    followRef.current = false
    setFollowing(false)
    setSearchResults([])
    setSearchQuery(feature.place_name)
  }

  const clearSearch = () => {
    setSearchQuery('')
    setSearchResults([])
    destMarkerRef.current?.remove()
    destMarkerRef.current = null
  }

  const handleLocate = () => {
    if (!userPos || !mapRef.current) return
    followRef.current = true
    setFollowing(true)
    mapRef.current.easeTo({ center: [userPos.lng, userPos.lat], zoom: 15 })
  }

  if (mapError) {
    return (
      <div className="fixed inset-0 overflow-hidden flex flex-col">
        <div className="flex items-center gap-2 px-3 py-3 border-b border-border">
          <Button
            size="icon"
            variant="secondary"
            className="shrink-0 h-11 w-11 rounded-full"
            onClick={() => router.back()}
          >
            <ArrowLeft className="size-5" />
          </Button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-foreground font-medium">Map unavailable</p>
          <p className="text-muted-foreground text-sm">{mapError}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 overflow-hidden">
      {/* Map canvas */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Top bar: back + search */}
      <div className="absolute top-0 left-0 right-0 z-10 p-3 flex items-start gap-2">
        <Button
          size="icon"
          variant="secondary"
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
              <button
                onClick={clearSearch}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
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

      {/* Locate me button - positioned left of Mapbox nav controls */}
      <div className="absolute bottom-8 right-16 z-10">
        <Button
          size="icon"
          variant={following ? 'default' : 'secondary'}
          className="h-10 w-10 rounded-full shadow-lg bg-background/95 backdrop-blur-sm"
          onClick={handleLocate}
          disabled={!userPos}
          title="Center on my location"
        >
          <Locate className="size-5" />
        </Button>
      </div>

      {/* GPS denied notice */}
      {locationDenied && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-10 bg-background/95 backdrop-blur-sm rounded-xl shadow-lg px-4 py-2 text-sm text-muted-foreground whitespace-nowrap">
          Location access denied - enable GPS for positioning
        </div>
      )}
    </div>
  )
}
