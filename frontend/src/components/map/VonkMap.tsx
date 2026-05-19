import L from "leaflet";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";

L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

const CATEGORY_GRADIENT: Record<string, string> = {
  social: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
  active: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
  creative: "linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)",
  learning: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
  quiet: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
  food: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
};

const CATEGORY_GLYPH: Record<string, string> = {
  social: "👥",
  active: "⚡",
  creative: "🎨",
  learning: "📚",
  quiet: "🌿",
  food: "🍳",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Build a Booking.com-style label pill for the marker — category emoji +
 * truncated title, anchored at its bottom point. Highlighted state grows
 * and gains an amber outline.
 *
 * iconAnchor [50% of estimated width, full height] so the pill's bottom
 * edge sits on the venue coordinate.
 */
function buildPillIcon(
  _title: string,
  category: string | undefined,
  highlighted: boolean,
  isFull: boolean,
): L.DivIcon {
  const cat = category ?? "social";
  const gradient = CATEGORY_GRADIENT[cat] ?? CATEGORY_GRADIENT.social;
  const glyph = CATEGORY_GLYPH[cat] ?? "🔥";

  // Round icon-only marker with a downward tail.
  const size = highlighted ? 44 : 36;
  const fontSize = highlighted ? 22 : 18;
  const ring = highlighted
    ? "0 0 0 3px rgba(251,191,36,0.6), 0 6px 14px rgba(0,0,0,0.45)"
    : "0 2px 6px rgba(0,0,0,0.4)";
  const opacity = isFull ? 0.55 : 1;
  const tailExtent = highlighted ? 7 : 6;
  const totalH = size + tailExtent;

  const html = `
    <div style="position:relative;width:${size}px;height:${totalH}px;">
      <div style="
        position:absolute;
        top:0;
        left:0;
        width:${size}px;
        height:${size}px;
        border-radius:50%;
        background:${gradient};
        box-shadow:${ring};
        opacity:${opacity};
        display:flex;
        align-items:center;
        justify-content:center;
        cursor:pointer;
      ">
        <span style="
          font-size:${fontSize}px;
          line-height:1;
          filter:drop-shadow(0 1px 1px rgba(0,0,0,0.45));
        ">${glyph}</span>
        ${isFull ? `<span style="
          position:absolute;
          top:-4px;
          right:-4px;
          background:#1c0f0a;
          color:#fbbf24;
          font-size:8px;
          font-weight:700;
          letter-spacing:0.05em;
          text-transform:uppercase;
          padding:2px 5px;
          border-radius:9999px;
          font-family:Inter,system-ui,sans-serif;
        ">full</span>` : ""}
      </div>
      <div style="
        position:absolute;
        left:50%;
        top:${size - tailExtent}px;
        width:${tailExtent * 2}px;
        height:${tailExtent * 2}px;
        margin-left:-${tailExtent}px;
        background:${gradient};
        transform:rotate(45deg);
        opacity:${opacity};
        box-shadow:${highlighted ? "0 0 0 1px rgba(251,191,36,0.6)" : "0 1px 1px rgba(0,0,0,0.25)"};
      "></div>
    </div>
  `;

  return L.divIcon({
    html,
    className: highlighted
      ? "vonk-marker vonk-marker-pill vonk-marker-active"
      : "vonk-marker vonk-marker-pill",
    iconSize: [size, totalH],
    // Anchor at the pointer tip (bottom of the tail).
    iconAnchor: [size / 2, totalH],
    popupAnchor: [0, -totalH],
  });
}

export type MapPoint = {
  id: string;
  lat: number;
  lon: number;
  title: string;
  subtitle?: string;
  when?: string;
  spots_left?: number;
  is_full?: boolean;
  imageUrl?: string;
  category?: string;
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

function ImageMarker({
  point,
  highlighted,
  onClick,
}: {
  point: MapPoint;
  highlighted: boolean;
  onClick?: (id: string) => void;
}) {
  // Re-create the divIcon only when the visible inputs change. Without
  // memoisation, react-leaflet would replace the marker on every parent render.
  const icon = useMemo(
    () => buildPillIcon(point.title, point.category, highlighted, !!point.is_full),
    [point.title, point.category, highlighted, point.is_full],
  );
  return (
    <Marker
      position={[point.lat, point.lon]}
      icon={icon}
      zIndexOffset={highlighted ? 1000 : 0}
      eventHandlers={onClick ? { click: () => onClick(point.id) } : undefined}
    >
      <Popup>
        <div className="font-semibold">{point.title}</div>
        {point.subtitle && <div className="text-xs opacity-70">{point.subtitle}</div>}
        {point.when && <div className="text-xs mt-1">{point.when}</div>}
        {point.is_full ? (
          <div className="text-xs mt-1 font-semibold">Full</div>
        ) : point.spots_left != null ? (
          <div className="text-xs mt-1">
            {point.spots_left} spot{point.spots_left === 1 ? "" : "s"} left
          </div>
        ) : null}
      </Popup>
    </Marker>
  );
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
          <ImageMarker
            key={p.id}
            point={p}
            highlighted={highlightedId === p.id}
            onClick={onPointClick}
          />
        ))}
      </MapContainer>
    </div>
  );
}
