import type { ReactNode } from "react";

export function MetricCard({
  label,
  value,
  unit,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: string;
  icon?: string;
}) {
  return (
    <div className="gemeente-card p-5">
      <div className="flex items-center gap-2 text-gemeente-subtle text-xs uppercase tracking-wider">
        {icon && <span aria-hidden>{icon}</span>}
        {label}
      </div>
      <div className="flex items-baseline gap-2 mt-2">
        <div className="text-3xl font-semibold text-gemeente-ink">{value}</div>
        {unit && <div className="text-gemeente-subtle text-sm">{unit}</div>}
      </div>
      {hint && <div className="text-gemeente-subtle text-xs mt-1">{hint}</div>}
    </div>
  );
}
