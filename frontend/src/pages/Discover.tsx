import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
import { usePageTitle } from "../lib/usePageTitle";

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

type DateFilter = "today" | "tomorrow" | "this_week" | "all";
const DATE_FILTERS: { value: DateFilter; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "this_week", label: "This week" },
  { value: "all", label: "All" },
];

export default function Discover() {
  usePageTitle("Sparks near you");
  const [searchParams] = useSearchParams();
  const fromOnboarding = searchParams.get("from") === "onboarding";
  const { user } = useUser();
  const [center, setCenter] = useState<[number, number]>(ROTTERDAM);
  const [vonken, setVonken] = useState<VonkOut[]>([]);
  const [matches, setMatches] = useState<MatchOut[]>([]);
  const [latestGloed, setLatestGloed] = useState<GloedOut | null>(null);
  const [category, setCategory] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [search, setSearch] = useState("");
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
    // Force lowercase + only attach the param when a real category is picked.
    // "all" must NEVER be sent as a value — the backend has no row with that
    // category, so it would zero out the feed.
    const normalised = category.trim().toLowerCase();
    if (normalised && normalised !== "all") params.set("category", normalised);

    const url = `/api/vonk/discover?${params.toString()}`;
    if (import.meta.env.DEV) console.debug("[discover]", url);

    try {
      const [vs, gloed] = await Promise.all([
        api.get<VonkOut[]>(url),
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
        } catch {
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

  useEffect(() => {
    if (!latestGloed) {
      setSuggestion(null);
      return;
    }
    const raw = localStorage.getItem(`vonk_suggested_vonk:${latestGloed.id}`);
    if (raw) {
      try {
        setSuggestion(JSON.parse(raw) as SuggestedVonk);
      } catch {
        /* ignore */
      }
    } else {
      setSuggestion(null);
    }
  }, [latestGloed?.id]);

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
      localStorage.setItem(`vonk_suggested_vonk:${latestGloed.id}`, JSON.stringify(s));
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

  const filteredVonken = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = new Date();
    const todayEnd = endOfDay(now);
    const tomorrowEnd = endOfDay(addDays(now, 1));
    const weekEnd = endOfDay(addDays(now, 7));
    return vonken.filter((v) => {
      const t = new Date(v.scheduled_at);
      if (dateFilter === "today" && t > todayEnd) return false;
      if (dateFilter === "tomorrow" && (t <= todayEnd || t > tomorrowEnd)) return false;
      if (dateFilter === "this_week" && t > weekEnd) return false;
      if (q) {
        const hay = `${v.title} ${v.description ?? ""} ${v.location_name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [vonken, search, dateFilter]);

  const points = useMemo<MapPoint[]>(
    () =>
      filteredVonken
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
    [filteredVonken],
  );

  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

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
        <Link to="/find" className="ember-button-ghost text-sm">
          🔥 Find a Vonk
        </Link>
      </div>

      {/* Search + date filter */}
      <div className="flex flex-col sm:flex-row gap-2 mt-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search vonken — title, description, place…"
          className="flex-1 bg-ember-900 text-amber-50 placeholder:text-amber-50/30
                     border border-ember-700 rounded-full px-4 py-2 outline-none text-sm
                     focus:border-amber-glow/60 transition"
        />
        <div className="flex gap-1 overflow-x-auto">
          {DATE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setDateFilter(f.value)}
              className={
                dateFilter === f.value
                  ? "px-3 py-2 rounded-full text-ember-950 bg-amber-glow text-xs font-semibold whitespace-nowrap"
                  : "px-3 py-2 rounded-full border border-ember-700 text-amber-50/60 text-xs hover:border-amber-glow/40 whitespace-nowrap transition"
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="pt-3 flex gap-1 flex-wrap">
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

      <div className="grid lg:grid-cols-[1fr_1.2fr] gap-4 mt-4">
        <div className="space-y-4 lg:max-h-[78vh] lg:overflow-y-auto lg:pr-2">
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
              All gatherings {loading && "…"}
              <span className="text-amber-50/40 normal-case ml-2">
                {filteredVonken.length} of {vonken.length}
              </span>
            </h2>
            {loading && vonken.length === 0 && (
              <div className="grid gap-3">
                {[0, 1, 2].map((i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            )}
            {!loading && filteredVonken.length === 0 && (
              <div className="ember-card p-6 text-center">
                <div className="text-3xl mb-2">🌑</div>
                <p className="text-amber-50/80 text-sm mb-3">
                  {vonken.length === 0
                    ? "No sparks here yet — want to light one?"
                    : "Nothing matches that filter. Try widening it."}
                </p>
                {vonken.length === 0 && (
                  <button onClick={() => setShowCreate(true)} className="ember-button text-sm">
                    Light a new Vonk 🔥
                  </button>
                )}
              </div>
            )}
            <div className="grid gap-3">
              {filteredVonken.map((v) => (
                <div
                  key={v.id}
                  ref={(el) => {
                    if (el) cardRefs.current.set(v.id, el);
                    else cardRefs.current.delete(v.id);
                  }}
                  onMouseEnter={() => setHovered(v.id)}
                  onMouseLeave={() => setHovered((cur) => (cur === v.id ? null : cur))}
                  className={highlighted === v.id ? "rounded-2xl vonk-card-highlight" : ""}
                >
                  <VonkCard
                    vonk={v}
                    emphasized={hovered === v.id}
                    onChanged={() => void reload()}
                  />
                </div>
              ))}
            </div>
          </section>
        </div>
        <div className="ember-card overflow-hidden h-[50vh] lg:h-[78vh] lg:sticky lg:top-4">
          <VonkMap
            center={center}
            points={points}
            onPointClick={focusVonkCard}
            highlightedId={hovered}
          />
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
        onCreated={() => {
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

function SkeletonCard() {
  return (
    <div className="ember-card overflow-hidden animate-pulse">
      <div className="h-32 bg-ember-700/40" />
      <div className="p-4 space-y-2">
        <div className="h-4 bg-ember-700/40 rounded w-3/4" />
        <div className="h-3 bg-ember-700/40 rounded w-1/2" />
        <div className="h-3 bg-ember-700/40 rounded w-full mt-3" />
        <div className="h-3 bg-ember-700/40 rounded w-5/6" />
      </div>
    </div>
  );
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}
