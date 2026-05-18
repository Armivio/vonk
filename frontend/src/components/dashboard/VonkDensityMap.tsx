import L from "leaflet";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import { CircleMarker, MapContainer, Tooltip, TileLayer } from "react-leaflet";

L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

export type DensityPoint = {
  id: string;
  lat: number;
  lon: number;
  title: string;
  category: string;
  participants: number;
};

const CATEGORY_COLOR: Record<string, string> = {
  social: "#3b82f6",
  active: "#16a34a",
  creative: "#a855f7",
  learning: "#0ea5e9",
  quiet: "#64748b",
  food: "#f97316",
};

export function VonkDensityMap({
  center,
  points,
  height = "100%",
}: {
  center: [number, number];
  points: DensityPoint[];
  height?: string;
}) {
  return (
    <div style={{ height }}>
      <MapContainer center={center} zoom={12} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {points.map((p) => {
          const color = CATEGORY_COLOR[p.category] ?? "#1e40af";
          const radius = Math.max(8, Math.min(28, 8 + p.participants * 3));
          return (
            <CircleMarker
              key={p.id}
              center={[p.lat, p.lon]}
              radius={radius}
              pathOptions={{
                color,
                fillColor: color,
                fillOpacity: 0.45,
                weight: 2,
              }}
            >
              <Tooltip direction="top" offset={[0, -radius]} opacity={0.95}>
                <div className="text-xs">
                  <div className="font-semibold">{p.title}</div>
                  <div className="text-slate-500 capitalize">
                    {p.category} · {p.participants} {p.participants === 1 ? "participant" : "participants"}
                  </div>
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
