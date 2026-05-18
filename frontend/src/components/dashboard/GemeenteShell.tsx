import { type ReactNode } from "react";
import { NavLink as RouterNavLink } from "react-router-dom";

export function GemeenteShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gemeente-bg text-gemeente-ink">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gemeente-accent text-white flex items-center justify-center font-bold">
              R
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gemeente-ink leading-tight">
                Vonk · Gemeente Rotterdam
              </h1>
              <p className="text-gemeente-subtle text-xs">
                Connection density dashboard · municipal view
              </p>
            </div>
          </div>
          <span className="px-3 py-1.5 rounded-full bg-green-50 text-green-800 text-xs font-medium border border-green-200 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-600" />
            Aggregate data only — no individual tracking
          </span>
        </div>
        <nav className="max-w-6xl mx-auto px-6 flex gap-1">
          <Tab to="/gemeente">Overview</Tab>
          <Tab to="/gemeente/heatmap">Heatmap</Tab>
          <Tab to="/gemeente/trends">Trends</Tab>
        </nav>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-6">{children}</main>
    </div>
  );
}

function Tab({ to, children }: { to: string; children: ReactNode }) {
  return (
    <RouterNavLink
      to={to}
      end={to === "/gemeente"}
      className={({ isActive }) =>
        isActive
          ? "px-4 py-2.5 border-b-2 border-gemeente-accent text-gemeente-accent text-sm font-medium"
          : "px-4 py-2.5 border-b-2 border-transparent text-gemeente-subtle hover:text-gemeente-ink text-sm transition"
      }
    >
      {children}
    </RouterNavLink>
  );
}
