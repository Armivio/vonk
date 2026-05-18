import { Link } from "react-router-dom";
import type { AutoSubscribeAlternative, AutoSubscribedVonk } from "../../lib/api";

type Props = {
  vonk: AutoSubscribedVonk;
  alternatives?: AutoSubscribeAlternative[];
};

export function AutoSubscribedCard({ vonk, alternatives = [] }: Props) {
  const created = vonk.action === "created_and_joined";
  const headline = created ? "🔥 New spark lit!" : "✨ You're in!";
  const when = friendlyWhen(vonk.scheduled_at);
  return (
    <div className="mt-3 p-4 rounded-xl bg-amber-glow/10 border border-amber-glow/40">
      <div className="text-[10px] uppercase tracking-widest text-amber-glow mb-1">
        {headline}
      </div>
      <h4 className="text-amber-soft font-semibold text-base leading-tight">{vonk.title}</h4>
      <p className="text-amber-50/70 text-xs mt-0.5">
        {vonk.location_name ?? "Nearby"} · {when}
        {" · "}
        {vonk.spots_left > 0 ? `${vonk.spots_left} spot${vonk.spots_left === 1 ? "" : "s"} left` : "full"}
      </p>
      <div className="flex flex-wrap gap-2 mt-3">
        <Link
          to={`/vonk/${vonk.vonk_id}`}
          className="px-4 py-2 rounded-full bg-amber-glow text-ember-950 text-xs font-semibold hover:bg-amber-soft transition"
        >
          View your Vonk →
        </Link>
        <Link
          to="/discover"
          className="px-4 py-2 rounded-full border border-amber-glow/40 text-amber-soft text-xs hover:bg-amber-glow/10 transition"
        >
          See all sparks
        </Link>
      </div>
      {alternatives.length > 0 && (
        <div className="mt-3 pt-3 border-t border-amber-glow/20">
          <div className="text-amber-50/50 text-[10px] uppercase tracking-widest mb-1">
            Also nearby
          </div>
          <ul className="space-y-1">
            {alternatives.slice(0, 3).map((alt) => (
              <li key={alt.vonk_id}>
                <Link
                  to={`/vonk/${alt.vonk_id}`}
                  className="text-amber-50/80 text-xs hover:text-amber-soft transition"
                >
                  • {alt.title}
                  <span className="text-amber-50/40">
                    {" "}— {alt.location_name ?? "nearby"}, {friendlyWhen(alt.scheduled_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function friendlyWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffHours = diffMs / 36e5;
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (diffHours < 1) return `starting soon`;
  if (sameDay(d, now)) return `tonight at ${time}`;
  if (sameDay(d, new Date(now.getTime() + 86400000))) return `tomorrow at ${time}`;
  if (diffHours < 24 * 6) return `${d.toLocaleDateString([], { weekday: "long" }).toLowerCase()} at ${time}`;
  return d.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
