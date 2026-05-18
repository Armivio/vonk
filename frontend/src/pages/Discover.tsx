import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CitizenShell } from "../components/common/Layout";
import { VonkMap, type MapPoint } from "../components/map/VonkMap";
import { CreateVonkModal } from "../components/vonk/CreateVonkModal";
import { MatchCard } from "../components/vonk/MatchCard";
import { VonkCard } from "../components/vonk/VonkCard";
import {
  api,
  ApiError,
  type GloedOut,
  type MatchOut,
  type SuggestedVonk,
  type VonkOut,
} from "../lib/api";

const ROTTERDAM: [number, number] = [51.9225, 4.4792];
const CATEGORIES = ["all", "social", "active", "creative", "learning", "quiet", "food"];

export default function Discover() {
  const [searchParams] = useSearchParams();
  const fromOnboarding = searchParams.get("from") === "onboarding";
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
        })),
    [vonken],
  );

  return (
    <CitizenShell>
      {fromOnboarding && latestGloed && (
        <div className="ember-card p-4 mt-4 shadow-ember border-amber-glow/40 flex items-center gap-3">
          <span className="text-2xl">🔥</span>
          <p className="text-amber-50/90 text-sm">
            Your gloed is live — these are picked just for you, based on what you said.
          </p>
        </div>
      )}

      <div className="pt-4 pb-2 flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl font-semibold text-amber-soft">Sparks near you</h1>
        <div className="flex gap-1 flex-wrap">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={
                c === category
                  ? "px-3 py-1 rounded-full bg-amber-glow text-ember-950 text-sm font-medium capitalize"
                  : "px-3 py-1 rounded-full border border-ember-700 text-amber-50/60 text-sm hover:border-amber-glow/40 capitalize"
              }
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_1.2fr] gap-4 mt-4">
        <div className="space-y-4 max-h-[78vh] overflow-y-auto pr-2">
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
              <div className="ember-card p-6 text-amber-50/60 text-sm">
                Nothing sparking just yet. Light a gloed and we'll find a few — or create your own.
              </div>
            )}
            <div className="grid gap-3">
              {vonken.map((v) => (
                <VonkCard key={v.id} vonk={v} />
              ))}
            </div>
          </section>
        </div>
        <div className="ember-card overflow-hidden h-[78vh] sticky top-4">
          <VonkMap center={center} points={points} />
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

function pickLatestGloed(): GloedOut | null {
  const raw = localStorage.getItem("vonk_latest_gloed");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GloedOut;
  } catch {
    return null;
  }
}
