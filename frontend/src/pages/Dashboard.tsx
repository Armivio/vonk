import { useEffect, useMemo, useState } from "react";
import { Heatmap } from "../components/dashboard/Heatmap";
import { MetricCard } from "../components/dashboard/MetricCard";
import { TrendChart, type TrendPoint } from "../components/dashboard/TrendChart";
import { api, type DashboardMetrics } from "../lib/api";

const CITIES = [
  { name: "Rotterdam", center: [51.9225, 4.4792] as [number, number] },
  { name: "Den Haag", center: [52.0705, 4.3007] as [number, number] },
  { name: "Amsterdam", center: [52.3676, 4.9041] as [number, number] },
];

type HeatmapResponse = {
  city: string;
  geojson: { type: "FeatureCollection"; features: any[] };
};

export default function Dashboard() {
  const [city, setCity] = useState(CITIES[0].name);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [series, setSeries] = useState<TrendPoint[]>([]);
  const [heat, setHeat] = useState<HeatmapResponse | null>(null);

  const cityCenter = useMemo(
    () => CITIES.find((c) => c.name === city)?.center ?? CITIES[0].center,
    [city],
  );

  useEffect(() => {
    Promise.all([
      api.get<DashboardMetrics>(`/api/dashboard/metrics?city=${encodeURIComponent(city)}`),
      api.get<{ city: string; days: number; series: TrendPoint[] }>(
        `/api/dashboard/trends?city=${encodeURIComponent(city)}&days=7`,
      ),
      api.get<HeatmapResponse>(`/api/dashboard/heatmap?city=${encodeURIComponent(city)}`),
    ]).then(([m, t, h]) => {
      setMetrics(m);
      setSeries(t.series);
      setHeat(h);
    });
  }, [city]);

  return (
    <div className="min-h-screen">
      <header className="bg-gemeente-panel border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏛️</span>
            <div>
              <h1 className="text-xl font-semibold text-gemeente-ink">Vonk · Gemeente view</h1>
              <p className="text-gemeente-subtle text-xs">
                Aggregate connection density — no individual data, ever
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-gemeente-subtle text-sm">City</label>
            <select
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="border border-slate-300 rounded-md px-3 py-1.5 bg-gemeente-panel text-gemeente-ink"
            >
              {CITIES.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            <span className="px-3 py-1.5 rounded-full bg-green-50 text-green-800 text-xs font-medium border border-green-200">
              ✓ Aggregate only
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard
            label="Vonken this week"
            value={metrics?.vonken_this_week ?? "—"}
            icon="🔥"
          />
          <MetricCard
            label="Unique participants"
            value={metrics?.unique_participants ?? "—"}
            icon="👥"
          />
          <MetricCard
            label="Vuuren formed"
            value={metrics?.vuuren_formed ?? "—"}
            icon="♨️"
          />
          <MetricCard
            label="Cross-age vonken"
            value={metrics?.cross_age_vonken ?? "—"}
            hint="2+ age groups"
            icon="🧓"
          />
          <MetricCard
            label="Active gloeds"
            value={metrics?.active_gloeds ?? "—"}
            icon="✨"
          />
          <MetricCard
            label="Time to first vonk"
            value={metrics?.avg_time_to_first_vonk_days ?? "—"}
            unit="days"
            hint="for new residents"
            icon="⏱️"
          />
        </section>

        <section className="grid lg:grid-cols-[1.2fr_1fr] gap-4">
          <div className="gemeente-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gemeente-ink">
                Connection density — {city}
              </h2>
              <span className="text-gemeente-subtle text-xs">Point density, not individuals</span>
            </div>
            <div className="h-[420px] rounded-lg overflow-hidden border border-slate-200">
              {heat ? (
                <Heatmap center={cityCenter} data={heat.geojson} />
              ) : (
                <div className="p-6 text-gemeente-subtle">Loading map…</div>
              )}
            </div>
          </div>
          <div className="gemeente-card p-5">
            <h2 className="text-lg font-semibold text-gemeente-ink mb-3">
              Last 7 days
            </h2>
            <TrendChart data={series} />
            <p className="text-gemeente-subtle text-xs mt-3">
              Each line is a daily aggregate. No row in this chart maps to a person.
            </p>
          </div>
        </section>

        <section className="gemeente-card p-6">
          <h3 className="text-sm font-semibold text-gemeente-ink mb-2">
            What we count, what we don't
          </h3>
          <ul className="text-sm text-gemeente-subtle space-y-1 list-disc list-inside">
            <li>Counts of gatherings, participants, and recurring groups per neighbourhood, per week.</li>
            <li>Average time from sign-up to first joined gathering, by city.</li>
            <li>We never expose names, conversations, or individual locations to municipalities.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
