const CATEGORY_IMAGES: Record<string, string[]> = {
  social: [
    "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=640&fit=crop",
    "https://images.unsplash.com/photo-1543807535-eceef0bc6599?w=640&fit=crop",
    "https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=640&fit=crop",
  ],
  active: [
    "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=640&fit=crop",
    "https://images.unsplash.com/photo-1486218119243-13883505764c?w=640&fit=crop",
    "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=640&fit=crop",
  ],
  creative: [
    "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=640&fit=crop",
    "https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=640&fit=crop",
    "https://images.unsplash.com/photo-1452860606245-08f8b0d2e5f0?w=640&fit=crop",
  ],
  learning: [
    "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=640&fit=crop",
    "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=640&fit=crop",
    "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=640&fit=crop",
  ],
  quiet: [
    "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=640&fit=crop",
    "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=640&fit=crop",
    "https://images.unsplash.com/photo-1476673160081-cf065607f449?w=640&fit=crop",
  ],
  food: [
    "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=640&fit=crop",
    "https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=640&fit=crop",
    "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=640&fit=crop",
  ],
};

const FALLBACK = "https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=640&fit=crop";

/**
 * Pick a deterministic image for a vonk based on its category + id.
 * Same vonk always gets the same picture.
 */
export function imageForVonk(category: string | null | undefined, id: string): string {
  const pool = CATEGORY_IMAGES[category ?? ""] ?? null;
  if (!pool || pool.length === 0) return FALLBACK;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return pool[Math.abs(h) % pool.length];
}

export { CATEGORY_IMAGES };
