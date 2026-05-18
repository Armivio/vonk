import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type VonkOut } from "../../lib/api";

export function NotificationsBell() {
  const [upcoming, setUpcoming] = useState<VonkOut[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const list = await api.get<VonkOut[]>("/api/vonk/upcoming-mine?hours_ahead=2");
        if (!cancelled) setUpcoming(list);
      } catch {
        /* unauthenticated users get 401 — silently ignored */
      }
    }
    void poll();
    const t = setInterval(poll, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const hasUpcoming = upcoming.length > 0;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className="relative w-9 h-9 rounded-full border border-ember-700 text-amber-50/70 hover:border-amber-glow/40 hover:text-amber-soft transition flex items-center justify-center"
      >
        🔔
        {hasUpcoming && (
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-glow border-2 border-ember-900 animate-pulse" />
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 ember-card p-4 shadow-ember z-40">
          <div className="text-amber-glow text-xs uppercase tracking-widest mb-2">
            Reminders
          </div>
          {hasUpcoming ? (
            <ul className="space-y-3">
              {upcoming.map((v) => (
                <li key={v.id}>
                  <Link
                    to={`/vonk/${v.id}`}
                    onClick={() => setOpen(false)}
                    className="block hover:bg-ember-900/50 rounded p-2 -m-2 transition"
                  >
                    <div className="text-amber-soft text-sm font-medium">🔥 {v.title}</div>
                    <div className="text-amber-50/60 text-xs">
                      📍 {v.location_name ?? "Nearby"} · {friendlyIn(v.scheduled_at)}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-amber-50/50 text-xs">
              Nothing scheduled in the next 2 hours.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function friendlyIn(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "starting now";
  const m = Math.round(ms / 60000);
  if (m < 60) return `in ${m} min`;
  const h = Math.round(m / 60);
  return `in ${h} hour${h === 1 ? "" : "s"}`;
}
