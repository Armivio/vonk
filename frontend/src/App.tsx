import { useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { CitizenShell } from "./components/common/Layout";
import { UserProvider } from "./context/UserContext";
import Dashboard from "./pages/Dashboard";
import Discover from "./pages/Discover";
import Landing from "./pages/Landing";
import Onboarding from "./pages/Onboarding";
import VonkDetail from "./pages/VonkDetail";

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

export default function App() {
  const location = useLocation();

  useEffect(() => {
    if (location.pathname.startsWith("/dashboard")) {
      document.body.classList.add("gemeente");
    } else {
      document.body.classList.remove("gemeente");
    }
  }, [location.pathname]);

  return (
    <UserProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/discover" element={<Discover />} />
        <Route path="/vonk/:id" element={<VonkDetail />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="*" element={<Placeholder title="Not found" />} />
      </Routes>
    </UserProvider>
  );
}
