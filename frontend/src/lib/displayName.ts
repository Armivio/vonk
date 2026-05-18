export function displayName(full: string | null | undefined): string {
  if (!full) return "Vriend";
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Vriend";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}
