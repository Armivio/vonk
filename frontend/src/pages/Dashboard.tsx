import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { GemeenteShell } from "../components/dashboard/GemeenteShell";
import { MetricCard } from "../components/dashboard/MetricCard";
import { TrendChart, type TrendPoint } from "../components/dashboard/TrendChart";
import { VonkDensityMap, type DensityPoint } from "../components/dashboard/VonkDensityMap";
import { api, type DashboardMetrics, type RecentVonk, type VonkOut } from "../lib/api";

const ROTTERDAM_CENTER: [number, number] = [51.9225, 4.4792];
const CITY = "Rotterdam";

const CATEGORY_LABEL: Record<string, string> = {
  social: "Social",
  active: "Active",
  creative: "Creative",
  learning: "Learning",
  quiet: "Quiet",
  food: "Food",
};

type State = {
  metrics: DashboardMetrics | null;
  series: TrendPoint[];
  points: DensityPoint[];
};

function useDashboardData(): State {
  const [state, setState] = useState<State>({
    metrics: null,
    series: [],
    points: [],
  });

  useEffect(() => {
    Promise.all([
      api.get<DashboardMetrics>(`/api/dashboard/metrics?city=${encodeURIComponent(CITY)}`),
      api.get<{ city: string; days: number; series: TrendPoint[] }>(
        `/api/dashboard/trends?city=${encodeURIComponent(CITY)}&days=7`,
      ),
      api.get<VonkOut[]>(
        `/api/vonk/discover?lat=${ROTTERDAM_CENTER[0]}&lon=${ROTTERDAM_CENTER[1]}&radius_km=15`,
      ),
    ]).then(([m, t, vs]) => {
      setState({
        metrics: m,
        series: t.series,
        points: vs
          .filter((v) => v.latitude && v.longitude)
          .map((v) => ({
            id: v.id,
            lat: v.latitude,
            lon: v.longitude,
            title: v.title,
            category: v.category ?? "social",
            participants: v.participants_count,
          })),
      });
    });
  }, []);

  return state;
}

export default function Dashboard() {
  return (
    <GemeenteShell>
      <Routes>
        <Route path="/" element={<OverviewTab />} />
        <Route path="/heatmap" element={<HeatmapTab />} />
        <Route path="/trends" element={<TrendsTab />} />
        <Route path="*" element={<Navigate to="/gemeente" replace />} />
      </Routes>
    </GemeenteShell>
  );
}

function OverviewTab() {
  const { metrics, series, points } = useDashboardData();
  const categoryCounts = useMemo(() => countBy(points, (p) => p.category), [points]);

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Active Vonken"
          value={metrics?.active_vonken ?? "—"}
          hint="Open & upcoming"
          icon="🔥"
        />
        <MetricCard
          label="Participants This Week"
          value={metrics?.unique_participants ?? "—"}
          hint="Unique residents"
          icon="👥"
        />
        <MetricCard
          label="Vuuren Formed"
          value={metrics?.vuuren_formed ?? "—"}
          hint="Recurring groups"
          icon="♨️"
        />
        <MetricCard
          label="Cross-Age Connections"
          value={metrics?.cross_age_vonken ?? "—"}
          hint="2+ age groups"
          icon="🧓"
        />
      </section>

      <section className="grid md:grid-cols-3 gap-3">
        <MetricCard label="Active gloeds" value={metrics?.active_gloeds ?? "—"} icon="✨" />
        <MetricCard
          label="Vonken this week"
          value={metrics?.vonken_this_week ?? "—"}
          icon="🔥"
          hint="Created in last 7 days"
        />
        <MetricCard
          label="Time to first vonk"
          value={metrics?.avg_time_to_first_vonk_days ?? "—"}
          unit="days"
          hint="for new residents"
          icon="⏱️"
        />
      </section>

      {metrics && metrics.cross_age_vonken > 0 && (
        <section className="gemeente-card p-5 border-l-4 border-l-gemeente-accent">
          <div className="text-gemeente-accent text-xs uppercase tracking-wider font-semibold mb-1">
            Highlight of the week
          </div>
          <p className="text-gemeente-ink">
            <span className="font-semibold">{metrics.cross_age_vonken} cross-age vonken</span>{" "}
            happened — gatherings where participants span two or more age groups.
          </p>
        </section>
      )}

      <section className="gemeente-card p-5">
        <h2 className="text-lg font-semibold text-gemeente-ink mb-1">
          Connection density — Rotterdam
        </h2>
        <p className="text-gemeente-subtle text-xs mb-3">
          Each circle is a vonk. Size shows participant count, colour shows category. Click for details.
        </p>
        <div className="h-[480px] rounded-lg overflow-hidden border border-slate-200">
          {points.length > 0 ? (
            <VonkDensityMap center={ROTTERDAM_CENTER} points={points} />
          ) : (
            <div className="p-6 text-gemeente-subtle">Loading map…</div>
          )}
        </div>
      </section>

      <section className="grid lg:grid-cols-2 gap-4">
        <div className="gemeente-card p-5">
          <h2 className="text-lg font-semibold text-gemeente-ink mb-3">Vonken by Category</h2>
          <div className="space-y-3">
            {Object.entries(categoryCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([cat, count]) => (
                <CategoryBar
                  key={cat}
                  cat={cat}
                  label={CATEGORY_LABEL[cat] ?? cat}
                  count={count}
                  max={Math.max(...Object.values(categoryCounts), 1)}
                />
              ))}
            {Object.keys(categoryCounts).length === 0 && (
              <p className="text-gemeente-subtle text-sm">No data yet.</p>
            )}
          </div>
        </div>
        <div className="gemeente-card p-5">
          <h2 className="text-lg font-semibold text-gemeente-ink mb-3">Recent Activity</h2>
          <RecentActivity items={metrics?.recent_vonken ?? []} />
        </div>
      </section>

      <section className="gemeente-card p-5">
        <h2 className="text-lg font-semibold text-gemeente-ink mb-3">Last 7 days</h2>
        <TrendChart data={series} />
      </section>

      <PrivacyNote />
    </div>
  );
}

