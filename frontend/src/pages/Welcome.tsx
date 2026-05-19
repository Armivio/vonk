import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../context/UserContext";

/**
 * Pass-through route. We keep /welcome so old bookmarks / share links don't
 * 404, but now the real routing decision happens here: first-timers → /find
 * (vibe checker), returning users → /discover.
 */
export default function Welcome() {
  const { user, ready } = useUser();
  const navigate = useNavigate();

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      navigate("/", { replace: true });
      return;
    }
    navigate(user.has_preferences ? "/discover" : "/find", { replace: true });
  }, [ready, user, navigate]);

  return null;
}
