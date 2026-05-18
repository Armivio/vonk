import { useEffect, useRef, useState } from "react";
import { api, type GloedDiscoverResponse, type GloedOut } from "../../lib/api";

type Msg = { role: "user" | "assistant"; text: string };

const OPENERS = [
  "What would make today a little better?",
  "How are you feeling about tonight?",
  "What sort of evening are you in the mood for?",
];

export function ChatPanel({ onGloedReady }: { onGloedReady: (g: GloedOut) => void }) {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", text: OPENERS[Math.floor(Math.random() * OPENERS.length)] },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [done, setDone] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function send() {
    const text = input.trim();
    if (!text || sending || done) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    setSending(true);
    try {
      const location = await getLocation();
      const res = await api.post<GloedDiscoverResponse>("/api/gloed/ai-discover", {
        session_id: sessionId,
        message: text,
        location,
      });
      setSessionId(res.session_id);
      setMessages((m) => [...m, { role: "assistant", text: res.assistant_message }]);
      if (res.done && res.gloed) {
        setDone(true);
        onGloedReady(res.gloed);
      }
    } catch (err) {
      console.error(err);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text:
            "Something flickered out. The connection assistant isn't reachable right now — make sure ANTHROPIC_API_KEY is set.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="ember-card p-6 flex flex-col h-[70vh] max-h-[640px]">
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pr-2">
        {messages.map((m, i) => (
          <Bubble key={i} role={m.role} text={m.text} />
        ))}
        {sending && <Bubble role="assistant" text="…" />}
      </div>
      <div className="mt-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={done ? "Your gloed is live." : "Type whatever's on your mind…"}
          disabled={done || sending}
          className="flex-1 bg-ember-900 text-amber-50 placeholder:text-amber-50/30
                     border border-ember-700 rounded-full px-5 py-3 outline-none
                     focus:border-amber-glow/60 transition"
        />
        <button onClick={() => void send()} disabled={done || sending} className="ember-button">
          {sending ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}

function Bubble({ role, text }: { role: "user" | "assistant"; text: string }) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="bg-amber-glow text-ember-950 px-4 py-2 rounded-2xl rounded-tr-sm max-w-[80%]">
          {text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full bg-amber-glow/20 flex items-center justify-center text-lg shrink-0">
        🔥
      </div>
      <div className="bg-ember-700/60 text-amber-50/90 px-4 py-2 rounded-2xl rounded-tl-sm max-w-[80%]">
        {text}
      </div>
    </div>
  );
}

async function getLocation(): Promise<{ lat: number; lon: number } | undefined> {
  if (!("geolocation" in navigator)) return undefined;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(undefined),
      { timeout: 1500 },
    );
  });
}
