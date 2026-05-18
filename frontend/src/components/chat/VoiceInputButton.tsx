import { useEffect, useRef, useState } from "react";

type Props = {
  disabled?: boolean;
  lang?: string;
  onTranscript: (text: string) => void;
};

function getRecognitionCtor(): { new (): SpeechRecognition } | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export function VoiceInputButton({ disabled, lang, onTranscript }: Props) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    setSupported(getRecognitionCtor() !== null);
    return () => {
      recRef.current?.abort();
      recRef.current = null;
    };
  }, []);

  if (!supported) return null;

  function start() {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = lang ?? navigator.language ?? "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const result = e.results[e.results.length - 1];
      if (result && result[0]?.transcript) {
        onTranscript(result[0].transcript.trim());
      }
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
    };
    recRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
      recRef.current = null;
    }
  }

  function stop() {
    recRef.current?.stop();
  }

  return (
    <button
      type="button"
      onClick={listening ? stop : start}
      disabled={disabled}
      aria-label={listening ? "Stop listening" : "Speak"}
      title={listening ? "Stop listening" : "Speak"}
      className={
        "w-12 h-12 rounded-full border flex items-center justify-center transition shrink-0 " +
        (listening
          ? "border-amber-glow bg-amber-glow/20 text-amber-glow animate-pulse"
          : "border-ember-700 text-amber-50/70 hover:border-amber-glow/60 hover:text-amber-soft")
      }
    >
      {listening ? "●" : "🎙"}
    </button>
  );
}
