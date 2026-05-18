import { forwardRef, useState } from "react";
import { Link } from "react-router-dom";
import { useUser } from "../../context/UserContext";
import { api, ApiError, type VonkOut } from "../../lib/api";
import { shareVonk } from "../../lib/share";

const CATEGORY_GLYPH: Record<string, string> = {
  social: "👥",
  active: "⚡",
  creative: "🎨",
  learning: "📚",
  quiet: "🌿",
  food: "🍳",
};

const CATEGORY_GRADIENT: Record<string, string> = {
  social: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
  active: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
  creative: "linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)",
  learning: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
  quiet: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
  food: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
};

export const VonkCard = forwardRef<HTMLDivElement, { vonk: VonkOut; onChanged?: (v: VonkOut) => void }>(
  function VonkCard({ vonk, onChanged }, ref) {
    const { user } = useUser();
    const [joined, setJoined] = useState(vonk.joined);
    const [count, setCount] = useState(vonk.participants_count);
    const [busy, setBusy] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [pulseJoin, setPulseJoin] = useState(false);

    const cat = vonk.category ?? "social";
    const gradient = CATEGORY_GRADIENT[cat] ?? CATEGORY_GRADIENT.social;
    const glyph = CATEGORY_GLYPH[cat] ?? "🔥";
    const when = formatWhen(vonk.scheduled_at);
    const isFull = vonk.is_full || count >= vonk.max_participants;
    const isHost = !!user && user.id === vonk.creator_id;

    async function toggle(e: React.MouseEvent) {
      e.preventDefault();
      e.stopPropagation();
      if (busy) return;
      setBusy(true);
      const prevJoined = joined;
      const prevCount = count;
      setJoined(!prevJoined);
      setCount(prevJoined ? Math.max(0, prevCount - 1) : prevCount + 1);
      try {
        if (prevJoined) {
          await api.post(`/api/vonk/${vonk.id}/leave`);
        } else {
          const updated = await api.post<VonkOut>(`/api/vonk/${vonk.id}/join`);
          setCount(updated.participants_count);
          setJoined(updated.joined);
          setPulseJoin(true);
          setTimeout(() => setPulseJoin(false), 650);
          onChanged?.(updated);
        }
      } catch (err) {
        setJoined(prevJoined);
        setCount(prevCount);
        if (err instanceof ApiError && err.status === 409) {
          setToast("Just filled up");
          setTimeout(() => setToast(null), 1800);
        } else if (err instanceof ApiError && err.status === 401) {
          setToast("Refresh once — issuing session");
          setTimeout(() => setToast(null), 1800);
        }
      } finally {
        setBusy(false);
      }
    }

    async function share(e: React.MouseEvent) {
      e.preventDefault();
      e.stopPropagation();
      const result = await shareVonk({ id: vonk.id, title: vonk.title });
      if (result === "copied") {
        setToast("Link copied!");
        setTimeout(() => setToast(null), 1800);
      }
    }

    return (
      <div ref={ref}>
        <Link
          to={`/vonk/${vonk.id}`}
          className="ember-card vonk-card-hover block overflow-hidden hover:border-amber-glow/40 hover:shadow-ember group"
        >
          <div
            className="relative h-32 overflow-hidden flex items-center justify-center"
            style={{ background: gradient }}
          >
            <span className="text-6xl opacity-90 drop-shadow-lg">{glyph}</span>
            <span className="absolute top-3 right-3 bg-ember-900/80 text-amber-soft text-[10px] uppercase tracking-widest px-2 py-1 rounded-full backdrop-blur-sm">
              {glyph} {cat}
            </span>
            {isFull && (
              <span className="absolute top-3 left-3 bg-amber-glow/90 text-ember-950 text-[10px] uppercase tracking-widest px-2 py-1 rounded-full font-semibold">
                Full
              </span>
            )}
            {isHost && (
              <span className="absolute bottom-3 left-3 bg-ember-950/80 text-amber-glow text-[10px] uppercase tracking-widest px-2 py-1 rounded-full font-semibold">
                ★ Host
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
            <div className="flex items-center justify-between text-xs mb-3">
              <span className="text-amber-glow">{when}</span>
              <span className={isFull ? "text-amber-50/40" : "text-amber-50/60"}>
                {isFull
                  ? `${count}/${vonk.max_participants} · full`
                  : `${Math.max(0, vonk.max_participants - count)} spot${
                      vonk.max_participants - count === 1 ? "" : "s"
                    } left`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={toggle}
                disabled={busy || (isFull && !joined)}
                className={
                  (joined
                    ? "flex-1 px-3 py-2 rounded-full border border-amber-glow/40 text-amber-soft text-sm font-medium hover:bg-amber-glow/10 transition disabled:opacity-50"
                    : "flex-1 px-3 py-2 rounded-full bg-amber-glow text-ember-950 text-sm font-semibold hover:bg-amber-soft transition disabled:opacity-50") +
                  (pulseJoin ? " vonk-join-pulse" : "")
                }
              >
                {busy ? "…" : joined ? (pulseJoin ? "✓ Joined" : "Leave this Vonk") : isFull ? "Full" : "Join this Vonk"}
              </button>
              <button
                onClick={share}
                className="px-3 py-2 rounded-full border border-ember-700 text-amber-50/70 text-sm hover:border-amber-glow/40 hover:text-amber-soft transition"
                title="Share"
                aria-label="Share"
              >
                ↗
              </button>
            </div>
            {toast && <div className="text-amber-glow text-xs mt-2">{toast}</div>}
          </div>
        </Link>
      </div>
    );
  },
);

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
