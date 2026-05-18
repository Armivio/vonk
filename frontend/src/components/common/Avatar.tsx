const COLORS = ["#f97316", "#22c55e", "#3b82f6", "#a855f7", "#ef4444", "#eab308"];

function colorFor(name: string): string {
  if (!name) return COLORS[0];
  return COLORS[name.charCodeAt(0) % COLORS.length];
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const safe = name?.trim() || "?";
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: colorFor(safe),
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "white",
        fontWeight: 600,
        fontSize: Math.round(size * 0.42),
        flexShrink: 0,
      }}
    >
      {safe.charAt(0).toUpperCase()}
    </span>
  );
}
