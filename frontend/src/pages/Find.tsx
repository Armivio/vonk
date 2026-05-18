import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AutoSubscribedCard } from "../components/chat/AutoSubscribedCard";
import { ChatPanel } from "../components/chat/ChatPanel";
import { CitizenShell } from "../components/common/Layout";
import { useUser } from "../context/UserContext";
import {
  api,
  type GloedDiscoverResponse,
  type GloedOut,
  type OnboardingChatResponse,
  type UserPreferences,
} from "../lib/api";
import { displayName } from "../lib/displayName";
import { usePageTitle } from "../lib/usePageTitle";

const ONBOARDING_OPENER =
  "Welcome 🔥 — Vonk works best when I know a little about your vibe. Quick one to start: when you've got an unplanned afternoon, what do you usually drift toward?";

const ONBOARDING_OPENER_NL =
  "Welkom 🔥 — Vonk werkt het best als ik je een beetje ken. Eerst even: als je een vrije middag hebt zonder plan, wat doe je dan meestal?";

function returningOpener(name: string, lang: "en" | "nl"): string {
  if (lang === "nl") {
    return `Hé ${name}! Waar heb je vandaag zin in? ✨`;
  }
  return `Hey ${name} — what are you in the mood for today? ✨`;
}

// Unified turn response: gloed and onboarding endpoints both produce these fields
// (auto_subscribed + alternatives + gloed). Onboarding additionally returns
// preferences, but the frontend handler doesn't care.
type UnifiedTurn = GloedDiscoverResponse & Partial<OnboardingChatResponse>;

