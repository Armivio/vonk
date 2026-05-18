import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CitizenShell } from "../components/common/Layout";
import { useUser } from "../context/UserContext";
import { displayName } from "../lib/displayName";

export default function Welcome() {
  const { user, ready } = useUser();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && !user) navigate("/", { replace: true });
  }, [ready, user, navigate]);

  // If the user already finished onboarding, skip Welcome and go straight to Discover.
  useEffect(() => {
    if (ready && user?.preferences) navigate("/discover", { replace: true });
  }, [ready, user, navigate]);

  if (!user) return null;

  return (
    <CitizenShell>
      <section className="min-h-[70vh] flex items-center justify-center">
        <div className="ember-card p-10 max-w-xl text-center shadow-ember">
          <div className="text-6xl mb-4 animate-pulse">🔥</div>
          <h1 className="text-3xl md:text-4xl font-semibold text-amber-soft mb-3">
            Welcome, {displayName(user.name)}.
          </h1>
          <p className="text-amber-50/70 text-lg mb-8">
            Vonk works best when it knows your vibe. A short one-time chat — a few
            questions about what you enjoy, how social you are, and when you're usually
            free. We'll remember it so every future suggestion feels right.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/onboarding" className="ember-button">
              Set up my vibe (≈ 1 min)
            </Link>
            <Link to="/discover" className="ember-button-ghost">
              Skip for now
            </Link>
          </div>
        </div>
      </section>
    </CitizenShell>
  );
}
