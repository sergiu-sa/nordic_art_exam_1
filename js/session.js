// Single owner of the auth credentials in sessionStorage. Kept separate from
// api.js (reads) and auth.js (writes) so the two don't form a circular import.

const ACCESS_TOKEN_KEY = "naa.accessToken";
const API_KEY_KEY = "naa.apiKey";
const NAME_KEY = "naa.userName";

export function getToken() {
  return sessionStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getApiKey() {
  return sessionStorage.getItem(API_KEY_KEY);
}

export function getUserName() {
  return sessionStorage.getItem(NAME_KEY);
}

export function setSession({ accessToken, apiKey, name } = {}) {
  if (accessToken !== undefined) sessionStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  if (apiKey !== undefined) sessionStorage.setItem(API_KEY_KEY, apiKey);
  if (name !== undefined) sessionStorage.setItem(NAME_KEY, name);
}

export function clearSession() {
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(API_KEY_KEY);
  sessionStorage.removeItem(NAME_KEY);
}
