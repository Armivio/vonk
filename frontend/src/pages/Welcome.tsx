import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CitizenShell } from "../components/common/Layout";
import { useUser } from "../context/UserContext";

export default function Welcome() {
  const { user, ready } = useUser();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && !user) navigate("/", { replace: true });
  }, [ready, user, navigate]);

  if (!user) return null;

  return (
    <CitizenShell>
      <section className="min-h-[70vh] flex items-center justify-center">
        <div className="ember-card p-10 max-w-xl text-center shadow-ember">
          <div className="text-6xl mb-4 animate-pulse">🔥</div>
          <h1 className="text-3xl md:text-4xl font-semibold text-amber-soft mb-3">
            Welcome, {user.name}.
          </h1>
          <p className="text-amber-50/70 text-lg mb-8">
            Want to find your first spark? Tell the assistant what kind of
            evening would feel right — it asks a few quick questions and lights
            your gloed.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/onboarding" className="ember-button">
              Yes, help me find something
            </Link>
            <Link to="/discover" className="ember-button-ghost">
              I'll browse on my own
            </Link>
          </div>
        </div>
      </section>
    </CitizenShell>
  );
}
