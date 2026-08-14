// ==============================================================
// PLACES SERVICE (Hospitals + Shelters)
// ==============================================================
//
// Uses the free OpenStreetMap Overpass API to pull REAL,
// live hospital / shelter locations around a given point.
// No API key, no billing, no signup required.
//
// Docs: https://wiki.openstreetmap.org/wiki/Overpass_API
//
// If you later want richer data (live "open now" status,
// ratings, phone numbers, photos) you can swap this file's
// query for the Google Places API "Nearby Search" endpoint,
// which needs a Google Cloud API key with billing enabled.
// The function signatures below are written so that swap only
// touches this file, not the UI components that call it.
// ==============================================================

// A few public Overpass mirrors — if the primary is overloaded
// (common on the free instance) we automatically fall back.
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const RADII_METERS = [5000, 15000, 30000];

// --------------------------------------------------------------
// Distance helper (Haversine formula, returns kilometres)
// --------------------------------------------------------------

export function distanceKm(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (value * Math.PI) / 180;

  const earthRadiusKm = 6371;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusKm * c;
}

// --------------------------------------------------------------
// Low level Overpass query runner
// --------------------------------------------------------------

async function runOverpassQuery(query) {
  let lastError = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "data=" + encodeURIComponent(query),
      });

      if (!response.ok) {
        throw new Error(
          `Overpass request failed (${response.status})`
        );
      }

      const data = await response.json();
      return data.elements || [];
    } catch (error) {
      lastError = error;
      // try the next mirror
    }
  }

  throw lastError || new Error("Unable to reach Overpass API.");
}

// --------------------------------------------------------------
// Turn a raw Overpass element into a clean place object
// --------------------------------------------------------------

function normalizePlace(element, lat, lon, fallbackName) {
  const elementLat = element.lat ?? element.center?.lat;
  const elementLon = element.lon ?? element.center?.lon;

  if (elementLat == null || elementLon == null) {
    return null;
  }

  const tags = element.tags || {};

  const addressParts = [
    tags["addr:housenumber"],
    tags["addr:street"],
    tags["addr:suburb"],
    tags["addr:city"],
  ].filter(Boolean);

  return {
    id: `${element.type}/${element.id}`,
    name: tags.name || fallbackName,
    lat: elementLat,
    lon: elementLon,
    distanceKm: distanceKm(lat, lon, elementLat, elementLon),
    address: addressParts.length
      ? addressParts.join(", ")
      : tags["addr:full"] || null,
    phone: tags.phone || tags["contact:phone"] || null,
    // OSM `emergency=*` tag: "yes" on a hospital usually means it
    // has an emergency room; "assembly_point"/"shelter" on other
    // features marks a designated emergency site.
    emergencyTag: tags.emergency || null,
    amenityTag: tags.amenity || null,
    category: fallbackName,
    directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${elementLat},${elementLon}`,
  };
}

// --------------------------------------------------------------
// Shared "search with expanding radius" runner
// --------------------------------------------------------------

async function searchExpandingRadius(
  buildQuery,
  lat,
  lon,
  minResults = 3
) {
  let results = [];

  for (const radius of RADII_METERS) {
    const query = buildQuery(lat, lon, radius);
    const elements = await runOverpassQuery(query);

    const seen = new Map();

    elements.forEach((element) => {
      const place = normalizePlace(
        element,
        lat,
        lon,
        element.tags?.amenity || "Place"
      );

      if (place && !seen.has(place.id)) {
        seen.set(place.id, place);
      }
    });

    results = Array.from(seen.values()).sort(
      (a, b) => a.distanceKm - b.distanceKm
    );

    if (results.length >= minResults) {
      break;
    }
  }

  return results;
}

// --------------------------------------------------------------
// HOSPITALS
// --------------------------------------------------------------

export async function fetchNearbyHospitals(lat, lon) {
  const buildQuery = (latitude, longitude, radius) => `
    [out:json][timeout:25];
    (
      node["amenity"="hospital"](around:${radius},${latitude},${longitude});
      way["amenity"="hospital"](around:${radius},${latitude},${longitude});
      node["healthcare"="hospital"](around:${radius},${latitude},${longitude});
      node["amenity"="clinic"](around:${radius},${latitude},${longitude});
      node["amenity"="doctors"](around:${radius},${latitude},${longitude});
    );
    out center 40;
  `;

  const places = await searchExpandingRadius(buildQuery, lat, lon);

  return places
    .map((place) => ({
      ...place,
      category:
        place.emergencyTag === "yes"
          ? "Hospital (24x7 Emergency)"
          : "Hospital / Medical",
    }))
    .slice(0, 12);
}

// --------------------------------------------------------------
// SHELTERS / EVACUATION SITES
// --------------------------------------------------------------
//
// OSM has no universal "disaster shelter" tag in most regions,
// so — matching real-world practice in India and elsewhere —
// we treat government schools, community centres and marked
// emergency assembly points/shelters as candidate safe buildings.
// --------------------------------------------------------------

export async function fetchNearbyShelters(lat, lon) {
  const buildQuery = (latitude, longitude, radius) => `
    [out:json][timeout:25];
    (
      node["emergency"="assembly_point"](around:${radius},${latitude},${longitude});
      node["emergency"="shelter"](around:${radius},${latitude},${longitude});
      node["amenity"="social_facility"]["social_facility"="shelter"](around:${radius},${latitude},${longitude});
      node["amenity"="community_centre"](around:${radius},${latitude},${longitude});
      way["amenity"="community_centre"](around:${radius},${latitude},${longitude});
      node["amenity"="school"](around:${radius},${latitude},${longitude});
      way["amenity"="school"](around:${radius},${latitude},${longitude});
    );
    out center 60;
  `;

  const places = await searchExpandingRadius(buildQuery, lat, lon);

  const labelFor = (place) => {
    if (place.emergencyTag === "assembly_point")
      return "Emergency Assembly Point";
    if (place.emergencyTag === "shelter")
      return "Emergency Shelter";
    if (place.amenityTag === "school")
      return "School (Evacuation Point)";
    if (place.amenityTag === "community_centre")
      return "Community Centre";
    if (place.amenityTag === "social_facility")
      return "Shelter Facility";
    return "Safe Building";
  };

  return places
    .map((place) => ({
      ...place,
      category: labelFor(place),
    }))
    .slice(0, 12);
}