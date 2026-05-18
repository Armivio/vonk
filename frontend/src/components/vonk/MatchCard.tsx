import { Link } from "react-router-dom";
import type { MatchOut } from "../../lib/api";

export function MatchCard({ match }: { match: MatchOut }) {
  const isVonk = match.type === "vonk";
  const title = match.preview.title ?? "Someone nearby";
  const subtitle = isVonk ? match.preview.location_name : match.preview.description;

  return (
    <div className="ember-card p-5">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs uppercase tracking-widest text-amber-glow/80">
              {isVonk ? "Gathering" : "Compatible gloed"}
            </span>
            <span className="text-amber-50/30 text-xs">·</span>
            <span className="text-amber-50/60 text-xs">{match.score}% spark</span>
          </div>
          <div className="text-amber-soft font-semibold leading-tight">{title}</div>
          {subtitle && <div className="text-amber-50/60 text-xs mt-0.5">{subtitle}</div>}
        </div>
        {match.distance_km != null && (
          <span className="text-amber-50/40 text-xs whitespace-nowrap">{match.distance_km} km</span>
        )}
      </div>
      <p className="text-amber-50/80 text-sm mt-3 italic">"{match.reason}"</p>
      <p className="text-amber-50/60 text-xs mt-2">→ {match.suggested_activity}</p>
      {isVonk && (
        <Link to={`/vonk/${match.id}`} className="ember-button-ghost mt-4 w-full justify-center">
          Open this vonk
        </Link>
      )}
    </div>
  );
}
