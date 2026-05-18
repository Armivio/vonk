import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CitizenShell } from "../components/common/Layout";
import { useUser } from "../context/UserContext";

export default function Landing() {
  const { user, ready, registerGuest } = useUser();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Returning guests skip the landing form straight to discover.
  useEffect(() => {
    if (ready && user) navigate("/discover", { replace: true });
  }, [ready, user, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Tell us your name first");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await registerGuest(trimmed);
      navigate("/welcome");
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CitizenShell>
      <section className="pt-12 pb-12 grid md:grid-cols-2 gap-12 items-center">
        <div>
          <p className="text-amber-glow uppercase tracking-widest text-xs mb-3">
            Connection, not surveillance
          </p>
          <h1 className="text-5xl md:text-6xl font-semibold leading-tight text-amber-50 mb-6">
            Your city is alive.<br />
            <span className="text-amber-soft">Find your fire.</span>
          </h1>
          <p className="text-amber-50/70 text-lg mb-8 max-w-md">
            Vonk helps you bump into the right people, on the right evening — a coffee,
            a walk, a sketching session. Small sparks. Real life.
          </p>

          <form onSubmit={submit} className="flex flex-col sm:flex-row gap-3 max-w-md">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What's your name?"
              autoFocus
              disabled={submitting}
              className="flex-1 bg-ember-900 text-amber-50 placeholder:text-amber-50/30
                         border border-ember-700 rounded-full px-5 py-3 outline-none
                         focus:border-amber-glow/60 transition"
            />
            <button type="submit" disabled={submitting} className="ember-button">
              {submitting ? "Lighting…" : "Light your Vonk →"}
            </button>
          </form>
          {error && <p className="text-amber-glow text-sm mt-3">{error}</p>}
          <p className="text-amber-50/40 text-xs mt-3">
            No password, no email. Just a name so neighbours can wave back.
          </p>
        </div>
        <FireGlyph />
      </section>

      <section className="grid md:grid-cols-3 gap-4 pb-12">
        <Step
          n="1"
          title="Gloed"
          body="Tell the assistant — in your own words — what kind of evening you want. It listens, asks one or two questions, lights your gloed."
        />
        <Step
          n="2"
          title="Vonk"
          body="A handful of compatible neighbours form a micro-gathering, two to six people, within twenty-four hours."
        />
        <Step
          n="3"
          title="Vuur"
          body="If the spark catches, it becomes a vuur — a recurring fire. A small repeated group in your city."
        />
      </section>

      <footer className="pt-6 pb-8 border-t border-ember-700/40 text-center">
        <Link to="/gemeente" className="text-amber-50/40 hover:text-amber-soft text-xs transition">
          Gemeente · Municipality dashboard →
        </Link>
      </footer>
    </CitizenShell>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="ember-card p-6">
      <div className="text-amber-glow/60 text-sm">{n}</div>
      <div className="text-xl font-semibold text-amber-soft mt-1 mb-2">{title}</div>
      <p className="text-amber-50/70 text-sm leading-relaxed">{body}</p>
    </div>
  );
}

function FireGlyph() {
  return (
    <div className="relative h-80 flex items-center justify-center">
      <div className="absolute inset-0 bg-amber-glow/10 rounded-full blur-3xl" />
      <div className="text-[12rem] leading-none select-none animate-pulse">🔥</div>
    </div>
  );
}
