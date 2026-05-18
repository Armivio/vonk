import { type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useUser } from "../../context/UserContext";
import { displayName } from "../../lib/displayName";

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
              <NavLink to="/onboarding" active={pathname === "/onboarding"}>Light a gloed</NavLink>
              <NavLink to="/discover" active={pathname === "/discover"}>Discover</NavLink>
            </>
          )}
          {user ? (
            <>
              <span className="px-3 py-1.5 text-amber-50/50 text-xs hidden sm:inline">
                Hey, {displayName(user.name)}
              </span>
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
