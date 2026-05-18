import L from "leaflet";
import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";

const ROTTERDAM: [number, number] = [51.9225, 4.4792];

const pickerIcon = L.divIcon({
  html: "📍",
  className: "vonk-picker-marker",
  iconSize: [28, 28],
  iconAnchor: [14, 26],
});

export function LocationPickerMap({
  value,
  onChange,
}: {
  value: [number, number] | null;
  onChange: (latlon: [number, number]) => void;
}) {
  const center = value ?? ROTTERDAM;
  return (
    <div className="rounded-lg overflow-hidden border border-ember-700" style={{ height: 200 }}>
      <MapContainer center={center} zoom={13} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickCatcher onChange={onChange} />
        <Recenter target={value} />
        {value && <Marker position={value} icon={pickerIcon} />}
      </MapContainer>
    </div>
  );
}

function ClickCatcher({ onChange }: { onChange: (latlon: [number, number]) => void }) {
  useMapEvents({
    click(e) {
      onChange([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

function Recenter({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.panTo(target);
  }, [target, map]);
  return null;
}
