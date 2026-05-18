import L from "leaflet";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";

L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

const fireIcon = L.divIcon({
  html: "🔥",
  className: "vonk-marker",
  iconSize: [28, 28],
  iconAnchor: [14, 14],
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

export function VonkMap({
  center,
  points,
  height = "100%",
  onPointClick,
}: {
  center: [number, number];
  points: MapPoint[];
  height?: string;
  onPointClick?: (id: string) => void;
}) {
  return (
    <div style={{ height }}>
      <MapContainer center={center} zoom={13} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {points.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lon]}
            icon={fireIcon}
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
