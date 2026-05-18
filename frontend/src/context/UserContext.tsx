import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type UserOut } from "../lib/api";
import { getOrCreateClientId, setUserId } from "../lib/session";

type State = {
  user: UserOut | null;
  ready: boolean;
};

const UserContext = createContext<State>({ user: null, ready: false });

export function UserProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ user: null, ready: false });

  useEffect(() => {
    const clientId = getOrCreateClientId();
    api
      .post<UserOut>("/api/auth/anonymous", { client_id: clientId })
      .then((u) => {
        setUserId(u.id);
        setState({ user: u, ready: true });
      })
      .catch((err) => {
        console.error("anonymous login failed", err);
        setState({ user: null, ready: true });
      });
  }, []);

  return <UserContext.Provider value={state}>{children}</UserContext.Provider>;
}

export function useUser() {
  return useContext(UserContext);
}
