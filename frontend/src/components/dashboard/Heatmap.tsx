import L from "leaflet";
import "leaflet.heat";
import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";

type Feature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: { intensity: number };
};

type FeatureCollection = { type: "FeatureCollection"; features: Feature[] };

function HeatLayer({ data }: { data: FeatureCollection }) {
  const map = useMap();
  const layerRef = useRef<L.Layer | null>(null);

  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    const pts = data.features.map((f) => [
      f.geometry.coordinates[1],
      f.geometry.coordinates[0],
      f.properties.intensity ?? 1,
    ]) as [number, number, number][];
    if (pts.length === 0) return;
    // @ts-expect-error leaflet.heat extends L at runtime
    layerRef.current = L.heatLayer(pts, {
      radius: 35,
      blur: 25,
      minOpacity: 0.4,
      gradient: { 0.2: "#bfdbfe", 0.5: "#3b82f6", 0.85: "#1e3a8a" },
    }).addTo(map);
    return () => {
      if (layerRef.current) map.removeLayer(layerRef.current);
    };
  }, [data, map]);

  return null;
}

export function Heatmap({
  center,
  data,
  height = "100%",
}: {
  center: [number, number];
  data: FeatureCollection;
  height?: string;
}) {
  return (
    <div style={{ height }}>
      <MapContainer center={center} zoom={12} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <HeatLayer data={data} />
      </MapContainer>
    </div>
  );
}
