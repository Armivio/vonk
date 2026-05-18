import { Link } from "react-router-dom";
import type { VonkOut } from "../../lib/api";

const CATEGORY_GLYPH: Record<string, string> = {
  social: "💬",
  active: "🏃",
  creative: "🎨",
  learning: "📚",
  quiet: "🌙",
  food: "🍲",
};

export function VonkCard({ vonk }: { vonk: VonkOut }) {
  const when = formatWhen(vonk.scheduled_at);
  const spots = Math.max(0, vonk.max_participants - vonk.participants_count);
  return (
    <Link
      to={`/vonk/${vonk.id}`}
      className="ember-card p-5 block hover:border-amber-glow/40 hover:shadow-ember transition"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{CATEGORY_GLYPH[vonk.category ?? ""] ?? "🔥"}</span>
          <div>
            <div className="text-amber-soft font-semibold leading-tight">{vonk.title}</div>
            <div className="text-amber-50/50 text-xs">{vonk.location_name ?? "Nearby"}</div>
          </div>
        </div>
        {vonk.distance_km != null && (
          <span className="text-amber-50/40 text-xs whitespace-nowrap">{vonk.distance_km} km</span>
        )}
      </div>
      {vonk.description && (
        <p className="text-amber-50/70 text-sm mb-3 line-clamp-2">{vonk.description}</p>
      )}
      <div className="flex items-center justify-between text-xs">
        <span className="text-amber-glow">{when}</span>
        <span className="text-amber-50/60">
          {spots > 0 ? `${spots} spot${spots === 1 ? "" : "s"} left` : "Full"}
        </span>
      </div>
    </Link>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffH = Math.round((d.getTime() - now.getTime()) / 36e5);
  if (diffH < 1) return "Starting soon";
  if (diffH < 12) return `In ${diffH}h`;
  if (sameDay(d, now)) return `Tonight ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  if (diffH < 36) return `Tomorrow ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  return d.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
