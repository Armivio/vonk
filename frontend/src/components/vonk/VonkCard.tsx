import { Link } from "react-router-dom";
import { imageForVonk } from "../../lib/categoryImages";
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
  const full = spots === 0;
  const img = imageForVonk(vonk.category, vonk.id);

  return (
    <Link
      to={`/vonk/${vonk.id}`}
      className="ember-card block overflow-hidden hover:border-amber-glow/40 hover:shadow-ember transition group"
    >
      <div className="relative h-32 overflow-hidden">
        <img
          src={img}
          alt=""
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ember-800/95 via-ember-800/30 to-transparent" />
        <span className="absolute top-3 right-3 bg-ember-900/80 text-amber-soft text-[10px] uppercase tracking-widest px-2 py-1 rounded-full backdrop-blur-sm">
          {CATEGORY_GLYPH[vonk.category ?? ""] ?? "🔥"} {vonk.category ?? "vonk"}
        </span>
        {full && (
          <span className="absolute top-3 left-3 bg-amber-glow/90 text-ember-950 text-[10px] uppercase tracking-widest px-2 py-1 rounded-full font-semibold">
            Full
          </span>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="text-amber-soft font-semibold leading-tight">{vonk.title}</div>
          {vonk.distance_km != null && (
            <span className="text-amber-50/40 text-xs whitespace-nowrap">{vonk.distance_km} km</span>
          )}
        </div>
        <div className="text-amber-50/50 text-xs mb-2">{vonk.location_name ?? "Nearby"}</div>
        {vonk.description && (
          <p className="text-amber-50/70 text-sm mb-3 line-clamp-2">{vonk.description}</p>
        )}
        <div className="flex items-center justify-between text-xs">
          <span className="text-amber-glow">{when}</span>
          <span className={full ? "text-amber-50/40" : "text-amber-50/60"}>
            {full
              ? `${vonk.participants_count}/${vonk.max_participants} · full`
              : `${spots} spot${spots === 1 ? "" : "s"} left`}
          </span>
        </div>
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
