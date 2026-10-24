// Straight-line ("as the crow flies") distance using the Haversine formula.
// This is NOT a walking route. Real walking routes need a routing engine and road data.

export type LatLng = { lat: number; lng: number };

export type ResourceType = 'tcc' | 'police' | 'cpf' | 'shelter' | 'hotline';

export type Resource = {
  id: string;
  name: string;
  type: ResourceType;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  hours: string | null;
  last_verified: string | null; // ISO date or null
  source: string;
};

const EARTH_RADIUS_KM = 6371.0088;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type ResourceWithDistance = Resource & { distanceKm: number | null };

/** Resources with coordinates sorted nearest-first; those without coordinates (hotlines) come first. */
export function sortByDistance(resources: Resource[], from: LatLng | null): ResourceWithDistance[] {
  const withDist = resources.map<ResourceWithDistance>((r) => ({
    ...r,
    distanceKm: from && r.lat != null && r.lng != null ? haversineKm(from, { lat: r.lat, lng: r.lng }) : null,
  }));
  return withDist.sort((a, b) => {
    if (a.distanceKm == null && b.distanceKm == null) return 0;
    if (a.distanceKm == null) return -1;
    if (b.distanceKm == null) return 1;
    return a.distanceKm - b.distanceKm;
  });
}

export function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

const STALE_AFTER_DAYS = 180;

export function verificationLabel(r: Resource, now: Date = new Date()): { text: string; stale: boolean } {
  if (!r.last_verified) return { text: 'Unverified: confirm before relying on this', stale: true };
  const days = Math.floor((now.getTime() - new Date(r.last_verified).getTime()) / 86_400_000);
  if (days > STALE_AFTER_DAYS) return { text: `May be out of date (checked ${r.last_verified})`, stale: true };
  return { text: `Checked ${r.last_verified}`, stale: false };
}
