import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../../lib/api";
import { VoiceInputButton } from "./VoiceInputButton";

type Msg = { role: "user" | "assistant"; text: string };

type BaseTurnResponse = {
  session_id: string;
  assistant_message: string;
  done: boolean;
};

type Props<T extends BaseTurnResponse> = {
  endpoint: string;
  opener: string;
  placeholder?: string;
  donePlaceholder?: string;
  doneHint?: string;
  voiceLang?: string;
  withLocation?: boolean;
  onDone: (response: T) => void;
  renderDoneAttachment?: (response: T) => ReactNode;
};

export function ChatPanel<T extends BaseTurnResponse>({
  endpoint,
  opener,
  placeholder = "Type whatever's on your mind…",
  donePlaceholder = "All set.",
  doneHint,
  voiceLang,
  withLocation,
  onDone,
  renderDoneAttachment,
}: Props<T>) {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", text: opener },
  ]);
  const [doneResponse, setDoneResponse] = useState<T | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [done, setDone] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  // Re-focus the input once the assistant's turn lands (sending flips false) so the user can keep typing.
  useEffect(() => {
    if (!sending && !done) inputRef.current?.focus();
  }, [sending, done]);

  async function send() {
    const text = input.trim();
    if (!text || sending || done) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    setSending(true);
    try {
      const location = withLocation ? await getLocation() : undefined;
      const res = await api.post<T>(endpoint, {
        session_id: sessionId,
        message: text,
        location,
      });
      setSessionId(res.session_id);
      setMessages((m) => [...m, { role: "assistant", text: res.assistant_message }]);
      if (res.done) {
        setDone(true);
        setDoneResponse(res);
        onDone(res);
      }
    } catch (err) {
      console.error(err);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text:
            "Something flickered out on my end — give it another try?",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="ember-card p-4 sm:p-6 flex flex-col h-[70vh] max-h-[640px]">
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pr-2">
        {messages.map((m, i) => (
          <Bubble key={i} role={m.role} text={m.text} />
        ))}
        {sending && <TypingBubble />}
        {done && doneResponse && renderDoneAttachment && (
          <div className="pl-11">{renderDoneAttachment(doneResponse)}</div>
        )}
        {done && doneHint && (
          <div className="flex items-center gap-2 pt-2 pl-11 text-amber-glow/80 text-xs uppercase tracking-widest animate-pulse">
            <span>{doneHint}</span>
          </div>
        )}
      </div>
      <div className="mt-4 flex gap-2 items-center sticky bottom-0 bg-ember-800/70 backdrop-blur-sm pt-2 -mx-4 sm:-mx-6 px-4 sm:px-6 pb-1">
        <VoiceInputButton
          disabled={done || sending}
          lang={voiceLang}
          onTranscript={(t) => setInput((cur) => (cur ? cur + " " + t : t))}
        />
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={done ? donePlaceholder : placeholder}
          disabled={done || sending}
          autoFocus
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
        <div className="bg-amber-glow text-ember-950 px-4 py-2 rounded-2xl rounded-tr-sm max-w-[85%]">
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
      <div className="bg-ember-700/60 text-amber-50/90 px-4 py-2 rounded-2xl rounded-tl-sm max-w-[85%] whitespace-pre-wrap">
        {renderInlineBold(text)}
      </div>
    </div>
  );
}

function renderInlineBold(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(<strong key={i++} className="text-amber-soft">{m[1]}</strong>);
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function TypingBubble() {
  return (
    <div className="flex gap-3" aria-label="Vonk is thinking">
      <div className="w-8 h-8 rounded-full bg-amber-glow/20 flex items-center justify-center text-lg shrink-0">
        🔥
      </div>
      <div className="bg-ember-700/60 px-4 py-3 rounded-2xl rounded-tl-sm">
        <div className="flex gap-1 items-center">
          <span className="vonk-typing-dot" />
          <span className="vonk-typing-dot vonk-typing-dot--2" />
          <span className="vonk-typing-dot vonk-typing-dot--3" />
        </div>
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