function HeatmapTab() {
  const { points } = useDashboardData();
  return (
    <div className="space-y-4">
      <div className="gemeente-card p-5">
        <h2 className="text-lg font-semibold text-gemeente-ink mb-1">
          Vonk density across Rotterdam
        </h2>
        <p className="text-gemeente-subtle text-sm mb-4">
          Each circle marks an upcoming gathering. Size = participants, colour = category. No
          individual data is exposed.
        </p>
        <div className="h-[640px] rounded-lg overflow-hidden border border-slate-200">
          {points.length > 0 ? (
            <VonkDensityMap center={ROTTERDAM_CENTER} points={points} />
          ) : (
            <div className="p-6 text-gemeente-subtle">Loading…</div>
          )}
        </div>
      </div>
      <PrivacyNote />
    </div>
  );
}

function TrendsTab() {
  const { metrics, series } = useDashboardData();
  return (
    <div className="space-y-4">
      <section className="grid md:grid-cols-2 gap-4">
        <MetricCard label="Vonken this week" value={metrics?.vonken_this_week ?? "—"} icon="🔥" />
        <MetricCard label="Unique participants" value={metrics?.unique_participants ?? "—"} icon="👥" />
      </section>
      <div className="gemeente-card p-5">
        <h2 className="text-lg font-semibold text-gemeente-ink mb-3">
          Connection density over time
        </h2>
        <TrendChart data={series} />
        <p className="text-gemeente-subtle text-xs mt-3">
          Each point is a daily aggregate. No row in this chart maps to a person.
        </p>
      </div>
      <PrivacyNote />
    </div>
  );
}

const CATEGORY_BAR_COLOR: Record<string, string> = {
  social: "#f97316",
  active: "#22c55e",
  creative: "#a855f7",
  learning: "#3b82f6",
  quiet: "#6366f1",
  food: "#ef4444",
};

function CategoryBar({ cat, label, count, max }: { cat: string; label: string; count: number; max: number }) {
  const pct = Math.round((count / max) * 100);
  const color = CATEGORY_BAR_COLOR[cat] ?? "#1e40af";
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gemeente-ink font-medium">{label}</span>
        <span className="text-gemeente-subtle">{count}</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

function RecentActivity({ items }: { items: RecentVonk[] }) {
  if (!items.length) {
    return <p className="text-gemeente-subtle text-sm">No recent activity.</p>;
  }
  return (
    <ul className="space-y-2.5 max-h-[320px] overflow-y-auto">
      {items.map((v) => {
        const dot = CATEGORY_BAR_COLOR[v.category ?? ""] ?? "#1e40af";
        return (
          <li key={v.id} className="flex items-start gap-3 text-sm border-b border-slate-100 pb-2 last:border-0">
            <span
              className="w-2 h-2 rounded-full mt-1.5 shrink-0"
              style={{ background: dot }}
              aria-hidden
            />
            <div className="flex-1 min-w-0">
              <div className="text-gemeente-ink font-medium truncate">{v.title}</div>
              <div className="text-gemeente-subtle text-xs">
                {v.location_name ?? "Location TBD"}
                {" · "}
                {v.participants_count} participant{v.participants_count === 1 ? "" : "s"}
              </div>
            </div>
            <div className="text-gemeente-subtle text-xs whitespace-nowrap">
              {formatCreated(v.created_at)}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function formatCreated(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function PrivacyNote() {
  return (
    <section className="gemeente-card p-5 bg-green-50 border-green-200">
      <h3 className="text-sm font-semibold text-green-900 mb-1">
        What we count, what we don't
      </h3>
      <ul className="text-sm text-green-800 space-y-1 list-disc list-inside">
        <li>Counts of gatherings, participants, recurring groups per week per neighbourhood.</li>
        <li>Average days from sign-up to first joined vonk.</li>
        <li>
          <strong>Never:</strong> names, conversations, individual locations, or anything that
          identifies a resident.
        </li>
      </ul>
    </section>
  );
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) {
    const k = key(it);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
