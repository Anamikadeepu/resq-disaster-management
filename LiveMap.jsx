import { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// ==============================================================
// LIVE MAP
// ==============================================================
//
// A real, interactive OpenStreetMap map (via Leaflet) showing:
//   - the user's current location
//   - real nearby places (hospitals / shelters) as markers
//
// Uses OpenStreetMap tiles — free, no API key, no billing.
// If you ever want a different tile style (satellite, etc.) you
// can swap the `url` on <TileLayer> for a provider like Mapbox
// or Stadia Maps (those need a free API key).
// ==============================================================

function emojiIcon(emoji, size = 30) {
  return L.divIcon({
    html: `<div style="font-size:${size}px; line-height:1; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.35));">${emoji}</div>`,
    className: "emoji-marker",
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
}

const userIcon = emojiIcon("📍", 30);
const hospitalIcon = emojiIcon("🏥", 28);
const shelterIcon = emojiIcon("🏫", 28);

// Keeps the map centered if the user's coordinates change
// (e.g. they search a different location) without remounting
// the whole map.
function RecenterOnChange({ lat, lon }) {
  const map = useMap();

  useEffect(() => {
    map.setView([lat, lon], map.getZoom());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon]);

  return null;
}

export default function LiveMap({
  coords,
  places = [],
  placeType = "shelter", // "hospital" | "shelter"
  height = 320,
}) {
  if (!coords) return null;

  const icon = placeType === "hospital" ? hospitalIcon : shelterIcon;

  return (
    <div className="live-map-wrapper" style={{ height }}>
      <MapContainer
        center={[coords.lat, coords.lon]}
        zoom={14}
        scrollWheelZoom={true}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <RecenterOnChange lat={coords.lat} lon={coords.lon} />

        <Marker position={[coords.lat, coords.lon]} icon={userIcon}>
          <Popup>📍 You are here</Popup>
        </Marker>

        {places.map((place) => (
          <Marker
            key={place.id}
            position={[place.lat, place.lon]}
            icon={icon}
          >
            <Popup>
              <strong>{place.name}</strong>
              <br />
              {place.distanceKm.toFixed(1)} km away
              <br />
              {place.category}
              <br />
              <a
                href={place.directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Get Directions
              </a>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
