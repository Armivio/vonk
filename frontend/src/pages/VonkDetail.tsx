import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CitizenShell } from "../components/common/Layout";
import { VonkMap } from "../components/map/VonkMap";
import { ApiError, api } from "../lib/api";

type Participant = {
  user_id: string;
  name: string;
  initials: string;
  age_group?: string | null;
  joined_at: string;
};

type VonkDetail = {
  id: string;
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
  participants: Participant[];
};

export default function VonkDetail() {
  const { id } = useParams();
  const [vonk, setVonk] = useState<VonkDetail | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.get<VonkDetail>(`/api/vonk/${id}`).then(setVonk).catch((e) => setError(String(e)));
  }, [id]);

  async function join() {
    if (!id) return;
    setJoining(true);
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
      setJoining(false);
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

  return (
    <CitizenShell>
      <div className="grid md:grid-cols-[1.4fr_1fr] gap-6 pt-6">
        <div>
          <div className="ember-card p-8">
            <p className="text-amber-glow/80 text-xs uppercase tracking-widest mb-1 capitalize">
              {vonk.category ?? "vonk"} · {when}
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
            <div className="flex items-center gap-3 mt-6">
              <button
                onClick={join}
                disabled={joining || spots === 0}
                className="ember-button"
              >
                {spots === 0 ? "Full" : joining ? "Joining…" : "Join this vonk"}
              </button>
              <span className="text-amber-50/60 text-sm">
                {vonk.participants_count}/{vonk.max_participants} going
              </span>
            </div>
            {error && <div className="text-amber-glow text-sm mt-3">{error}</div>}
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
            {vonk.participants.map((p) => (
              <li key={p.user_id} className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-full bg-amber-glow/20 text-amber-soft flex items-center justify-center font-semibold text-sm">
                  {p.initials}
                </span>
                <div>
                  <div className="text-amber-50">{p.name}</div>
                  {p.age_group && (
                    <div className="text-amber-50/40 text-xs">{p.age_group}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </CitizenShell>
  );
}
