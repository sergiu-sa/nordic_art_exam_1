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

// the redirect guard for create/edit (wired in issue 29).
// Default path is correct for pages under artwork/ (create.html, edit.html).
export function requireAuth({ from, loginPath = "../account/login.html" } = {}) {
  if (isLoggedIn()) return true;
  const url = from ? `${loginPath}?from=${encodeURIComponent(from)}` : loginPath;
  window.location.href = url;
  return false;
}
