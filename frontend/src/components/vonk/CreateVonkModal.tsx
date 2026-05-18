import { useEffect, useState } from "react";
import { api, type GloedOut, type VonkOut } from "../../lib/api";

type Prefill = Partial<{
  title: string;
  description: string;
  category: string;
  location_name: string;
}>;

const CATEGORIES = ["social", "active", "creative", "learning", "quiet", "food"];
const ROTTERDAM: [number, number] = [51.9225, 4.4792];

export function CreateVonkModal({
  open,
  onClose,
  onCreated,
  prefill,
  fromGloed,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (v: VonkOut) => void;
  prefill?: Prefill;
  fromGloed?: GloedOut | null;
}) {
  const [title, setTitle] = useState(prefill?.title ?? "");
  const [description, setDescription] = useState(prefill?.description ?? "");
  const [category, setCategory] = useState(prefill?.category ?? fromGloed?.category ?? "social");
  const [locationName, setLocationName] = useState(prefill?.location_name ?? "");
  const [scheduled, setScheduled] = useState(defaultDateTime());
  const [maxParticipants, setMaxParticipants] = useState(6);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiSuggesting, setAiSuggesting] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(prefill?.title ?? "");
      setDescription(prefill?.description ?? "");
      setCategory(prefill?.category ?? fromGloed?.category ?? "social");
      setLocationName(prefill?.location_name ?? "");
      setScheduled(defaultDateTime());
      setError(null);
    }
  }, [open, prefill, fromGloed]);

  async function aiPrefill() {
    if (!fromGloed) return;
    setAiSuggesting(true);
    setError(null);
    try {
      const s = await api.post<{
        title: string;
        description: string;
        category: string;
        location_name: string;
        when_relative: string;
        why_it_works: string;
      }>("/api/match/suggest-vonk", { gloed_ids: [fromGloed.id] });
      setTitle(s.title);
      setDescription(`${s.description}\n\nWhy it works: ${s.why_it_works}`);
      setCategory(s.category);
      setLocationName(s.location_name);
    } catch (e) {
      setError(`AI suggestion failed: ${e}`);
    } finally {
      setAiSuggesting(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Give your vonk a title");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const [lat, lon] = fromGloed?.latitude && fromGloed?.longitude
        ? [fromGloed.latitude, fromGloed.longitude]
        : ROTTERDAM;
      const created = await api.post<VonkOut>("/api/vonk", {
        title: title.trim(),
        description: description.trim() || null,
        category,
        location_name: locationName.trim() || null,
        latitude: lat,
        longitude: lon,
        scheduled_at: new Date(scheduled).toISOString(),
        max_participants: maxParticipants,
      });
      onCreated(created);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="ember-card p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-ember">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-amber-glow text-xs uppercase tracking-widest mb-1">
              Light a new vonk
            </div>
            <h2 className="text-2xl font-semibold text-amber-soft">A small gathering</h2>
          </div>
          <button
            onClick={onClose}
            className="text-amber-50/40 hover:text-amber-soft text-2xl leading-none px-2"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {fromGloed && (
          <button
            onClick={aiPrefill}
            disabled={aiSuggesting}
            className="ember-button-ghost w-full justify-center mb-4 text-sm"
          >
            {aiSuggesting ? "AI is thinking…" : "✨ Let AI design one from your gloed"}
          </button>
        )}

        <form onSubmit={submit} className="space-y-3">
          <Field label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Sketching evening at Hopper"
              className={inputClass}
              autoFocus
              required
            />
          </Field>

          <Field label="Description" optional>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What will you do? What's the vibe?"
              rows={3}
              className={inputClass + " resize-none"}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={inputClass + " capitalize"}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Max people">
              <input
                type="number"
                min={2}
                max={20}
                value={maxParticipants}
                onChange={(e) => setMaxParticipants(parseInt(e.target.value, 10) || 6)}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Location">
            <input
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              placeholder="e.g. Café De Ooievaar, Witte de Withstraat"
              className={inputClass}
            />
          </Field>

          <Field label="When">
            <input
              type="datetime-local"
              value={scheduled}
              onChange={(e) => setScheduled(e.target.value)}
              className={inputClass}
              required
            />
          </Field>

          {error && <p className="text-amber-glow text-sm">{error}</p>}

          <button type="submit" disabled={submitting} className="ember-button w-full justify-center mt-2">
            {submitting ? "Lighting…" : "Light this Vonk 🔥"}
          </button>
        </form>
      </div>
    </div>
  );
}

const inputClass =
  "w-full bg-ember-900 text-amber-50 placeholder:text-amber-50/30 " +
  "border border-ember-700 rounded-lg px-3 py-2 outline-none " +
  "focus:border-amber-glow/60 transition text-sm";

function Field({
  label,
  optional,
  children,
}: {
  label: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-amber-50/60 text-xs uppercase tracking-widest mb-1 inline-block">
        {label}
        {optional && <span className="text-amber-50/30 normal-case ml-1">(optional)</span>}
      </span>
      {children}
    </label>
  );
}

function defaultDateTime(): string {
  // Local datetime-local string: YYYY-MM-DDTHH:MM, default = now + 2h, rounded to 30min.
  const d = new Date(Date.now() + 2 * 60 * 60 * 1000);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 0, 0, 0);
  if (d.getMinutes() === 0 && Date.now() > d.getTime() - 60_000) d.setHours(d.getHours() + 1);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
