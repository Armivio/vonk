import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CitizenShell } from "../components/common/Layout";
import { useUser } from "../context/UserContext";
import type { SignupProfile } from "../lib/api";

const CITIES = ["Rotterdam", "Den Haag", "Amsterdam", "Eindhoven", "Other"];

type Step = "welcome" | "profile" | "signin";

export default function Landing() {
  const { user, ready, registerGuest, signInByEmail } = useUser();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("welcome");

  useEffect(() => {
    if (ready && user) navigate("/discover", { replace: true });
  }, [ready, user, navigate]);

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
            Vonk connects you with people and moments near you — no planning, no
            pressure, no labels.
          </p>

          {step === "welcome" && (
            <WelcomeStep onContinue={() => setStep("profile")} onSignIn={() => setStep("signin")} />
          )}
          {step === "profile" && (
            <ProfileStep
              onSubmit={async (profile) => {
                await registerGuest(profile);
                navigate("/welcome");
              }}
              onSignIn={() => setStep("signin")}
            />
          )}
          {step === "signin" && (
            <SigninStep
              onSubmit={async (email) => {
                await signInByEmail(email);
                navigate("/discover");
              }}
              onBack={() => setStep("welcome")}
            />
          )}
        </div>
        <FireGlyph />
      </section>

      <section className="grid md:grid-cols-3 gap-4 pb-8">
        <Step
          glyph="💬"
          title="Tell us what you're in the mood for"
          body="Coffee, a walk, sketching, something quiet — speak naturally, the assistant listens."
        />
        <Step
          glyph="🔥"
          title="We'll find your spark"
          body="Compatible neighbours, real places, a small gathering — usually within twenty-four hours."
        />
        <Step
          glyph="👥"
          title="Show up and connect"
          body="Two to six people, one evening at a time. If the spark catches, it becomes a vuur."
        />
      </section>

      <section className="pb-8 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
        <Stat n="247" label="vonken this month in Rotterdam" glyph="🔥" />
        <Stat n="1,284" label="connections made" glyph="👥" />
        <Stat n="38" label="vuuren burning strong" glyph="🫂" />
      </section>

      <section className="pb-12">
        <h2 className="text-amber-glow/80 text-xs uppercase tracking-widest mb-4 text-center">
          What Vonk users say
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          <Testimonial
            quote="I moved to Rotterdam three months ago knowing nobody. Through Vonk I found my book club and my favourite café."
            attribution="Sophie M."
          />
          <Testimonial
            quote="Every Tuesday is kaartavond now. Wouldn't miss it."
            attribution="Henk de V."
          />
        </div>
        <p className="text-amber-50/30 text-[10px] text-center mt-3">
          Stories shared with permission. Users can remove them any time from their profile.
        </p>
      </section>
    </CitizenShell>
  );
}

function WelcomeStep({ onContinue, onSignIn }: { onContinue: () => void; onSignIn: () => void }) {
  return (
    <div>
      <button onClick={onContinue} className="ember-button text-lg">
        Get started →
      </button>
      <p className="text-amber-50/40 text-xs mt-4">
        Already been here?{" "}
        <button onClick={onSignIn} className="text-amber-soft hover:text-amber-glow underline underline-offset-2">
          Sign back in with email
        </button>
      </p>
    </div>
  );
}

