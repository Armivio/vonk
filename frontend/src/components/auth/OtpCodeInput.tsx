import { useEffect, useRef, useState } from "react";

type Props = {
  length?: number;
  disabled?: boolean;
  onComplete: (code: string) => void;
};

/**
 * Six (or N) single-digit boxes that auto-advance on input, accept a paste,
 * and fire `onComplete` when all positions are filled.
 */
export function OtpCodeInput({ length = 6, disabled, onComplete }: Props) {
  const [digits, setDigits] = useState<string[]>(() => Array(length).fill(""));
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  function setAt(i: number, raw: string) {
    const ch = raw.replace(/\D/g, "").slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[i] = ch;
      if (ch && i < length - 1) {
        // advance focus
        setTimeout(() => refs.current[i + 1]?.focus(), 0);
      }
      const joined = next.join("");
      if (joined.length === length && next.every((d) => d !== "")) {
        onComplete(joined);
      }
      return next;
    });
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!text) return;
    e.preventDefault();
    const next = Array(length).fill("");
    for (let i = 0; i < text.length; i++) next[i] = text[i];
    setDigits(next);
    const focusIdx = Math.min(text.length, length - 1);
    setTimeout(() => refs.current[focusIdx]?.focus(), 0);
    if (text.length === length) onComplete(next.join(""));
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      e.preventDefault();
      refs.current[i - 1]?.focus();
      setDigits((prev) => {
        const next = [...prev];
        next[i - 1] = "";
        return next;
      });
    } else if (e.key === "ArrowLeft" && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < length - 1) {
      refs.current[i + 1]?.focus();
    }
  }

  return (
    <div className="flex gap-2" role="group" aria-label="Verification code">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          value={d}
          disabled={disabled}
          onChange={(e) => setAt(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          className="w-11 h-12 sm:w-12 sm:h-14 text-center text-xl font-semibold
                     bg-ember-900 text-amber-50 border border-ember-700 rounded-lg outline-none
                     focus:border-amber-glow/60 transition"
          aria-label={`Digit ${i + 1}`}
        />
      ))}
    </div>
  );
}
