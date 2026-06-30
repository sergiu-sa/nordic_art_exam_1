// The auth verbs and the login bootstrap.
// No DOM here — the chrome wiring lives in nav.js, the ownership check in pages/artwork.js.
// Storage is owned by session.js; endpoints by api.js.

import { ApiError, authRegister, authLogin, authCreateApiKey } from "./api.js";
import { setSession, clearSession, getToken, getApiKey } from "./session.js";

const API_KEY_LABEL = "nordic-art-archive";

// register does NOT log in — the Noroff register endpoint returns no token.
export async function register({ name, email, password }) {
  return authRegister({ name, email: email.trim().toLowerCase(), password });
}

// the three-step bootstrap, committed atomically: login → create-api-key → store.
// A token without an api key is the most common Noroff 401, so the session lands only if both succeed.
export async function login({ email, password }) {
  const profile = await authLogin({ email: email.trim().toLowerCase(), password });
  const accessToken = profile?.accessToken;
  if (!accessToken) {
    throw new ApiError("Login did not return a token.", { status: 0 });
  }
  const created = await authCreateApiKey(accessToken, { name: API_KEY_LABEL });
  const apiKey = created?.key;
  if (!apiKey) {
    throw new ApiError("Could not create an API key.", { status: 0 });
  }
  setSession({ accessToken, apiKey, name: profile.name });
  return { name: profile.name, email: profile.email };
}

export function logout() {
  clearSession();
}

export function isLoggedIn() {
  return Boolean(getToken() && getApiKey());
}

// The redirect guard for create/edit (default path is correct for pages under artwork/).
// Uses .replace, not .href, so a bounced visitor pressing Back doesn't land back on the guarded page and get re-bounced into a loop.
// The edit hop passes an id to resume to it.
export function requireAuth({ from, id, loginPath = "../account/login.html" } = {}) {
  if (isLoggedIn()) return true;
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (id) params.set("id", id);
  const query = params.toString();
  window.location.replace(query ? `${loginPath}?${query}` : loginPath);
  return false;
}
