const CLIENT_KEY = "vonk_client_id";
const USER_KEY = "vonk_user_id";

export function getOrCreateClientId(): string {
  let id = localStorage.getItem(CLIENT_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(CLIENT_KEY, id);
  }
  return id;
}

export function setUserId(id: string) {
  localStorage.setItem(USER_KEY, id);
}

export function getUserId(): string | null {
  return localStorage.getItem(USER_KEY);
}

export function clearSession() {
  localStorage.removeItem(CLIENT_KEY);
  localStorage.removeItem(USER_KEY);
}
