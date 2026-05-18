import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChatPanel } from "../components/chat/ChatPanel";
import { CitizenShell } from "../components/common/Layout";
import { VonkMap, type MapPoint } from "../components/map/VonkMap";
import { CreateVonkModal } from "../components/vonk/CreateVonkModal";
import { MatchCard } from "../components/vonk/MatchCard";
import { VonkCard } from "../components/vonk/VonkCard";
import { useUser } from "../context/UserContext";
import {
  api,
  ApiError,
  type GloedOut,
  type MatchOut,
  type SuggestedVonk,
  type VonkOut,
} from "../lib/api";

type GloedDiscoverTurn = {
  session_id: string;
  assistant_message: string;
  done: boolean;
  gloed?: GloedOut | null;
};

const ROTTERDAM: [number, number] = [51.9225, 4.4792];
const CATEGORIES = ["all", "social", "active", "creative", "learning", "quiet", "food"];
const CATEGORY_PILL_COLOR: Record<string, string> = {
  all: "linear-gradient(135deg, #f59e0b 0%, #b45309 100%)",
  social: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
  active: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
  creative: "linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)",
  learning: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
  quiet: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
  food: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
};

export default function Discover() {
  const [searchParams] = useSearchParams();
  const fromOnboarding = searchParams.get("from") === "onboarding";
  const { user } = useUser();
  const [center, setCenter] = useState<[number, number]>(ROTTERDAM);
  const [vonken, setVonken] = useState<VonkOut[]>([]);
  const [matches, setMatches] = useState<MatchOut[]>([]);
  const [latestGloed, setLatestGloed] = useState<GloedOut | null>(null);
  const [category, setCategory] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<SuggestedVonk | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showGloedChat, setShowGloedChat] = useState(false);

  // Auto-open the gloed chat the first time someone with prefs but no gloed lands here.
  useEffect(() => {
    if (!user) return;
    const hasGloed = !!localStorage.getItem("vonk_latest_gloed");
    if (user.preferences && !hasGloed) setShowGloedChat(true);
  }, [user]);

  function handleGloedReady(res: GloedDiscoverTurn) {
    if (res.gloed) {
      localStorage.setItem("vonk_latest_gloed", JSON.stringify(res.gloed));
      setLatestGloed(res.gloed);
      void reload();
      setTimeout(() => setShowGloedChat(false), 1200);
    }
  }

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (p) => setCenter([p.coords.latitude, p.coords.longitude]),
        () => {},
        { timeout: 1500 },
      );
    }
  }, []);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center, category]);

  async function reload() {
    setLoading(true);
    const params = new URLSearchParams({
      lat: String(center[0]),
      lon: String(center[1]),
      radius_km: "12",
    });
    if (category !== "all") params.set("category", category);

    try {
      const [vs, gloed] = await Promise.all([
        api.get<VonkOut[]>(`/api/vonk/discover?${params.toString()}`),
        Promise.resolve(pickLatestGloed()),
      ]);
      setVonken(vs);
      setLatestGloed(gloed);
      if (gloed) {
        try {
          const res = await api.post<{ matches: MatchOut[] }>("/api/match", {
            gloed_id: gloed.id,
          });
          setMatches(res.matches);
        } catch (e) {
          console.error("match failed", e);
          setMatches([]);
        }
      } else {
        setMatches([]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const gloedMatchIds = useMemo(
    () => matches.filter((m) => m.type === "gloed").map((m) => m.id),
    [matches],
  );

  async function generateSuggestion() {
    if (!latestGloed) return;
    setSuggesting(true);
    setSuggestError(null);
    try {
      const ids = [latestGloed.id, ...gloedMatchIds.slice(0, 3)];
      const s = await api.post<SuggestedVonk>("/api/match/suggest-vonk", { gloed_ids: ids });
      setSuggestion(s);
    } catch (e) {
      if (e instanceof ApiError && e.status === 503) {
        setSuggestError("AI suggestions need ANTHROPIC_API_KEY in .env.");
      } else {
        setSuggestError(String(e));
      }
    } finally {
      setSuggesting(false);
    }
  }

  const points = useMemo<MapPoint[]>(
    () =>
      vonken
        .filter((v) => v.latitude && v.longitude)
        .map((v) => ({
          id: v.id,
          lat: v.latitude,
          lon: v.longitude,
          title: v.title,
          subtitle: v.location_name ?? undefined,
          when: shortWhen(v.scheduled_at),
          spots_left: Math.max(0, v.max_participants - v.participants_count),
          is_full: v.is_full || v.participants_count >= v.max_participants,
        })),
    [vonken],
  );

  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [highlighted, setHighlighted] = useState<string | null>(null);

  function focusVonkCard(id: string) {
    const el = cardRefs.current.get(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlighted(id);
    setTimeout(() => setHighlighted((cur) => (cur === id ? null : cur)), 1700);
  }

  return (
    <CitizenShell>
      {fromOnboarding && latestGloed && (
        <div className="ember-card p-4 mt-4 shadow-ember border-amber-glow/40 flex items-center gap-3">
          <span className="text-2xl">🔥</span>
          <p className="text-amber-50/90 text-sm">
            Based on your vibe, these might be perfect for you. We picked them just for you.
          </p>
        </div>
      )}

      <div className="pt-4 pb-2 flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl font-semibold text-amber-soft">Sparks near you</h1>
        <div className="flex gap-1 flex-wrap">
          {CATEGORIES.map((c) => {
            const isActive = c === category;
            return (
              <button
                key={c}
                onClick={() => setCategory(c)}
                style={isActive ? { background: CATEGORY_PILL_COLOR[c] } : undefined}
                className={
                  isActive
                    ? "px-3 py-1 rounded-full text-white text-sm font-medium capitalize shadow-ember transition"
                    : "px-3 py-1 rounded-full border border-ember-700 text-amber-50/60 text-sm hover:border-amber-glow/40 capitalize transition"
                }
              >
                {c}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_1.2fr] gap-4 mt-4">
        <div className="space-y-4 lg:max-h-[78vh] lg:overflow-y-auto lg:pr-2">
          <section>
            {showGloedChat ? (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-amber-glow/80 text-xs uppercase tracking-widest">
                    What's sparking for you today?
                  </h2>
                  <button
                    onClick={() => setShowGloedChat(false)}
                    className="text-amber-50/40 text-xs hover:text-amber-soft transition"
                  >
                    Close ✕
                  </button>
                </div>
                <ChatPanel<GloedDiscoverTurn>
                  endpoint="/api/gloed/ai-discover"
                  opener={pickOpener()}
                  placeholder="Type whatever's on your mind…"
                  donePlaceholder="Your gloed is live."
                  doneHint="✨ Found your spark — see what's nearby"
                  voiceLang={user?.preferences?.language === "nl" ? "nl-NL" : "en-US"}
                  withLocation
                  onDone={handleGloedReady}
                />
              </div>
            ) : (
              <button
                onClick={() => setShowGloedChat(true)}
                className="ember-card p-4 w-full text-left flex items-center justify-between gap-3 hover:border-amber-glow/40 transition"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🔥</span>
                  <div>
                    <div className="text-amber-soft font-medium text-sm">
                      {latestGloed ? "Update what's sparking" : "What's sparking for you today?"}
                    </div>
                    <div className="text-amber-50/50 text-xs">
                      {latestGloed
                        ? "Chat again to refresh your matches."
                        : "A quick chat to find tonight's right thing."}
                    </div>
                  </div>
                </div>
                <span className="text-amber-glow/70 text-sm">Open →</span>
              </button>
            )}
          </section>
          {latestGloed && matches.length > 0 && (
            <section>
              <h2 className="text-amber-glow/80 text-xs uppercase tracking-widest mb-2">
                Picked for your latest gloed
              </h2>
              <div className="grid gap-3">
                {matches.map((m) => (
                  <MatchCard key={`${m.type}:${m.id}`} match={m} />
                ))}
              </div>
              {gloedMatchIds.length >= 1 && (
                <div className="ember-card p-5 mt-3 border-amber-glow/30">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-amber-glow text-xs uppercase tracking-widest mb-1">
                        Spark a new vonk
                      </div>
                      <p className="text-amber-50/80 text-sm">
                        Let the AI design a concrete gathering for you and these compatible souls.
                      </p>
                    </div>
                    <button
                      onClick={() => void generateSuggestion()}
                      disabled={suggesting}
                      className="ember-button-ghost whitespace-nowrap text-sm"
                    >
                      {suggesting ? "Designing…" : "Suggest"}
                    </button>
                  </div>
                  {suggestion && (
                    <div className="mt-4 p-4 bg-ember-900/60 border border-amber-glow/30 rounded-xl">
                      <div className="text-amber-soft font-semibold">{suggestion.title}</div>
                      <div className="text-amber-50/60 text-xs mt-0.5">
                        {suggestion.location_name} · {suggestion.when_relative}
                      </div>
                      <p className="text-amber-50/80 text-sm mt-2">{suggestion.description}</p>
                      <p className="text-amber-50/60 text-xs italic mt-2">
                        Why it works: {suggestion.why_it_works}
                      </p>
                      <button
                        onClick={() => setShowCreate(true)}
                        className="ember-button mt-3 w-full justify-center text-sm"
                      >
                        Light this vonk now →
                      </button>
                    </div>
                  )}
                  {suggestError && (
                    <p className="text-amber-glow text-xs mt-3">{suggestError}</p>
                  )}
                </div>
              )}
            </section>
          )}
          <section>
            <h2 className="text-amber-glow/80 text-xs uppercase tracking-widest mb-2">
              All gatherings nearby {loading && "…"}
            </h2>
            {vonken.length === 0 && !loading && (
              <div className="ember-card p-6 text-center">
                <div className="text-3xl mb-2">🌑</div>
                <p className="text-amber-50/80 text-sm mb-3">
                  No sparks here yet — want to light one?
                </p>
                <button
                  onClick={() => setShowCreate(true)}
                  className="ember-button text-sm"
                >
                  Light a new Vonk 🔥
                </button>
              </div>
            )}
            <div className="grid gap-3">
              {vonken.map((v) => (
                <div
                  key={v.id}
                  ref={(el) => {
                    if (el) cardRefs.current.set(v.id, el);
                    else cardRefs.current.delete(v.id);
                  }}
                  className={highlighted === v.id ? "rounded-2xl vonk-card-highlight" : ""}
                >
                  <VonkCard vonk={v} onChanged={() => void reload()} />
                </div>
              ))}
            </div>
          </section>
        </div>
        <div className="ember-card overflow-hidden h-[50vh] lg:h-[78vh] lg:sticky lg:top-4">
          <VonkMap center={center} points={points} onPointClick={focusVonkCard} />
        </div>
      </div>

      <button
        onClick={() => setShowCreate(true)}
        className="fixed bottom-8 right-8 z-30 w-16 h-16 rounded-full bg-amber-glow text-ember-950 text-3xl font-light shadow-ember hover:bg-amber-soft transition flex items-center justify-center"
        aria-label="Light a new vonk"
        title="Light a new vonk"
      >
        +
      </button>

      <CreateVonkModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(_v) => {
          void reload();
        }}
        prefill={
          suggestion
            ? {
                title: suggestion.title,
                description: suggestion.description + "\n\nWhy: " + suggestion.why_it_works,
                category: suggestion.category,
                location_name: suggestion.location_name,
              }
            : undefined
        }
        fromGloed={latestGloed}
      />
    </CitizenShell>
  );
}

function shortWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString([], {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function pickLatestGloed(): GloedOut | null {
  const raw = localStorage.getItem("vonk_latest_gloed");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GloedOut;
  } catch {
    return null;
  }
}

const OPENERS = [
  "What sort of evening are you in the mood for?",
  "If tonight could be anything, what would it look like?",
  "What would make today feel a little brighter?",
];

function pickOpener(): string {
  return OPENERS[Math.floor(Math.random() * OPENERS.length)];
}
