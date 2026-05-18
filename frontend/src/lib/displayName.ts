type NameLike = { name?: string | null; last_name?: string | null } | string | null | undefined;

export function displayName(input: NameLike): string {
  if (!input) return "Vriend";
  if (typeof input === "string") return formatFromString(input);
  const first = (input.name ?? "").trim();
  const last = (input.last_name ?? "").trim();
  if (first && last) return `${first} ${last[0].toUpperCase()}.`;
  if (first) return formatFromString(first);
  return "Vriend";
}

function formatFromString(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Vriend";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}
