import L from "leaflet";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";

L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

export type MapPoint = {
  id: string;
  lat: number;
  lon: number;
  title: string;
  subtitle?: string;
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
            eventHandlers={onPointClick ? { click: () => onPointClick(p.id) } : undefined}
          >
            <Popup>
              <div className="font-semibold">{p.title}</div>
              {p.subtitle && <div className="text-xs opacity-70">{p.subtitle}</div>}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
