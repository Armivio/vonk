import { useEffect, useRef, useState } from "react";
import { LocationPickerMap } from "../map/LocationPickerMap";
import { api, type GloedOut, type VonkOut } from "../../lib/api";

type Prefill = Partial<{
  title: string;
  description: string;
  category: string;
  location_name: string;
  latitude: number;
  longitude: number;
  scheduled_at: string;
  max_participants: number;
}>;

const CATEGORIES = ["social", "active", "creative", "learning", "quiet", "food"];

export function CreateVonkModal({
  open,
  onClose,
  onCreated,
  prefill,
  fromGloed,
  editingId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (v: VonkOut) => void;
  prefill?: Prefill;
  fromGloed?: GloedOut | null;
  editingId?: string;
}) {
  const [title, setTitle] = useState(prefill?.title ?? "");
  const [description, setDescription] = useState(prefill?.description ?? "");
  const [category, setCategory] = useState(prefill?.category ?? fromGloed?.category ?? "social");
  const [locationName, setLocationName] = useState(prefill?.location_name ?? "");
  const [scheduled, setScheduled] = useState(prefill?.scheduled_at ?? defaultDateTime());
  const [maxParticipants, setMaxParticipants] = useState(prefill?.max_participants ?? 6);
  const [pickedLatLon, setPickedLatLon] = useState<[number, number] | null>(
    prefill?.latitude && prefill?.longitude ? [prefill.latitude, prefill.longitude] : null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiSuggesting, setAiSuggesting] = useState(false);
  // Track which element the mouse went down on so a drag that started inside
  // the modal (e.g. selecting text) but ended on the backdrop doesn't close it.
  const mouseDownTargetRef = useRef<EventTarget | null>(null);

  useEffect(() => {
    if (open) {
      setTitle(prefill?.title ?? "");
      setDescription(prefill?.description ?? "");
      setCategory(prefill?.category ?? fromGloed?.category ?? "social");
      setLocationName(prefill?.location_name ?? "");
      setScheduled(prefill?.scheduled_at ?? defaultDateTime());
      setMaxParticipants(prefill?.max_participants ?? 6);
      setPickedLatLon(
        prefill?.latitude && prefill?.longitude ? [prefill.latitude, prefill.longitude] : null,
      );
      setError(null);
    }
  }, [open, prefill, fromGloed]);

  async function handleMapPick(latlon: [number, number]) {
    setPickedLatLon(latlon);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${latlon[0]}&lon=${latlon[1]}&format=json&zoom=18`,
        { headers: { "Accept-Language": "en" } },
      );
      if (!res.ok) return;
      const data = await res.json();
      const a = data.address ?? {};
      const candidate =
        a.amenity || a.shop || a.leisure || a.tourism || a.building || a.road || a.neighbourhood || a.suburb;
      if (candidate && !locationName.trim()) {
        const detail = a.road && candidate !== a.road ? `${candidate}, ${a.road}` : candidate;
        setLocationName(detail);
      }
    } catch {
      /* ignore */
    }
  }

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
    if (!pickedLatLon) {
      setError("Drop a pin on the map so people know where to come.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const [lat, lon] = pickedLatLon;
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        category,
        location_name: locationName.trim() || null,
        latitude: lat,
        longitude: lon,
        scheduled_at: new Date(scheduled).toISOString(),
        max_participants: maxParticipants,
      };
      const result = editingId
        ? await api.patch<VonkOut>(`/api/vonk/${editingId}`, payload)
        : await api.post<VonkOut>("/api/vonk", payload);
      onCreated(result);
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
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-stretch sm:items-center justify-center sm:p-4"
      onMouseDown={(e) => {
        mouseDownTargetRef.current = e.target;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && mouseDownTargetRef.current === e.currentTarget) {
          onClose();
        }
        mouseDownTargetRef.current = null;
      }}
    >
      <div className="ember-card p-4 sm:p-6 max-w-lg w-full h-full sm:h-auto sm:max-h-[90vh] overflow-y-auto shadow-ember rounded-none sm:rounded-2xl">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-amber-glow text-xs uppercase tracking-widest mb-1">
              {editingId ? "Edit vonk" : "A small gathering"}
            </div>
            <h2 className="text-2xl font-semibold text-amber-soft">
              {editingId ? "Update the details" : "Light a new Vonk 🔥"}
            </h2>
            {!editingId && (
              <p className="text-amber-50/60 text-sm mt-1">
                A name, a place, a time. Two to six people. That's all it takes.
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-amber-50/40 hover:text-amber-soft text-2xl leading-none px-2"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {fromGloed && !editingId && (
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
                value={maxParticipants}
                onChange={(e) => setMaxParticipants(Math.max(2, parseInt(e.target.value, 10) || 6))}
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
            <div className="mt-2">
              <LocationPickerMap value={pickedLatLon} onChange={(p) => void handleMapPick(p)} />
              <p className="text-amber-50/40 text-[11px] mt-1">
                Tap the map to drop a pin. {pickedLatLon ? "Pin set ✓" : "Required — tap to set the venue."}
              </p>
            </div>
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
            {submitting
              ? editingId
                ? "Saving…"
                : "Lighting…"
              : editingId
              ? "Save changes"
              : "Light this Vonk 🔥"}
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
  const d = new Date(Date.now() + 2 * 60 * 60 * 1000);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 0, 0, 0);
  if (d.getMinutes() === 0 && Date.now() > d.getTime() - 60_000) d.setHours(d.getHours() + 1);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
