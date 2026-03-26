import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit, getCachedJson, getClientIp, setCachedJson } from "../_lib/rate-limit"

type NominatimSuggestion = {
  display_name?: string
}

type AddressSuggestion = {
  label: string
  address: string
  source: "google" | "nominatim"
  place_id?: string
}

type GooglePlacesAutocompleteResponse = {
  suggestions?: Array<{
    placePrediction?: {
      placeId?: string
      text?: {
        text?: string
      }
    }
  }>
}

const SEARCH_CACHE_TTL_SECONDS = 5 * 60
const SEARCH_RATE_LIMIT_PER_MINUTE = 60

async function googleSuggestions(query: string, apiKey: string): Promise<AddressSuggestion[]> {
  const upstream = await fetch(
    "https://places.googleapis.com/v1/places:autocomplete",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text",
      },
      body: JSON.stringify({
        input: query,
        includedPrimaryTypes: ["school"],
        includedRegionCodes: ["us"],
        languageCode: "en",
      }),
      cache: "no-store",
    }
  )
  if (!upstream.ok) return []

  const payload = (await upstream.json()) as GooglePlacesAutocompleteResponse
  return (payload.suggestions ?? [])
    .map((item) => item.placePrediction)
    .filter((prediction): prediction is NonNullable<typeof prediction> => Boolean(prediction))
    .map((item) => ({
      label: item.text?.text?.trim() ?? "",
      address: item.text?.text?.trim() ?? "",
      source: "google" as const,
      place_id: item.placeId,
    }))
    .filter((item) => item.address.length > 0 && Boolean(item.place_id))
}

async function nominatimSuggestions(query: string): Promise<AddressSuggestion[]> {
  const upstream = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=us&q=${encodeURIComponent(query)}`,
    {
      headers: {
        "Accept-Language": "en-US",
        "User-Agent": "RouteGuard/1.0 (Address Lookup)",
      },
      cache: "no-store",
    }
  )
  if (!upstream.ok) return []

  const results = (await upstream.json()) as NominatimSuggestion[]
  return results
    .map((item) => item.display_name?.trim() ?? "")
    .filter((item) => item.length > 0)
    .map((address) => ({
      label: address,
      address,
      source: "nominatim" as const,
    }))
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? ""
  const googleApiKey = process.env.GOOGLE_MAPS_API_KEY?.trim() ?? ""
  const clientIp = getClientIp(request)
  const normalizedQuery = query.trim().toLowerCase()

  const rateLimit = await checkRateLimit("geo-address-search", clientIp, SEARCH_RATE_LIMIT_PER_MINUTE, 60_000)
  if (!rateLimit.allowed) {
    return NextResponse.json({ items: [] as AddressSuggestion[] }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } })
  }

  if (query.length < 3) {
    return NextResponse.json({ items: [] as AddressSuggestion[] })
  }

  const cacheKey = `rg:geo:cache:address-search:${normalizedQuery}`
  const cached = await getCachedJson<AddressSuggestion[]>(cacheKey)
  if (cached) {
    return NextResponse.json({ items: cached })
  }

  try {
    let items: AddressSuggestion[] = []
    if (googleApiKey) {
      items = await googleSuggestions(query, googleApiKey)
    }
    if (items.length === 0) {
      items = await nominatimSuggestions(query)
    }
    await setCachedJson(cacheKey, items, SEARCH_CACHE_TTL_SECONDS)
    return NextResponse.json({ items })
  } catch {
    return NextResponse.json({ items: [] as AddressSuggestion[] })
  }
}