function ProfileStep({
  onSubmit,
  onSignIn,
}: {
  onSubmit: (p: SignupProfile) => Promise<void>;
  onSignIn: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [city, setCity] = useState("Rotterdam");
  const [showOptional, setShowOptional] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim()) {
      setError("First name is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        first_name: firstName.trim(),
        last_name: lastName.trim() || undefined,
        city: city || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full bg-ember-900 text-amber-50 placeholder:text-amber-50/30 " +
    "border border-ember-700 rounded-full px-5 py-3 outline-none " +
    "focus:border-amber-glow/60 transition";

  return (
    <form onSubmit={submit} className="max-w-md space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <input
          type="text"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="First name *"
          autoFocus
          disabled={submitting}
          className={inputClass}
        />
        <input
          type="text"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder="Last name (optional)"
          disabled={submitting}
          className={inputClass}
        />
      </div>
      <select
        value={city}
        onChange={(e) => setCity(e.target.value)}
        disabled={submitting}
        className={inputClass}
      >
        {CITIES.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      {!showOptional ? (
        <button
          type="button"
          onClick={() => setShowOptional(true)}
          className="text-amber-50/50 text-xs hover:text-amber-soft underline underline-offset-2"
        >
          + Add email or phone (for reminders & to sign back in)
        </button>
      ) : (
        <div className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (for reminders + sign-in)"
            disabled={submitting}
            className={inputClass}
          />
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone (share with hosts)"
            disabled={submitting}
            className={inputClass}
          />
        </div>
      )}
      <div className="flex flex-col sm:flex-row gap-3 pt-1">
        <button type="submit" disabled={submitting} className="ember-button">
          {submitting ? "Lighting…" : "Light your Vonk → 🔥"}
        </button>
      </div>
      {error && <p className="text-amber-glow text-sm">{error}</p>}
      <p className="text-amber-50/40 text-xs">
        No password. Already been here?{" "}
        <button type="button" onClick={onSignIn} className="text-amber-soft hover:text-amber-glow underline underline-offset-2">
          Sign back in with email
        </button>
      </p>
    </form>
  );
}

function SigninStep({
  onSubmit,
  onBack,
}: {
  onSubmit: (email: string) => Promise<void>;
  onBack: () => void;
}) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(email.trim());
    } catch (err) {
      setError("No account with that email — sign up instead?");
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <form onSubmit={submit} className="max-w-md space-y-3">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email you signed up with"
        autoFocus
        disabled={submitting}
        className="w-full bg-ember-900 text-amber-50 placeholder:text-amber-50/30
                   border border-ember-700 rounded-full px-5 py-3 outline-none
                   focus:border-amber-glow/60 transition"
      />
      <div className="flex gap-3">
        <button type="submit" disabled={submitting} className="ember-button">
          {submitting ? "Looking…" : "Sign back in"}
        </button>
        <button type="button" onClick={onBack} className="ember-button-ghost text-sm">
          Back
        </button>
      </div>
      {error && <p className="text-amber-glow text-sm">{error}</p>}
    </form>
  );
}

function Step({ glyph, title, body }: { glyph: string; title: string; body: string }) {
  return (
    <div className="ember-card p-6">
      <div className="text-3xl mb-2">{glyph}</div>
      <div className="text-lg font-semibold text-amber-soft mb-2">{title}</div>
      <p className="text-amber-50/70 text-sm leading-relaxed">{body}</p>
    </div>
  );
}

function Stat({ n, label, glyph }: { n: string; label: string; glyph: string }) {
  return (
    <div className="ember-card p-5">
      <div className="text-3xl mb-1">{glyph}</div>
      <div className="text-3xl font-semibold text-amber-soft">{n}</div>
      <div className="text-amber-50/60 text-xs mt-1">{label}</div>
    </div>
  );
}

function Testimonial({ quote, attribution }: { quote: string; attribution: string }) {
  return (
    <div className="ember-card p-6">
      <div className="text-amber-glow text-xl mb-2">"</div>
      <p className="text-amber-50/90 text-sm leading-relaxed mb-3">{quote}</p>
      <div className="text-amber-50/50 text-xs flex items-center gap-2">
        <span>— {attribution}</span>
        <span className="text-amber-50/30">·</span>
        <span className="text-amber-glow/60">Shared with permission</span>
      </div>
    </div>
  );
}

function FireGlyph() {
  return (
    <div className="relative h-60 md:h-80 flex items-center justify-center">
      <div className="absolute inset-0 bg-amber-glow/10 rounded-full blur-3xl" />
      <div className="text-[8rem] md:text-[12rem] leading-none select-none animate-pulse">🔥</div>
    </div>
  );
}
