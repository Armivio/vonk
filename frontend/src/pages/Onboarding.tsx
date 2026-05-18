import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChatPanel } from "../components/chat/ChatPanel";
import { CitizenShell } from "../components/common/Layout";
import { useUser } from "../context/UserContext";
import { api, type OnboardingChatResponse, type UserPreferences } from "../lib/api";
import { usePageTitle } from "../lib/usePageTitle";

const ONBOARDING_OPENER =
  "Welcome 🔥 — Vonk works best when I know a little about your vibe. Quick one to start: when you've got an unplanned afternoon, what do you usually drift toward?";

export default function Onboarding() {
  usePageTitle("Set up your vibe");
  const { user, ready, refresh } = useUser();
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [redoing, setRedoing] = useState(false);

  useEffect(() => {
    if (ready && !user) navigate("/", { replace: true });
  }, [ready, user, navigate]);

  // If the user already has preferences and isn't actively redoing them,
  // show a brief "you're already set" state rather than the chat.
  const alreadySet = !!user?.preferences && !redoing;

  async function startOver() {
    try {
      await api.del("/api/onboarding/preferences");
      await refresh();
      setPrefs(null);
      setRedoing(true);
    } catch (e) {
      console.error(e);
    }
  }

  function handleDone(res: OnboardingChatResponse) {
    if (res.preferences) {
      setPrefs(res.preferences);
      void refresh();
    }
  }

  return (
    <CitizenShell>
      <div className="grid md:grid-cols-[1.4fr_1fr] gap-6 pt-6">
        <div>
          <h1 className="text-3xl font-semibold text-amber-soft mb-2">
            Let's get to know your vibe
          </h1>
          <p className="text-amber-50/60 mb-6 text-sm">
            A short chat — five quick questions, no forms. We'll remember what you tell us so your
            future sparks land right.
          </p>
          {alreadySet ? (
            <AlreadySetCard
              prefs={user!.preferences!}
              onContinue={() => navigate("/discover")}
              onRedo={() => void startOver()}
            />
          ) : (
            <ChatPanel<OnboardingChatResponse>
              endpoint="/api/onboarding/chat"
              opener={ONBOARDING_OPENER}
              placeholder="Tell me whatever comes to mind…"
              donePlaceholder="All set — your vibe is saved."
              doneHint="✨ Vibe captured — see what's sparking nearby"
              voiceLang={user?.preferences?.language === "nl" ? "nl-NL" : "en-US"}
              onDone={handleDone}
            />
          )}
        </div>
        <aside className="space-y-4">
          {prefs || user?.preferences ? (
            <PreferenceSummary
              prefs={(prefs ?? user!.preferences!) as UserPreferences}
              onContinue={() => navigate("/discover")}
            />
          ) : (
            <div className="ember-card p-6 text-amber-50/60 text-sm">
              <p className="mb-3">
                Your <span className="text-amber-soft">vibe profile</span> will appear here once
                the assistant has enough to go on. Usually four or five short replies.
              </p>
              <p>You can always redo it later from settings.</p>
            </div>
          )}
        </aside>
      </div>
    </CitizenShell>
  );
}

function PreferenceSummary({
  prefs,
  onContinue,
}: {
  prefs: UserPreferences;
  onContinue: () => void;
}) {
  return (
    <div className="ember-card p-6 shadow-ember">
      <div className="text-amber-glow text-xs uppercase tracking-widest mb-2">
        Your vibe is saved
      </div>
      <dl className="grid grid-cols-2 gap-y-2 text-sm mb-4">
        <Tag label="Interests" value={prefs.interests?.join(", ")} />
        <Tag label="Social" value={prefs.social_style?.replaceAll("_", " ")} />
        <Tag label="Energy" value={prefs.energy_baseline} />
        <Tag label="When" value={prefs.typical_when?.replaceAll("_", " ")} />
        <Tag label="Radius" value={prefs.comfort_radius_km ? `${prefs.comfort_radius_km} km` : null} />
        <Tag label="Language" value={prefs.language?.toUpperCase()} />
      </dl>
      {prefs.notes && (
        <p className="text-amber-50/70 text-xs italic mb-4">"{prefs.notes}"</p>
      )}
      <button onClick={onContinue} className="ember-button w-full justify-center">
        Show me what's sparking →
      </button>
    </div>
  );
}

function AlreadySetCard({
  prefs,
  onContinue,
  onRedo,
}: {
  prefs: UserPreferences;
  onContinue: () => void;
  onRedo: () => void;
}) {
  return (
    <div className="ember-card p-8">
      <p className="text-amber-glow/80 text-xs uppercase tracking-widest mb-2">We already have your vibe</p>
      <h2 className="text-amber-soft text-xl mb-4">
        You're all set — {prefs.interests?.slice(0, 2).join(" and ")}
        {prefs.interests && prefs.interests.length > 2 ? " (and more)" : ""}.
      </h2>
      <p className="text-amber-50/70 text-sm mb-6">
        We'll keep using these preferences to personalise your sparks. You can redo this any time.
      </p>
      <div className="flex gap-3 flex-wrap">
        <button onClick={onContinue} className="ember-button">
          Continue to Discover →
        </button>
        <button onClick={onRedo} className="ember-button-ghost text-sm">
          Redo the vibe chat
        </button>
      </div>
    </div>
  );
}

function Tag({ label, value }: { label: string; value?: string | null }) {
  return (
    <>
      <dt className="text-amber-50/40 uppercase text-[10px] tracking-widest">{label}</dt>
      <dd className="text-amber-50/90 capitalize">{value ?? "—"}</dd>
    </>
  );
}
