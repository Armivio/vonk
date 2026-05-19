import { useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { usePageTitle } from "../lib/usePageTitle";

const NEIGHBORHOODS = [
  "Centrum",
  "Delfshaven",
  "Kralingen",
  "Charlois",
  "Feijenoord",
  "Hillegersberg-Schiebroek",
  "Noord",
  "IJsselmonde",
  "Other",
];

const INTEREST_OPTIONS: { value: string; label: string }[] = [
  { value: "social", label: "Coffee & conversation" },
  { value: "active", label: "Walking / movement" },
  { value: "social", label: "Card games" }, // grouped under social as well
  { value: "food", label: "Cooking together" },
  { value: "creative", label: "Crafts / creative" },
  { value: "social", label: "Anything social" },
];

const AVAILABILITY_OPTIONS = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
];

const LANGUAGES = [
  { value: "nl", label: "Nederlands" },
  { value: "en", label: "English" },
  { value: "other", label: "Other" },
];

const ORGS = ["GGD", "Welzijn", "Buurtteam", "Other"];

const CONTACT_PREFS: { value: "call" | "sms" | "manual"; label: string }[] = [
  { value: "call", label: "Phone call" },
  { value: "sms", label: "SMS only" },
  { value: "manual", label: "No direct contact" },
];

type RegistrationResult = {
  user_id: string;
  name: string;
  last_name?: string | null;
  neighborhood?: string | null;
  language: string;
  interests: string[];
};

