import { type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useUser } from "../../context/UserContext";
import { displayName } from "../../lib/displayName";
import { NotificationsBell } from "./NotificationsBell";

export function CitizenShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useUser();

  function handleSignOut() {
    signOut();
    navigate("/", { replace: true });
  }

  return (
    <div className="min-h-screen">
      <header className="px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <Link to={user ? "/discover" : "/"} className="flex items-center gap-2">
          <span className="text-2xl">🔥</span>
          <span className="text-xl font-semibold text-amber-soft">Vonk</span>
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          {user && (
            <>
              <NavLink to="/find" active={pathname === "/find"}>Find a Vonk</NavLink>
              <NavLink to="/discover" active={pathname === "/discover"}>Discover</NavLink>
            </>
          )}
          {user ? (
            <>
              <NotificationsBell />
              <Link
                to="/profile"
                className="px-3 py-1.5 text-amber-50/60 hover:text-amber-soft text-xs hidden sm:inline transition"
              >
                Hey, {displayName(user)}
              </Link>
              <button
                onClick={handleSignOut}
                className="px-3 py-1.5 rounded-full text-amber-50/40 hover:text-amber-soft text-xs transition"
              >
                Switch user
              </button>
            </>
          ) : (
            <Link to="/" className="px-3 py-1.5 rounded-full text-amber-50/60 hover:text-amber-soft transition">
              Sign in
            </Link>
          )}
        </nav>
      </header>
      <main className="px-6 pb-12 max-w-6xl mx-auto">{children}</main>
      <Footer />
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-12 border-t border-ember-700/40">
      <div className="max-w-6xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <p className="text-amber-50/40">
          Vonk — Connection, not surveillance.
        </p>
        <nav className="flex gap-4 text-amber-50/40">
          <Link to="/privacy" className="hover:text-amber-soft transition">
            Privacy
          </Link>
          <Link to="/gemeente" className="hover:text-amber-soft transition">
            Municipality dashboard
          </Link>
          <Link to="/wijkconnector" className="hover:text-amber-soft transition">
            Wijkconnector portal
          </Link>
        </nav>
        <p className="text-amber-50/30">
          © 2026 Vonk · Built for humans, by humans (with a little AI help)
        </p>
      </div>
    </footer>
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
