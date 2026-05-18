const USER_KEY = "vonk_user_id";
const NAME_KEY = "vonk_user_name";

export function setSession(userId: string, name: string) {
  localStorage.setItem(USER_KEY, userId);
  localStorage.setItem(NAME_KEY, name);
}

export function getUserId(): string | null {
  return localStorage.getItem(USER_KEY);
}

export function getUserName(): string | null {
  return localStorage.getItem(NAME_KEY);
}

export function clearSession() {
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(NAME_KEY);
  localStorage.removeItem("vonk_latest_gloed");
}
