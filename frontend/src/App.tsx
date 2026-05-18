import { useEffect } from "react";
import { Route, Routes, useLocation, Navigate } from "react-router-dom";
import { CitizenShell } from "./components/common/Layout";
import { UserProvider, useUser } from "./context/UserContext";
import Dashboard from "./pages/Dashboard";
import Discover from "./pages/Discover";
import Landing from "./pages/Landing";
import Onboarding from "./pages/Onboarding";
import VonkDetail from "./pages/VonkDetail";
import Welcome from "./pages/Welcome";

function Placeholder({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <CitizenShell>
      <div className="min-h-[60vh] flex items-center justify-center p-8">
        <div className="ember-card p-10 text-center max-w-lg">
          <h1 className="text-3xl font-semibold text-amber-soft mb-2">{title}</h1>
          {subtitle && <p className="text-amber-50/70">{subtitle}</p>}
        </div>
      </div>
    </CitizenShell>
  );
}

function RequireGuest({ children }: { children: React.ReactNode }) {
  const { user, ready } = useUser();
  if (!ready) return null;
  if (!user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const location = useLocation();

  useEffect(() => {
    if (location.pathname.startsWith("/gemeente") || location.pathname.startsWith("/dashboard")) {
      document.body.classList.add("gemeente");
    } else {
      document.body.classList.remove("gemeente");
    }
  }, [location.pathname]);

  return (
    <UserProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/welcome" element={<RequireGuest><Welcome /></RequireGuest>} />
        <Route path="/onboarding" element={<RequireGuest><Onboarding /></RequireGuest>} />
        <Route path="/discover" element={<RequireGuest><Discover /></RequireGuest>} />
        <Route path="/vonk/:id" element={<VonkDetail />} />
        <Route path="/gemeente/*" element={<Dashboard />} />
        <Route path="/dashboard" element={<Navigate to="/gemeente" replace />} />
        <Route path="*" element={<Placeholder title="Not found" />} />
      </Routes>
    </UserProvider>
  );
}
