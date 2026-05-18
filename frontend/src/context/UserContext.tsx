import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, type UserOut } from "../lib/api";
import { clearSession, getUserId, getUserName, setSession } from "../lib/session";

type Ctx = {
  user: UserOut | null;
  ready: boolean;
  registerGuest: (name: string) => Promise<UserOut>;
  signOut: () => void;
};

const UserContext = createContext<Ctx>({
  user: null,
  ready: false,
  registerGuest: async () => {
    throw new Error("UserProvider missing");
  },
  signOut: () => {},
});

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserOut | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = getUserId();
      if (!id) {
        setReady(true);
        return;
      }
      try {
        // Re-resolve against the backend so a wiped DB doesn't leave us stuck.
        const u = await api.post<UserOut>("/api/auth/guest", {
          user_id: id,
          name: getUserName() ?? undefined,
        });
        if (!cancelled) {
          setSession(u.id, u.name);
          setUser(u);
        }
      } catch {
        if (!cancelled) clearSession();
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const registerGuest = useCallback(async (name: string) => {
    const loc = await getLocationOnce();
    const existingId = getUserId() ?? undefined;
    const u = await api.post<UserOut>("/api/auth/guest", {
      name,
      user_id: existingId,
      city: "Rotterdam",
      latitude: loc?.lat,
      longitude: loc?.lon,
    });
    setSession(u.id, u.name);
    setUser(u);
    return u;
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  return (
    <UserContext.Provider value={{ user, ready, registerGuest, signOut }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}

async function getLocationOnce(): Promise<{ lat: number; lon: number } | undefined> {
  if (!("geolocation" in navigator)) return undefined;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => resolve(undefined),
      { timeout: 1500 },
    );
  });
}
