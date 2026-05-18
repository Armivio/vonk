import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type TrendPoint = { date: string; vonken_count: number; unique_participants: number };

export function TrendChart({ data }: { data: TrendPoint[] }) {
  const formatted = data.map((p) => ({
    ...p,
    short: new Date(p.date).toLocaleDateString([], { weekday: "short" }),
  }));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={formatted} margin={{ top: 16, right: 16, left: 0, bottom: 8 }}>
          <defs>
            <linearGradient id="v" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1e40af" stopOpacity={0.6} />
              <stop offset="100%" stopColor="#1e40af" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="p" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#16a34a" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#16a34a" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
          <XAxis dataKey="short" stroke="#64748b" fontSize={12} />
          <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
          <Tooltip />
          <Area
            type="monotone"
            dataKey="unique_participants"
            name="Unique participants"
            stroke="#16a34a"
            fill="url(#p)"
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="vonken_count"
            name="Vonken"
            stroke="#1e40af"
            fill="url(#v)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
