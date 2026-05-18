export async function shareVonk(opts: {
  id: string;
  title: string;
}): Promise<"shared" | "copied" | "failed"> {
  const url = `${window.location.origin}/vonk/${opts.id}`;
  const data: ShareData = {
    title: opts.title,
    text: `Join this Vonk: ${opts.title}`,
    url,
  };
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share(data);
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "failed";
      // fall through to clipboard
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
