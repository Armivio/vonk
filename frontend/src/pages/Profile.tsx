import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CitizenShell } from "../components/common/Layout";
import { useUser } from "../context/UserContext";
import { api, ApiError, type UserPreferences } from "../lib/api";
import { displayName } from "../lib/displayName";
import { usePageTitle } from "../lib/usePageTitle";
import { clearSession } from "../lib/session";

type Stats = {
  vonken_attended: number;
  vonken_hosted: number;
  vuuren_member: number;
  connections: number;
  joined_month: string;
};

export default function Profile() {
  usePageTitle("Your profile");
  const { user, ready, signOut } = useUser();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !user) navigate("/", { replace: true });
  }, [ready, user, navigate]);

  useEffect(() => {
    if (!user) return;
    api
      .get<Stats>("/api/auth/me/stats")
      .then(setStats)
      .catch(() => {
        /* stats are best-effort */
      });
  }, [user?.id]);

  if (!user) return null;

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await api.del("/api/auth/me");
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) {
        setError(String(e));
        setDeleting(false);
        return;
      }
    }
    clearSession();
    localStorage.removeItem("vonk_latest_gloed");
    signOut();
    navigate("/", { replace: true });
  }

  const prefs = user.preferences as UserPreferences | null | undefined;

  return (
    <CitizenShell>
      <div className="max-w-2xl mx-auto pt-6 space-y-5">
        <header className="ember-card p-6">
          <div className="text-amber-glow text-xs uppercase tracking-widest mb-1">Your profile</div>
          <h1 className="text-3xl font-semibold text-amber-soft flex items-center gap-2">
            🔥 {displayName(user)}
          </h1>
          <p className="text-amber-50/60 text-sm mt-1">
            {user.city ?? "Rotterdam"}
            {user.neighborhood ? ` · ${user.neighborhood}` : ""}
            {stats?.joined_month ? ` · Joined ${stats.joined_month}` : ""}
          </p>
        </header>

        {prefs && (
          <section className="ember-card p-6">
            <div className="text-amber-glow text-xs uppercase tracking-widest mb-3">Your vibe</div>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
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
            <button
              onClick={() => navigate("/find")}
              className="ember-button-ghost text-sm mt-4"
            >
              Edit Preferences
            </button>
          </section>
        )}

        <section className="ember-card p-6">
          <div className="text-amber-glow text-xs uppercase tracking-widest mb-3">Your stats</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat n={stats?.vonken_attended ?? 0} label="vonken attended" />
            <Stat n={stats?.vonken_hosted ?? 0} label="vonken hosted" />
            <Stat n={stats?.vuuren_member ?? 0} label="vuuren" />
            <Stat n={stats?.connections ?? 0} label="connections" />
          </div>
        </section>

        <section className="ember-card p-6 border-red-500/30">
          <div className="text-red-300/80 text-xs uppercase tracking-widest mb-2">Your data, your control</div>
          <p className="text-amber-50/70 text-sm mb-3">
            Vonk only keeps what you give it. You can wipe everything any time.
          </p>
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="px-4 py-2 rounded-full border border-red-500/40 text-red-300 text-sm hover:bg-red-500/10 transition"
            >
              Delete my account
            </button>
          ) : (
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
              <p className="text-red-200 text-sm mb-3">
                This will permanently delete your account, your preferences, and your gloeds.
                Vonken you hosted will stay (so others can still attend) but your name will be removed.
              </p>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                  className="px-4 py-2 rounded-full bg-red-500/80 text-white text-sm font-semibold hover:bg-red-500 transition disabled:opacity-50"
                >
                  {deleting ? "Deleting…" : "Yes, delete everything"}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-4 py-2 rounded-full border border-ember-700 text-amber-50/70 text-sm hover:border-amber-glow/40 transition"
                >
                  Cancel
                </button>
              </div>
              {error && <p className="text-red-300 text-xs mt-3">{error}</p>}
            </div>
          )}
        </section>
      </div>
    </CitizenShell>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <div className="text-2xl font-semibold text-amber-soft">{n}</div>
      <div className="text-amber-50/50 text-xs uppercase tracking-widest mt-1">{label}</div>
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
