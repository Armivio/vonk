import { Link } from "react-router-dom";
import { CitizenShell } from "../components/common/Layout";
import { usePageTitle } from "../lib/usePageTitle";

export default function Privacy() {
  usePageTitle("Your privacy");
  return (
    <CitizenShell>
      <article className="max-w-3xl mx-auto pt-6 pb-12 space-y-6">
        <header>
          <p className="text-amber-glow uppercase tracking-widest text-xs mb-2">
            Connection, not surveillance
          </p>
          <h1 className="text-3xl sm:text-4xl font-semibold text-amber-soft leading-tight">
            How Vonk handles your data
          </h1>
        </header>

        <Section title="What we store">
          <p>
            Your name, email or phone number, and the preferences you share during your first
            conversation. We track which vonken you join so we can suggest better matches.
          </p>
        </Section>

        <Section title="What we NEVER store">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Your conversations — processed in memory, then discarded.</li>
            <li>A "loneliness score" or vulnerability assessment.</li>
            <li>Your precise GPS location — neighborhood-level only.</li>
            <li>Any data you haven't explicitly provided.</li>
          </ul>
        </Section>

        <Section title="What the municipality sees">
          <p>
            Aggregate numbers only. <em>"42 vonken in Charlois this month."</em> Never{" "}
            <em>"Jan joined 3 vonken."</em> Individual data never leaves the platform.
          </p>
          <p className="text-amber-50/50 text-xs mt-2">
            You can see exactly what the municipality dashboard shows by visiting{" "}
            <Link to="/gemeente" className="text-amber-soft hover:text-amber-glow underline">
              the dashboard
            </Link>{" "}
            — every page is open.
          </p>
        </Section>

        <Section title="Your rights">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong className="text-amber-soft">See your data:</strong> visit{" "}
              <Link to="/profile" className="text-amber-soft hover:text-amber-glow underline">
                your profile
              </Link>{" "}
              anytime.
            </li>
            <li>
              <strong className="text-amber-soft">Delete everything:</strong> one click removes all
              your data.
            </li>
            <li>
              <strong className="text-amber-soft">Withdraw consent:</strong> stop anytime, no
              questions asked.
            </li>
          </ul>
        </Section>

        <footer className="ember-card p-6 mt-8 border-amber-glow/40">
          <p className="text-amber-50 leading-relaxed">
            Vonk is built on one principle:{" "}
            <strong className="text-amber-soft">connection, not surveillance.</strong>
          </p>
          <p className="text-amber-50/60 text-sm mt-2">
            GDPR and EU AI Act compliant.
          </p>
        </footer>
      </article>
    </CitizenShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="ember-card p-6">
      <h2 className="text-amber-glow text-xs uppercase tracking-widest mb-3">{title}</h2>
      <div className="text-amber-50/85 text-sm leading-relaxed space-y-2">{children}</div>
    </section>
  );
}
