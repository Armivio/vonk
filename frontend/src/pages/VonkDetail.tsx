import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CitizenShell } from "../components/common/Layout";
import { Avatar } from "../components/common/Avatar";
import { VonkMap } from "../components/map/VonkMap";
import { CreateVonkModal } from "../components/vonk/CreateVonkModal";
import { useUser } from "../context/UserContext";
import { ApiError, api } from "../lib/api";
import { imageForVonk } from "../lib/categoryImages";
import { displayName } from "../lib/displayName";
import { usePageTitle } from "../lib/usePageTitle";
import { shareVonk } from "../lib/share";

type Participant = {
  user_id: string;
  name: string;
  last_name?: string | null;
  initials: string;
  age_group?: string | null;
  joined_at: string;
};

type VonkDetail = {
  id: string;
  creator_id?: string | null;
  title: string;
  description?: string | null;
  category?: string | null;
  location_name?: string | null;
  latitude: number;
  longitude: number;
  scheduled_at: string;
  max_participants: number;
  status: string;
  participants_count: number;
  is_full: boolean;
  joined: boolean;
  participants: Participant[];
};

type MyFeedback = {
  rating: number;
  comment?: string | null;
  would_start_vuur: boolean;
};

export default function VonkDetail() {
  const { id } = useParams();
  usePageTitle(null);
  const navigate = useNavigate();
  const { user, registerGuest } = useUser();
  const [vonk, setVonk] = useState<VonkDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestSubmitting, setGuestSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<MyFeedback | null>(null);

  useEffect(() => {
    if (!id) return;
    api.get<VonkDetail>(`/api/vonk/${id}`).then(setVonk).catch((e) => setError(String(e)));
  }, [id]);

  useEffect(() => {
    if (!id || !user) return;
    api
      .get<MyFeedback | null>(`/api/vonk/${id}/feedback/me`)
      .then(setFeedback)
      .catch(() => setFeedback(null));
  }, [id, user?.id]);

  async function refresh() {
    if (!id) return;
    const fresh = await api.get<VonkDetail>(`/api/vonk/${id}`);
    setVonk(fresh);
  }

  async function join() {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.post<VonkDetail>(`/api/vonk/${id}/join`);
      setVonk(updated);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setError("Refresh the page once — we're still issuing your session.");
      } else if (e instanceof ApiError && e.status === 409) {
        setError("This vonk just filled up.");
      } else {
        setError(String(e));
      }
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/vonk/${id}/leave`);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!id) return;
    if (!confirm("Cancel this vonk? It will disappear from the discover feed.")) return;
    setBusy(true);
    try {
      await api.post(`/api/vonk/${id}/cancel`);
      navigate("/discover");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!vonk) return;
    const result = await shareVonk({ id: vonk.id, title: vonk.title });
    if (result === "copied") {
      setToast("Link copied!");
      setTimeout(() => setToast(null), 1800);
    }
  }

  async function guestJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!guestName.trim() || !id) return;
    setGuestSubmitting(true);
    setError(null);
    try {
      await registerGuest(guestName.trim());
      const updated = await api.post<VonkDetail>(`/api/vonk/${id}/join`);
      setVonk(updated);
    } catch (e) {
      setError(String(e));
    } finally {
      setGuestSubmitting(false);
    }
  }

  if (error && !vonk) {
    return (
      <CitizenShell>
        <div className="ember-card p-8 mt-10 text-amber-50/70">{error}</div>
      </CitizenShell>
    );
  }
  if (!vonk) {
    return (
      <CitizenShell>
        <div className="ember-card p-8 mt-10 text-amber-50/60">Loading…</div>
      </CitizenShell>
    );
  }

  const when = new Date(vonk.scheduled_at).toLocaleString([], {
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
  const spots = Math.max(0, vonk.max_participants - vonk.participants_count);
  const isHost = !!user && user.id === vonk.creator_id;

  return (
    <CitizenShell>
      <div className="grid md:grid-cols-[1.4fr_1fr] gap-6 pt-6">
        <div>
          <div className="ember-card overflow-hidden">
            <div className="relative h-48 sm:h-60 overflow-hidden">
              <img
                src={imageForVonk(vonk.category, vonk.id)}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(28,16,10,0.1) 0%, rgba(28,16,10,0.85) 100%)",
                }}
              />
            </div>
            <div className="p-8">
            <p className="text-amber-glow/80 text-xs uppercase tracking-widest mb-1 capitalize">
              {vonk.category ?? "vonk"} · {when}
              {isHost && <span className="ml-2 text-amber-glow">★ you're the host</span>}
            </p>
            <h1 className="text-3xl font-semibold text-amber-soft leading-tight">
              {vonk.title}
            </h1>
            {vonk.location_name && (
              <p className="text-amber-50/60 mt-1">{vonk.location_name}</p>
            )}
            {vonk.description && (
              <p className="text-amber-50/80 mt-4 leading-relaxed">{vonk.description}</p>
            )}

            {!user ? (
              <form onSubmit={guestJoin} className="mt-6 flex flex-col sm:flex-row gap-3">
                <input
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Your name to join"
                  className="flex-1 bg-ember-900 text-amber-50 placeholder:text-amber-50/30 border border-ember-700 rounded-full px-5 py-3 outline-none focus:border-amber-glow/60 transition"
                  required
                />
                <button type="submit" disabled={guestSubmitting} className="ember-button">
                  {guestSubmitting ? "Joining…" : "Join this Vonk"}
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-3 mt-6 flex-wrap">
                {vonk.joined ? (
                  <button onClick={leave} disabled={busy} className="ember-button-ghost">
                    {busy ? "…" : "Leave this Vonk"}
                  </button>
                ) : (
                  <button
                    onClick={join}
                    disabled={busy || vonk.is_full}
                    className="ember-button"
                  >
                    {vonk.is_full ? "Full" : busy ? "Joining…" : "Join this Vonk"}
                  </button>
                )}
                <button onClick={share} className="ember-button-ghost text-sm">↗ Share</button>
                {isHost && (
                  <>
                    <button onClick={() => setShowEdit(true)} className="ember-button-ghost text-sm">
                      Edit
                    </button>
                    <button
                      onClick={cancel}
                      disabled={busy}
                      className="px-4 py-2 rounded-full border border-red-500/40 text-red-300 text-sm hover:bg-red-500/10 transition"
                    >
                      Cancel Vonk
                    </button>
                  </>
                )}
                <span className="text-amber-50/60 text-sm">
                  {vonk.participants_count}/{vonk.max_participants} going
                  {vonk.is_full ? " · full" : ` · ${spots} spot${spots === 1 ? "" : "s"} left`}
                </span>
              </div>
            )}
            {error && <div className="text-amber-glow text-sm mt-3">{error}</div>}
            {toast && <div className="text-amber-glow text-sm mt-3">{toast}</div>}

            {user && vonk.joined && new Date(vonk.scheduled_at).getTime() < Date.now() && (
              <FeedbackPrompt
                vonkId={vonk.id}
                existing={feedback}
                onSaved={setFeedback}
              />
            )}
            </div>
          </div>

          <div className="ember-card overflow-hidden mt-4 h-72">
            <VonkMap
              center={[vonk.latitude, vonk.longitude]}
              points={[
                {
                  id: vonk.id,
                  lat: vonk.latitude,
                  lon: vonk.longitude,
                  title: vonk.title,
                  subtitle: vonk.location_name ?? undefined,
                  when,
                  spots_left: spots,
                  is_full: vonk.is_full,
                  imageUrl: imageForVonk(vonk.category, vonk.id),
                  category: vonk.category ?? undefined,
                },
              ]}
            />
          </div>
        </div>

        <aside className="ember-card p-6">
          <h2 className="text-amber-glow/80 text-xs uppercase tracking-widest mb-3">
            Who's coming
          </h2>
          {vonk.participants.length === 0 && (
            <p className="text-amber-50/60 text-sm">No one yet. Be the first.</p>
          )}
          <ul className="space-y-3">
            {vonk.participants.map((p) => {
              const isCreator = p.user_id === vonk.creator_id;
              return (
                <li key={p.user_id} className="flex items-center gap-3">
                  <Avatar name={p.name} />
                  <div className="flex-1">
                    <div className="text-amber-50 flex items-center gap-2">
                      {displayName(p)}
                      {isCreator && (
                        <span className="text-[10px] uppercase tracking-widest text-amber-glow bg-amber-glow/10 px-1.5 py-0.5 rounded">
                          Host
                        </span>
                      )}
                    </div>
                    {p.age_group && (
                      <div className="text-amber-50/40 text-xs">{p.age_group}</div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>

      <CreateVonkModal
        open={showEdit}
        onClose={() => setShowEdit(false)}
        onCreated={() => void refresh()}
        editingId={vonk.id}
        prefill={{
          title: vonk.title,
          description: vonk.description ?? "",
          category: vonk.category ?? "social",
          location_name: vonk.location_name ?? "",
          latitude: vonk.latitude,
          longitude: vonk.longitude,
          scheduled_at: toLocalInput(vonk.scheduled_at),
          max_participants: vonk.max_participants,
        }}
      />
    </CitizenShell>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function FeedbackPrompt({
  vonkId,
  existing,
  onSaved,
}: {
  vonkId: string;
  existing: MyFeedback | null;
  onSaved: (f: MyFeedback) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [vuurAsk, setVuurAsk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rate(stars: 1 | 2 | 3) {
    setSubmitting(true);
    setError(null);
    try {
      const fb = await api.post<MyFeedback>(`/api/vonk/${vonkId}/feedback`, {
        rating: stars,
        would_start_vuur: existing?.would_start_vuur ?? false,
      });
      onSaved(fb);
      if (stars === 3 && !existing?.would_start_vuur) setVuurAsk(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function markVuur(would: boolean) {
    setSubmitting(true);
    try {
      const fb = await api.post<MyFeedback>(`/api/vonk/${vonkId}/feedback`, {
        rating: existing?.rating ?? 3,
        would_start_vuur: would,
      });
      onSaved(fb);
      setVuurAsk(false);
    } finally {
      setSubmitting(false);
    }
  }

  if (existing && !vuurAsk) {
    return (
      <div className="mt-6 p-4 rounded-xl bg-amber-glow/10 border border-amber-glow/30">
        <div className="text-amber-glow text-xs uppercase tracking-widest mb-1">
          Thanks for sharing
        </div>
        <p className="text-amber-50/80 text-sm">
          You rated this {"🔥".repeat(existing.rating)}. Your feedback shapes future matches —
          aggregate only, never shared with other participants.
        </p>
      </div>
    );
  }

  if (vuurAsk) {
    return (
      <div className="mt-6 p-4 rounded-xl bg-amber-glow/10 border border-amber-glow/40">
        <div className="text-amber-soft font-semibold mb-1">Want to make this a Vuur?</div>
        <p className="text-amber-50/70 text-sm mb-3">
          A vuur is a recurring group with the same people. Want us to suggest a follow-up?
        </p>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => void markVuur(true)}
            disabled={submitting}
            className="ember-button text-sm"
          >
            Yes, create a Vuur →
          </button>
          <button
            onClick={() => void markVuur(false)}
            disabled={submitting}
            className="ember-button-ghost text-sm"
          >
            Not this time
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 p-4 rounded-xl bg-ember-900/60 border border-ember-700">
      <div className="text-amber-soft font-semibold mb-1">How was your vonk? 🔥</div>
      <p className="text-amber-50/60 text-xs mb-3">
        Tap a flame. Helps us find better matches next time.
      </p>
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => void rate(3)}
          disabled={submitting}
          className="px-4 py-2 rounded-full bg-amber-glow/20 border border-amber-glow/40 hover:bg-amber-glow/30 transition text-amber-soft text-sm"
        >
          🔥🔥🔥 Amazing — let's do it again
        </button>
        <button
          onClick={() => void rate(2)}
          disabled={submitting}
          className="px-4 py-2 rounded-full bg-amber-glow/10 border border-amber-glow/30 hover:bg-amber-glow/20 transition text-amber-50/80 text-sm"
        >
          🔥🔥 Good — would join similar
        </button>
        <button
          onClick={() => void rate(1)}
          disabled={submitting}
          className="px-4 py-2 rounded-full border border-ember-700 hover:border-amber-glow/40 transition text-amber-50/70 text-sm"
        >
          🔥 Okay — not quite my vibe
        </button>
      </div>
      {error && <p className="text-amber-glow text-xs mt-2">{error}</p>}
    </div>
  );
}
