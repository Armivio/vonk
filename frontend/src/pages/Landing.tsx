import { Link } from "react-router-dom";
import { CitizenShell } from "../components/common/Layout";

export default function Landing() {
  return (
    <CitizenShell>
      <section className="pt-12 pb-20 grid md:grid-cols-2 gap-12 items-center">
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
          <div className="flex gap-3">
            <Link to="/onboarding" className="ember-button">
              Light your first gloed
            </Link>
            <Link to="/discover" className="ember-button-ghost">
              See what's sparking
            </Link>
          </div>
        </div>
        <FireGlyph />
      </section>
      <section className="grid md:grid-cols-3 gap-4 pb-16">
        <Step
          n="1"
          title="Gloed"
          body="Tell the assistant — in your own words — what kind of evening you want. It listens, asks one or two questions, and lights your gloed."
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