export default function Wijkconnector() {
  usePageTitle("Wijkconnector Portal");
  // Wijkconnector (the worker filling this out)
  const [registeredByName, setRegisteredByName] = useState("");
  const [registeredByOrg, setRegisteredByOrg] = useState("Welzijn");
  const [contactPreference, setContactPreference] = useState<"call" | "sms" | "manual">("call");
  // Resident
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [neighborhood, setNeighborhood] = useState("Centrum");
  const [language, setLanguage] = useState("nl");
  const [interests, setInterests] = useState<Set<string>>(new Set());
  const [availability, setAvailability] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registered, setRegistered] = useState<RegistrationResult | null>(null);

  function toggle(set: Set<string>, val: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    setter(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim()) {
      setError("Resident's first name is required");
      return;
    }
    if (!consent) {
      setError("Please confirm consent has been obtained.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const out = await api.post<RegistrationResult>("/api/wijkconnector/register", {
        first_name: firstName.trim(),
        last_name: lastName.trim() || undefined,
        phone: phone.trim() || undefined,
        neighborhood: neighborhood === "Other" ? undefined : neighborhood,
        city: "Rotterdam",
        language,
        interests: Array.from(interests),
        availability: Array.from(availability),
        notes: notes.trim() || undefined,
        consent_obtained: consent,
        registered_by_name: registeredByName.trim() || undefined,
        registered_by_org: registeredByOrg,
        contact_preference: contactPreference,
      });
      setRegistered(out);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.detail) : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    // Keep the wijkconnector's own name + org pre-filled — they typically
    // register several residents in a row in one sitting.
    setFirstName("");
    setLastName("");
    setPhone("");
    setNeighborhood("Centrum");
    setLanguage("nl");
    setInterests(new Set());
    setAvailability(new Set());
    setNotes("");
    setConsent(false);
    setContactPreference("call");
    setRegistered(null);
    setError(null);
  }

  if (registered) {
    return (
      <div className="min-h-screen px-6 py-8 max-w-3xl mx-auto">
        <Header />
        <div className="ember-card p-8 mt-6 shadow-ember">
          <div className="text-4xl mb-3">✓</div>
          <h1 className="text-2xl font-semibold text-amber-soft mb-2">
            {registered.name}
            {registered.last_name ? ` ${registered.last_name}` : ""} is registered.
          </h1>
          <p className="text-amber-50/70 text-sm mb-4">
            They'll be matched with nearby gatherings in {registered.neighborhood ?? "their city"}.
            The voice agent or a fellow neighbour can reach out to confirm attendance.
          </p>
          <dl className="text-xs text-amber-50/60 space-y-1 mb-6">
            <div><span className="text-amber-50/40">Language:</span> {registered.language.toUpperCase()}</div>
            <div><span className="text-amber-50/40">Interests:</span> {registered.interests.join(", ") || "—"}</div>
          </dl>
          <div className="flex gap-3 flex-wrap">
            <button onClick={resetForm} className="ember-button">
              Register another resident
            </button>
            <Link to="/gemeente" className="ember-button-ghost text-sm">
              Back to municipality dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const inputClass =
    "w-full bg-ember-900 text-amber-50 placeholder:text-amber-50/30 " +
    "border border-ember-700 rounded-lg px-3 py-2 outline-none " +
    "focus:border-amber-glow/60 transition text-sm";

  return (
    <div className="min-h-screen px-6 py-8 max-w-3xl mx-auto">
      <Header />
      <div className="ember-card p-8 mt-6 shadow-ember">
        <div className="text-amber-glow text-xs uppercase tracking-widest mb-2">
          Wijkconnector Portal
        </div>
        <h1 className="text-2xl font-semibold text-amber-soft mb-1">
          Register someone on their behalf
        </h1>
        <p className="text-amber-50/60 text-sm mb-6">
          For community workers helping residents — typically elderly or low-digital-literacy —
          get connected to nearby gatherings. Always confirm consent before submitting.
        </p>

        <form onSubmit={submit} className="space-y-5">
          <fieldset className="space-y-3 p-4 rounded-lg border border-ember-700/60 bg-ember-900/30">
            <legend className="px-2 text-amber-glow text-[10px] uppercase tracking-widest">
              About you (the wijkconnector)
            </legend>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Your name">
                <input
                  value={registeredByName}
                  onChange={(e) => setRegisteredByName(e.target.value)}
                  placeholder="e.g. Marja Visser"
                  className={inputClass}
                  disabled={submitting}
                />
              </Field>
              <Field label="Your organization">
                <select
                  value={registeredByOrg}
                  onChange={(e) => setRegisteredByOrg(e.target.value)}
                  className={inputClass}
                  disabled={submitting}
                >
                  {ORGS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Contact preference">
              <div className="flex gap-2 flex-wrap">
                {CONTACT_PREFS.map((c) => (
                  <label
                    key={c.value}
                    className={
                      "px-3 py-1.5 rounded-full border text-xs cursor-pointer transition " +
                      (contactPreference === c.value
                        ? "bg-amber-glow text-ember-950 border-amber-glow"
                        : "border-ember-700 text-amber-50/70 hover:border-amber-glow/40")
                    }
                  >
                    <input
                      type="radio"
                      name="contact_preference"
                      value={c.value}
                      checked={contactPreference === c.value}
                      onChange={() => setContactPreference(c.value)}
                      className="hidden"
                    />
                    {c.label}
                  </label>
                ))}
              </div>
              <p className="text-amber-50/40 text-[11px] mt-2">
                Used by the voice agent: "Hallo {firstName.trim() || "[name]"}, uw wijkcoach{" "}
                {registeredByName.trim() || "[uw naam]"} van {registeredByOrg} heeft u aangemeld bij Vonk."
              </p>
            </Field>
          </fieldset>

          <div className="text-amber-glow/70 text-[10px] uppercase tracking-widest pt-1">
            About the resident
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="First name *">
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={inputClass}
                disabled={submitting}
                autoFocus
                required
              />
            </Field>
            <Field label="Last name">
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={inputClass}
                disabled={submitting}
              />
            </Field>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Phone number">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+31 …"
                className={inputClass}
                disabled={submitting}
              />
            </Field>
            <Field label="Neighborhood">
              <select
                value={neighborhood}
                onChange={(e) => setNeighborhood(e.target.value)}
                className={inputClass}
                disabled={submitting}
              >
                {NEIGHBORHOODS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Preferred language">
            <div className="flex gap-2 flex-wrap">
              {LANGUAGES.map((l) => (
                <label
                  key={l.value}
                  className={
                    "px-3 py-1.5 rounded-full border text-xs cursor-pointer transition " +
                    (language === l.value
                      ? "bg-amber-glow text-ember-950 border-amber-glow"
                      : "border-ember-700 text-amber-50/70 hover:border-amber-glow/40")
                  }
                >
                  <input
                    type="radio"
                    name="language"
                    value={l.value}
                    checked={language === l.value}
                    onChange={() => setLanguage(l.value)}
                    className="hidden"
                  />
                  {l.label}
                </label>
              ))}
            </div>
          </Field>

          <Field label="What are they interested in?">
            <div className="grid sm:grid-cols-2 gap-2">
              {INTEREST_OPTIONS.map((opt, i) => {
                const key = `${opt.value}:${i}`;
                const selected = interests.has(opt.value);
                return (
                  <label
                    key={key}
                    className={
                      "flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition text-sm " +
                      (selected
                        ? "border-amber-glow/60 bg-amber-glow/10 text-amber-soft"
                        : "border-ember-700 text-amber-50/70 hover:border-amber-glow/40")
                    }
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggle(interests, opt.value, setInterests)}
                      className="accent-amber-500"
                    />
                    {opt.label}
                  </label>
                );
              })}
            </div>
          </Field>

          <Field label="When are they usually available?">
            <div className="flex gap-2 flex-wrap">
              {AVAILABILITY_OPTIONS.map((opt) => {
                const selected = availability.has(opt.value);
                return (
                  <label
                    key={opt.value}
                    className={
                      "px-3 py-1.5 rounded-full border text-xs cursor-pointer transition " +
                      (selected
                        ? "bg-amber-glow/20 border-amber-glow text-amber-soft"
                        : "border-ember-700 text-amber-50/70 hover:border-amber-glow/40")
                    }
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggle(availability, opt.value, setAvailability)}
                      className="hidden"
                    />
                    {opt.label}
                  </label>
                );
              })}
            </div>
          </Field>

          <Field label="Notes for matching (optional)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Recently widowed, prefers Dutch-speaking groups, mobility limits walking distance."
              className={inputClass + " resize-none"}
              disabled={submitting}
            />
          </Field>

          <label
            className={
              "flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition " +
              (consent
                ? "border-amber-glow/60 bg-amber-glow/10"
                : "border-ember-700 hover:border-amber-glow/40")
            }
          >
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="accent-amber-500 mt-1"
            />
            <span className="text-sm text-amber-50/80">
              <strong className="text-amber-soft">Consent obtained.</strong> The resident has agreed
              to be contacted about local gatherings and understands they can leave the platform
              at any time.
            </span>
          </label>

          {error && <p className="text-amber-glow text-sm">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={submitting} className="ember-button">
              {submitting ? "Registering…" : "Register Resident →"}
            </button>
            <Link to="/gemeente" className="ember-button-ghost text-sm">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-center justify-between">
      <Link to="/" className="flex items-center gap-2">
        <span className="text-2xl">🔥</span>
        <span className="text-xl font-semibold text-amber-soft">Vonk</span>
      </Link>
      <Link to="/gemeente" className="text-amber-50/60 hover:text-amber-soft text-sm">
        Municipality dashboard →
      </Link>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-amber-50/60 text-xs uppercase tracking-widest mb-2 inline-block">
        {label}
      </span>
      {children}
    </label>
  );
}
