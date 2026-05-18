import { type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

export function CitizenShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div className="min-h-screen">
      <header className="px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <Link to="/" className="flex items-center gap-2">
          <span className="text-2xl">🔥</span>
          <span className="text-xl font-semibold text-amber-soft">Vonk</span>
        </Link>
        <nav className="flex gap-2 text-sm">
          <NavLink to="/onboarding" active={pathname === "/onboarding"}>Light a gloed</NavLink>
          <NavLink to="/discover" active={pathname === "/discover"}>Discover</NavLink>
          <NavLink to="/dashboard" active={pathname.startsWith("/dashboard")}>Gemeente view</NavLink>
        </nav>
      </header>
      <main className="px-6 pb-12 max-w-6xl mx-auto">{children}</main>
    </div>
  );
}

function NavLink({ to, active, children }: { to: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      to={to}
      className={
        active
          ? "px-3 py-1.5 rounded-full bg-amber-glow/20 text-amber-soft"
          : "px-3 py-1.5 rounded-full text-amber-50/60 hover:text-amber-soft hover:bg-amber-glow/10 transition"
      }
    >
      {children}
    </Link>
  );
}
