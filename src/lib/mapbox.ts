const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  if (!address.trim()) return null;

  const encoded = encodeURIComponent(address.trim());
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${MAPBOX_TOKEN}&limit=1`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const feature = data.features?.[0];
    if (!feature) return null;

    const [lng, lat] = feature.center;
    return { lat, lng };
  } catch {
    return null;
  }
}

export async function getDirections(
  coords: [number, number][]
): Promise<{ geometry: any; duration: number; distance: number } | null> {
  if (coords.length < 2) return null;

  const coordString = coords.map(([lng, lat]) => `${lng},${lat}`).join(";");
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordString}?access_token=${MAPBOX_TOKEN}&geometries=geojson&overview=full`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const route = data.routes?.[0];
    if (!route) return null;

    return {
      geometry: route.geometry,
      duration: route.duration,
      distance: route.distance,
    };
  } catch {
    return null;
  }
}
