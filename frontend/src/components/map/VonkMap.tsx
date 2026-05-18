import L from "leaflet";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import { useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";

L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

const fireIcon = L.divIcon({
  html: "🔥",
  className: "vonk-marker",
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const fireIconHighlight = L.divIcon({
  html: "<span style='font-size:34px;filter:drop-shadow(0 0 8px #fbbf24)'>🔥</span>",
  className: "vonk-marker vonk-marker-active",
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

export type MapPoint = {
  id: string;
  lat: number;
  lon: number;
  title: string;
  subtitle?: string;
  when?: string;
  spots_left?: number;
  is_full?: boolean;
};

function FitToPoints({ points, fallbackCenter }: { points: MapPoint[]; fallbackCenter: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) {
      map.setView(fallbackCenter, 13);
      return;
    }
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lon], 14);
      return;
    }
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lon] as [number, number]));
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
  }, [map, points, fallbackCenter]);
  return null;
}

export function VonkMap({
  center,
  points,
  height = "100%",
  onPointClick,
  highlightedId,
}: {
  center: [number, number];
  points: MapPoint[];
  height?: string;
  onPointClick?: (id: string) => void;
  highlightedId?: string | null;
}) {
  return (
    <div style={{ height }}>
      <MapContainer center={center} zoom={13} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitToPoints points={points} fallbackCenter={center} />
        {points.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lon]}
            icon={highlightedId === p.id ? fireIconHighlight : fireIcon}
            zIndexOffset={highlightedId === p.id ? 1000 : 0}
            eventHandlers={onPointClick ? { click: () => onPointClick(p.id) } : undefined}
          >
            <Popup>
              <div className="font-semibold">{p.title}</div>
              {p.subtitle && <div className="text-xs opacity-70">{p.subtitle}</div>}
              {p.when && <div className="text-xs mt-1">{p.when}</div>}
              {p.is_full ? (
                <div className="text-xs mt-1 font-semibold">Full</div>
              ) : p.spots_left != null ? (
                <div className="text-xs mt-1">
                  {p.spots_left} spot{p.spots_left === 1 ? "" : "s"} left
                </div>
              ) : null}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
