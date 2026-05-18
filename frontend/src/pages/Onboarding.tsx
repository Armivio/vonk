import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChatPanel } from "../components/chat/ChatPanel";
import { CitizenShell } from "../components/common/Layout";
import { useUser } from "../context/UserContext";
import { type GloedOut } from "../lib/api";

export default function Onboarding() {
  const { user, ready } = useUser();
  const navigate = useNavigate();
  const [gloed, setGloed] = useState<GloedOut | null>(null);

  useEffect(() => {
    if (ready && !user) navigate("/", { replace: true });
  }, [ready, user, navigate]);

  function rememberGloed(g: GloedOut) {
    setGloed(g);
    localStorage.setItem("vonk_latest_gloed", JSON.stringify(g));
  }

  return (
    <CitizenShell>
      <div className="grid md:grid-cols-[1.4fr_1fr] gap-6 pt-6">
        <div>
          <h1 className="text-3xl font-semibold text-amber-soft mb-2">
            What would make today a little better?
          </h1>
          <p className="text-amber-50/60 mb-6 text-sm">
            Tell the assistant in your own words. No forms, no checkboxes — it just listens.
          </p>
          <ChatPanel onGloedReady={rememberGloed} />
        </div>
        <aside className="space-y-4">
          {gloed ? (
            <div className="ember-card p-6 shadow-ember">
              <div className="text-amber-glow text-xs uppercase tracking-widest mb-1">
                Your gloed is live
              </div>
              <p className="text-amber-50 text-lg leading-snug mb-4">{gloed.ai_parsed}</p>
              <dl className="grid grid-cols-2 gap-y-2 text-sm">
                <Tag label="Mood" value={gloed.category} />
                <Tag label="Energy" value={gloed.energy_level} />
                <Tag label="Group" value={gloed.group_size_pref?.replace("_", " ")} />
                <Tag label="When" value={gloed.time_preference?.replace("_", " ")} />
              </dl>
              <button
                onClick={() => navigate("/discover?from=onboarding")}
                className="ember-button w-full mt-6 justify-center"
              >
                Show me what's sparking nearby →
              </button>
            </div>
          ) : (
            <div className="ember-card p-6 text-amber-50/60 text-sm">
              <p className="mb-3">
                Your <span className="text-amber-soft">gloed</span> (your glow) will appear here
                once the assistant has enough to go on. Usually two or three short replies.
              </p>
              <p>It's private — only the matching brain sees the details.</p>
            </div>
          )}
        </aside>
      </div>
    </CitizenShell>
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
