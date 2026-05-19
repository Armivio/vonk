import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OtpCodeInput } from "../components/auth/OtpCodeInput";
import { CitizenShell } from "../components/common/Layout";
import { useUser } from "../context/UserContext";
import { api, type SignupProfile } from "../lib/api";

const CITIES = ["Rotterdam", "Den Haag", "Amsterdam", "Eindhoven", "Other"];

type Step = "welcome" | "profile" | "signin" | "verify";

type OtpSendResult = {
  sent: boolean;
  method: "email" | "sms";
  dev_code?: string | null;
};

export default function Landing() {
  const { user, ready, registerGuest, verifyOtp } = useUser();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("welcome");
  const [pendingIdentifier, setPendingIdentifier] = useState("");
  const [pendingProfile, setPendingProfile] = useState<SignupProfile | null>(null);
  const [pendingMethod, setPendingMethod] = useState<"email" | "sms">("email");
  const [devCode, setDevCode] = useState<string | null>(null);

  useEffect(() => {
    if (ready && user) navigate("/discover", { replace: true });
  }, [ready, user, navigate]);

  async function startVerification(
    identifier: string,
    profile: SignupProfile | null,
  ): Promise<void> {
    const res = await api.post<OtpSendResult>("/api/auth/send-code", { identifier });
    setPendingIdentifier(identifier);
    setPendingProfile(profile);
    setPendingMethod(res.method);
    setDevCode(res.dev_code ?? null);
    setStep("verify");
  }

  async function handleVerify(code: string): Promise<void> {
    await verifyOtp({ identifier: pendingIdentifier, code, profile: pendingProfile ?? undefined });
    // New users go through Welcome → /find onboarding; returning users straight to discover.
    navigate(pendingProfile ? "/welcome" : "/discover");
  }

  async function resend(): Promise<void> {
    const res = await api.post<OtpSendResult>("/api/auth/send-code", {
      identifier: pendingIdentifier,
    });
    setDevCode(res.dev_code ?? null);
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
            Vonk connects you with people and moments near you — no planning, no
            pressure, no labels.
          </p>

          {step === "welcome" && (
            <WelcomeStep
              onContinue={() => setStep("profile")}
              onSignIn={() => setStep("signin")}
            />
          )}
          {step === "profile" && (
            <ProfileStep
              onSendCode={startVerification}
              onGuest={async (profile) => {
                await registerGuest(profile);
                navigate("/welcome");
              }}
              onSignIn={() => setStep("signin")}
            />
          )}
          {step === "signin" && (
            <SigninStep
              onSendCode={(identifier) => startVerification(identifier, null)}
              onBack={() => setStep("welcome")}
            />
          )}
          {step === "verify" && (
            <VerifyStep
              identifier={pendingIdentifier}
              method={pendingMethod}
              devCode={devCode}
              onVerify={handleVerify}
              onResend={resend}
              onBack={() => setStep(pendingProfile ? "profile" : "signin")}
            />
          )}
        </div>
        <FireGlyph />
      </section>

      <section className="pb-10">
        <div className="ember-card p-5 sm:p-6 flex flex-col sm:flex-row items-center gap-4 border-amber-glow/30">
          <div className="text-3xl shrink-0">📞</div>
          <div className="flex-1 text-center sm:text-left">
            <p className="text-amber-soft font-medium text-sm sm:text-base">Prefer to talk?</p>
            <p className="text-amber-50/70 text-sm">
              Call us at{" "}
              <a
                href="tel:+3197010222326"
                className="text-amber-glow hover:text-amber-soft underline underline-offset-2 font-medium"
              >
                +31 970 102 22326
              </a>{" "}
              — our AI assistant speaks Dutch and English.
            </p>
          </div>
          <a
            href="tel:+3197010222326"
            className="ember-button-ghost text-sm whitespace-nowrap"
          >
            Call now →
          </a>
        </div>
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

const INPUT_CLASS =
  "w-full bg-ember-900 text-amber-50 placeholder:text-amber-50/30 " +
  "border border-ember-700 rounded-full px-5 py-3 outline-none " +
  "focus:border-amber-glow/60 transition";

function WelcomeStep({
  onContinue,
  onSignIn,
}: {
  onContinue: () => void;
  onSignIn: () => void;
}) {
  return (
    <div>
      <button onClick={onContinue} className="ember-button text-lg">
        Get started →
      </button>
      <p className="text-amber-50/40 text-xs mt-4">
        Already have an account?{" "}
        <button
          onClick={onSignIn}
          className="text-amber-soft hover:text-amber-glow underline underline-offset-2"
        >
          Sign in
        </button>
      </p>
    </div>
  );
}

function ProfileStep({
  onSendCode,
  onGuest,
  onSignIn,
}: {
  onSendCode: (identifier: string, profile: SignupProfile) => Promise<void>;
  onGuest: (profile: SignupProfile) => Promise<void>;
  onSignIn: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [city, setCity] = useState("Rotterdam");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim()) {
      setError("First name is required");
      return;
    }
    if (!identifier.trim()) {
      setError("Email or phone is required to send a verification code");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSendCode(identifier.trim(), {
        first_name: firstName.trim(),
        last_name: lastName.trim() || undefined,
        city: city || undefined,
        email: identifier.includes("@") ? identifier.trim() : undefined,
        phone: !identifier.includes("@") ? identifier.trim() : undefined,
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function continueAsGuest() {
    if (!firstName.trim()) {
      setError("First name is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onGuest({
        first_name: firstName.trim(),
        last_name: lastName.trim() || undefined,
        city: city || undefined,
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

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
          className={INPUT_CLASS}
        />
        <input
          type="text"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder="Last name (optional)"
          disabled={submitting}
          className={INPUT_CLASS}
        />
      </div>
      <input
        type="text"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        placeholder="Email or phone"
        disabled={submitting}
        className={INPUT_CLASS}
      />
      <select
        value={city}
        onChange={(e) => setCity(e.target.value)}
        disabled={submitting}
        className={INPUT_CLASS}
      >
        {CITIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <div className="flex flex-col sm:flex-row gap-3 pt-1">
        <button type="submit" disabled={submitting} className="ember-button">
          {submitting ? "Sending…" : "Send verification code →"}
        </button>
      </div>
      {error && <p className="text-amber-glow text-sm">{error}</p>}
      <p className="text-amber-50/40 text-xs pt-2">
        Just want to browse?{" "}
        <button
          type="button"
          onClick={() => void continueAsGuest()}
          disabled={submitting}
          className="text-amber-soft hover:text-amber-glow underline underline-offset-2"
        >
          Continue as guest →
        </button>
      </p>
      <p className="text-amber-50/40 text-xs">
        Already have an account?{" "}
        <button
          type="button"
          onClick={onSignIn}
          className="text-amber-soft hover:text-amber-glow underline underline-offset-2"
        >
          Sign in
        </button>
      </p>
    </form>
  );
}

function SigninStep({
  onSendCode,
  onBack,
}: {
  onSendCode: (identifier: string) => Promise<void>;
  onBack: () => void;
}) {
  const [identifier, setIdentifier] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSendCode(identifier.trim());
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <form onSubmit={submit} className="max-w-md space-y-3">
      <input
        type="text"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        placeholder="Email or phone"
        autoFocus
        disabled={submitting}
        className={INPUT_CLASS}
      />
      <div className="flex gap-3">
        <button type="submit" disabled={submitting} className="ember-button">
          {submitting ? "Sending…" : "Send code"}
        </button>
        <button type="button" onClick={onBack} className="ember-button-ghost text-sm">
          Back
        </button>
      </div>
      {error && <p className="text-amber-glow text-sm">{error}</p>}
    </form>
  );
}

function VerifyStep({
  identifier,
  method,
  devCode,
  onVerify,
  onResend,
  onBack,
}: {
  identifier: string;
  method: "email" | "sms";
  devCode: string | null;
  onVerify: (code: string) => Promise<void>;
  onResend: () => Promise<void>;
  onBack: () => void;
}) {
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resentAt, setResentAt] = useState<number | null>(null);

  async function handle(code: string) {
    setVerifying(true);
    setError(null);
    try {
      await onVerify(code);
    } catch (err) {
      setError("That code didn't match. Try again or resend.");
      setVerifying(false);
    }
  }

  async function resend() {
    await onResend();
    setResentAt(Date.now());
  }

  return (
    <div className="max-w-md space-y-4">
      <div>
        <p className="text-amber-50/80 text-sm">
          We sent a 6-digit code to{" "}
          <span className="text-amber-soft font-medium">{identifier}</span>
          <span className="text-amber-50/40"> via {method === "email" ? "email" : "SMS"}</span>.
        </p>
        {devCode && (
          <p className="text-amber-glow/80 text-xs mt-2">
            🛠 Demo mode (no {method === "email" ? "SMTP" : "Twilio"} configured) — your code is{" "}
            <span className="text-amber-soft font-mono">{devCode}</span>
          </p>
        )}
      </div>
      <OtpCodeInput disabled={verifying} onComplete={(code) => void handle(code)} />
      {error && <p className="text-amber-glow text-sm">{error}</p>}
      <div className="flex gap-3 flex-wrap text-xs items-center">
        <button
          type="button"
          onClick={() => void resend()}
          disabled={verifying}
          className="text-amber-soft hover:text-amber-glow underline underline-offset-2"
        >
          Resend code
        </button>
        {resentAt && <span className="text-amber-50/40">Sent again.</span>}
        <span className="text-amber-50/30">·</span>
        <button
          type="button"
          onClick={onBack}
          className="text-amber-50/60 hover:text-amber-soft"
        >
          Use a different address
        </button>
      </div>
    </div>
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

