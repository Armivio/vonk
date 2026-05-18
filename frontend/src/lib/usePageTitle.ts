import { useEffect } from "react";

const BASE = "Vonk — Find your fire";

export function usePageTitle(title?: string | null) {
  useEffect(() => {
    document.title = title ? `${title} · Vonk` : BASE;
    return () => {
      document.title = BASE;
    };
  }, [title]);
}