export default function Find() {
  usePageTitle("Find a Vonk");
  const { user, ready, refresh } = useUser();
  const navigate = useNavigate();
  const [latestGloed, setLatestGloed] = useState<GloedOut | null>(null);
  const [latestPrefs, setLatestPrefs] = useState<UserPreferences | null>(null);
  const [redoOnboarding, setRedoOnboarding] = useState(false);

  useEffect(() => {
    if (ready && !user) navigate("/", { replace: true });
  }, [ready, user, navigate]);

  if (!user) return null;

  const hasPrefs = !!user.preferences && !redoOnboarding;
  const mode: "onboarding" | "quick" = hasPrefs ? "quick" : "onboarding";
  const lang: "en" | "nl" = user.preferences?.language === "nl" ? "nl" : "en";

  const endpoint = mode === "onboarding" ? "/api/onboarding/chat" : "/api/gloed/ai-discover";
  const opener =
    mode === "onboarding"
      ? lang === "nl"
        ? ONBOARDING_OPENER_NL
        : ONBOARDING_OPENER
      : returningOpener(displayName(user).split(" ")[0], lang);

  async function startOver() {
    try {
      await api.del("/api/onboarding/preferences");
      await refresh();
      setRedoOnboarding(true);
    } catch (e) {
      console.error(e);
    }
  }

  function handleDone(res: UnifiedTurn) {
    if (res.preferences) {
      setLatestPrefs(res.preferences);
      void refresh();
    }
    if (res.gloed) {
      localStorage.setItem("vonk_latest_gloed", JSON.stringify(res.gloed));
      setLatestGloed(res.gloed);
    }
  }

  // Use a key so switching modes (e.g. after a successful turn or starting over)
  // remounts the chat fresh — Anthropic sessions are stateless across mounts.
  const chatKey = `${mode}:${redoOnboarding}:${latestGloed?.id ?? "new"}`;

  return (
    <CitizenShell>
      <div className="grid md:grid-cols-[1.4fr_1fr] gap-6 pt-6">
        <div>
          <h1 className="text-3xl font-semibold text-amber-soft mb-2">
            {mode === "onboarding"
              ? lang === "nl"
                ? "Laten we elkaar leren kennen"
                : "Let's get to know your vibe"
              : lang === "nl"
              ? "Wat sprankelt vandaag?"
              : "What's sparking for you today?"}
          </h1>
          <p className="text-amber-50/60 mb-6 text-sm">
            {mode === "onboarding"
              ? lang === "nl"
                ? "Een kort gesprek — een paar vragen, geen formulieren. We onthouden je voorkeuren zodat we elke keer betere matches kunnen vinden."
                : "A short chat — a few questions, no forms. We'll remember your vibe so every future spark lands right."
              : lang === "nl"
              ? "Vertel me in eigen woorden waar je naar op zoek bent. Ik zoek meteen iets bij je in de buurt."
              : "Tell me what you're in the mood for. I'll find — or light — something nearby."}
          </p>
          <ChatPanel<UnifiedTurn>
            key={chatKey}
            endpoint={endpoint}
            opener={opener}
            placeholder={
              lang === "nl" ? "Typ wat in je opkomt…" : "Type whatever's on your mind…"
            }
            donePlaceholder={lang === "nl" ? "Helemaal goed." : "All set."}
            voiceLang={lang === "nl" ? "nl-NL" : "en-US"}
            withLocation
            onDone={handleDone}
            renderDoneAttachment={(res) =>
              res.auto_subscribed ? (
                <AutoSubscribedCard
                  vonk={res.auto_subscribed}
                  alternatives={res.alternatives}
                />
              ) : null
            }
          />
        </div>
        <aside className="space-y-4">
          {(latestPrefs || user.preferences) && (
            <PreferenceSummary
              prefs={(latestPrefs ?? user.preferences!) as UserPreferences}
              onRedo={() => void startOver()}
              onContinue={() => navigate("/discover")}
            />
          )}
          {latestGloed && !latestPrefs && (
            <div className="ember-card p-6">
              <div className="text-amber-glow text-xs uppercase tracking-widest mb-2">
                Your gloed is live
              </div>
              <p className="text-amber-50 text-sm leading-snug mb-4">
                {latestGloed.ai_parsed}
              </p>
              <button
                onClick={() => navigate("/discover")}
                className="ember-button w-full justify-center"
              >
                {lang === "nl" ? "Bekijk alles wat sprankelt →" : "See all sparks nearby →"}
              </button>
            </div>
          )}
          {!latestPrefs && !user.preferences && !latestGloed && (
            <div className="ember-card p-6 text-amber-50/60 text-sm">
              <p className="mb-3">
                {lang === "nl"
                  ? "Je vibe-profiel verschijnt hier zodra we genoeg weten. Meestal na vier of vijf korte antwoorden."
                  : "Your vibe profile will appear here once we have enough to go on. Usually four or five short replies."}
              </p>
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
  onRedo,
}: {
  prefs: UserPreferences;
  onContinue: () => void;
  onRedo: () => void;
}) {
  return (
    <div className="ember-card p-6 shadow-ember">
      <div className="text-amber-glow text-xs uppercase tracking-widest mb-2">
        Your vibe
      </div>
      <dl className="grid grid-cols-2 gap-y-2 text-sm mb-4">
        <Tag label="Interests" value={prefs.interests?.join(", ")} />
        <Tag label="Social" value={prefs.social_style?.replaceAll("_", " ")} />
        <Tag label="Energy" value={prefs.energy_baseline} />
        <Tag label="When" value={prefs.typical_when?.replaceAll("_", " ")} />
        <Tag
          label="Radius"
          value={prefs.comfort_radius_km ? `${prefs.comfort_radius_km} km` : null}
        />
        <Tag label="Language" value={prefs.language?.toUpperCase()} />
      </dl>
      {prefs.notes && (
        <p className="text-amber-50/70 text-xs italic mb-4">"{prefs.notes}"</p>
      )}
      <div className="flex gap-2 flex-wrap">
        <button onClick={onContinue} className="ember-button text-sm">
          See all sparks →
        </button>
        <button onClick={onRedo} className="ember-button-ghost text-xs">
          Redo vibe chat
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
