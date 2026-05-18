import { getUserId } from "./session";

const BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const uid = getUserId();
  if (uid) headers.set("X-User-Id", uid);

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    let detail: unknown = res.statusText;
    try {
      detail = await res.json();
    } catch {
      /* swallow */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export class ApiError extends Error {
  constructor(public status: number, public detail: unknown) {
    super(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

// ---------- Typed shapes ----------

export type UserOut = {
  id: string;
  name: string;
  channel: string;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type GloedOut = {
  id: string;
  user_id?: string | null;
  raw_input: string;
  ai_parsed?: string | null;
  category?: string | null;
  energy_level?: string | null;
  group_size_pref?: string | null;
  time_preference?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  radius_km: number;
  active: boolean;
  created_at: string;
};

export type GloedDiscoverResponse = {
  session_id: string;
  assistant_message: string;
  done: boolean;
  gloed?: GloedOut | null;
};

export type VonkOut = {
  id: string;
  creator_id?: string | null;
  title: string;
  description?: string | null;
  category?: string | null;
  location_name?: string | null;
  latitude: number;
  longitude: number;
  scheduled_at: string;
  max_participants: number;
  status: string;
  participants_count: number;
  distance_km?: number | null;
};

export type MatchOut = {
  type: "gloed" | "vonk";
  id: string;
  score: number;
  reason: string;
  suggested_activity: string;
  distance_km?: number | null;
  preview: {
    title?: string | null;
    description?: string | null;
    category?: string | null;
    when?: string | null;
    location_name?: string | null;
  };
};

export type DashboardMetrics = {
  city: string;
  vonken_this_week: number;
  unique_participants: number;
  vuuren_formed: number;
  cross_age_vonken: number;
  avg_time_to_first_vonk_days: number | null;
  active_gloeds: number;
};

export type TrendPoint = {
  date: string;
  vonken_count: number;
  unique_participants: number;
};

export type SuggestedVonk = {
  title: string;
  description: string;
  category: string;
  location_name: string;
  when_relative: string;
  why_it_works: string;
};
