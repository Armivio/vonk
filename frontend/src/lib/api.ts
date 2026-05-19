import { getUserId } from "./session";

const API_BASE = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:8003`;

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const uid = getUserId();
  if (uid) headers.set("X-User-Id", uid);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
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
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

// ---------- Typed shapes ----------

export type UserPreferences = {
  interests: string[];
  social_style: "one_on_one" | "small_groups" | "any_size";
  energy_baseline: "low" | "balanced" | "high";
  typical_when: "weekday_evenings" | "weekends" | "spontaneous";
  comfort_radius_km: 2 | 5 | 12;
  language: "en" | "nl";
  notes?: string;
};

export type UserOut = {
  id: string;
  name: string;
  last_name?: string | null;
  channel: string;
  city?: string | null;
  neighborhood?: string | null;
  email?: string | null;
  phone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  preferences?: UserPreferences | null;
  /** Derived server-side: true once the user has completed the vibe-checker chat. */
  has_preferences?: boolean;
};

export type SignupProfile = {
  first_name: string;
  last_name?: string;
  city?: string;
  neighborhood?: string;
  email?: string;
  phone?: string;
};

export type OnboardingChatResponse = {
  session_id: string;
  assistant_message: string;
  done: boolean;
  preferences?: UserPreferences | null;
  gloed?: GloedOut | null;
  auto_subscribed?: AutoSubscribedVonk | null;
  alternatives?: AutoSubscribeAlternative[];
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

export type AutoSubscribedVonk = {
  vonk_id: string;
  title: string;
  location_name?: string | null;
  scheduled_at: string;
  spots_left: number;
  action: "joined" | "created_and_joined";
};

export type AutoSubscribeAlternative = {
  vonk_id: string;
  title: string;
  location_name?: string | null;
  scheduled_at: string;
};

export type GloedDiscoverResponse = {
  session_id: string;
  assistant_message: string;
  done: boolean;
  gloed?: GloedOut | null;
  auto_subscribed?: AutoSubscribedVonk | null;
  alternatives?: AutoSubscribeAlternative[];
};

export type VonkOut = {
  id: string;
  creator_id?: string | null;
  creator_name?: string | null;
  creator_last_name?: string | null;
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
  is_full: boolean;
  joined: boolean;
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

export type RecentVonk = {
  id: string;
  title: string;
  category?: string | null;
  location_name?: string | null;
  created_at: string;
  scheduled_at: string;
  participants_count: number;
};

export type DashboardMetrics = {
  city: string;
  vonken_this_week: number;
  active_vonken: number;
  unique_participants: number;
  vuuren_formed: number;
  cross_age_vonken: number;
  avg_time_to_first_vonk_days: number | null;
  active_gloeds: number;
  recent_vonken: RecentVonk[];
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
