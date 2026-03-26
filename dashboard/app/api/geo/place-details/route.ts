import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit, getCachedJson, getClientIp, setCachedJson } from "../_lib/rate-limit"

type GooglePlacesTextSearchResponse = {
  places?: Array<{
    id?: string
  }>
}

type GooglePlacesDetailsResponse = {
  id?: string
  displayName?: {
    text?: string
  }
  formattedAddress?: string
  nationalPhoneNumber?: string
  internationalPhoneNumber?: string
}

type PlaceDetailsPayload = {
  name: string
  address: string
  phone: string
}

const PLACE_DETAILS_CACHE_TTL_SECONDS = 60 * 60
const PLACE_DETAILS_RATE_LIMIT_PER_MINUTE = 40

async function fetchPlaceDetails(placeId: string, apiKey: string): Promise<PlaceDetailsPayload> {
  const upstream = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "id,displayName.text,formattedAddress,nationalPhoneNumber,internationalPhoneNumber",
      },
      cache: "no-store",
    }
  )

  if (!upstream.ok) {
    return { name: "", address: "", phone: "" }
  }

  const payload = (await upstream.json()) as GooglePlacesDetailsResponse
  return {
    name: payload.displayName?.text?.trim() ?? "",
    address: payload.formattedAddress?.trim() ?? "",
    phone: payload.nationalPhoneNumber?.trim() ?? payload.internationalPhoneNumber?.trim() ?? "",
  }
}

async function findPlaceIdFromQuery(query: string, apiKey: string): Promise<string> {
  const upstream = await fetch(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.id",
      },
      body: JSON.stringify({
        textQuery: query,
        languageCode: "en",
        regionCode: "US",
        pageSize: 1,
      }),
      cache: "no-store",
    }
  )
  if (!upstream.ok) return ""

  const payload = (await upstream.json()) as GooglePlacesTextSearchResponse
  return payload.places?.[0]?.id?.trim() ?? ""
}

export async function GET(request: NextRequest) {
  const placeId = request.nextUrl.searchParams.get("place_id")?.trim() ?? ""
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? ""
  const googleApiKey = process.env.GOOGLE_MAPS_API_KEY?.trim() ?? ""
  const clientIp = getClientIp(request)
  const normalizedQuery = query.trim().toLowerCase()

  const rateLimit = await checkRateLimit("geo-place-details", clientIp, PLACE_DETAILS_RATE_LIMIT_PER_MINUTE, 60_000)
  if (!rateLimit.allowed) {
    return NextResponse.json({ name: "", address: "", phone: "" }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } })
  }

  if ((!placeId && !query) || !googleApiKey) {
    return NextResponse.json({ name: "", address: "", phone: "" })
  }

  try {
    const cacheKey = placeId ? `rg:geo:cache:place-details:place:${placeId}` : `rg:geo:cache:place-details:query:${normalizedQuery}`
    const cached = await getCachedJson<PlaceDetailsPayload>(cacheKey)
    if (cached) {
      return NextResponse.json(cached)
    }

    let resolvedPlaceId = placeId
    if (!resolvedPlaceId && query) {
      resolvedPlaceId = await findPlaceIdFromQuery(query, googleApiKey)
    }
    if (!resolvedPlaceId) {
      return NextResponse.json({ name: "", address: "", phone: "" })
    }

    const payload = await fetchPlaceDetails(resolvedPlaceId, googleApiKey)
    await setCachedJson(cacheKey, payload, PLACE_DETAILS_CACHE_TTL_SECONDS)
    if (query) {
      await setCachedJson(`rg:geo:cache:place-details:query:${normalizedQuery}`, payload, PLACE_DETAILS_CACHE_TTL_SECONDS)
    }
    await setCachedJson(`rg:geo:cache:place-details:place:${resolvedPlaceId}`, payload, PLACE_DETAILS_CACHE_TTL_SECONDS)
    return NextResponse.json(payload)
  } catch {
    return NextResponse.json({ name: "", address: "", phone: "" })
  }
}
