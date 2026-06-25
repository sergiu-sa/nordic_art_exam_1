// Single access layer for the Noroff Artworks API.

import { getToken, getApiKey } from "./session.js";

const API_BASE = "https://v2.api.noroff.dev";

export class ApiError extends Error {
  constructor(message, { status = 0, isNetwork = false, isAbort = false, details } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.isNetwork = isNetwork;
    this.isAbort = isAbort;
    this.details = details;
  }
}

// Authed requests need BOTH headers; missing either is the most common Noroff 401. Throw before fetching so it surfaces here, not as a mystery 401.
function authHeaders() {
  const token = getToken();
  const apiKey = getApiKey();
  if (!token || !apiKey) {
    throw new ApiError("Not authenticated — log in to continue.", { status: 401 });
  }
  return {
    Authorization: `Bearer ${token}`,
    "X-Noroff-API-Key": apiKey,
  };
}

export async function request(path, { method = "GET", body, auth = false, signal, headers } = {}) {
  const requestHeaders = {
    ...(body ? { "Content-Type": "application/json" } : {}),
    ...(auth ? authHeaders() : {}),
    ...headers,
  };

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new ApiError("Request cancelled.", { isAbort: true });
    }
    throw new ApiError("Network error — check your connection and try again.", {
      isNetwork: true,
    });
  }

  // No body to parse (DELETE returns 204).
  if (response.status === 204) {
    return null;
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    // || not ??: an empty errors[] message or a blank statusText (HTTP/2 has no reason phrase) must still fall through to a usable message.
    const message = payload?.errors?.[0]?.message || response.statusText || "Request failed.";
    throw new ApiError(message, { status: response.status, details: payload?.errors });
  }

  return payload;
}

// Envelope rule: lists return { data, meta }; single items return the item;
// deletes return null. id always goes in the path.

export async function getArtworks({ page, limit, sort, sortOrder, signal } = {}) {
  const params = new URLSearchParams();
  if (page !== undefined) params.set("page", page);
  if (limit !== undefined) params.set("limit", limit);
  if (sort !== undefined) params.set("sort", sort);
  if (sortOrder !== undefined) params.set("sortOrder", sortOrder);
  const query = params.toString();
  const result = await request(`/artworks${query ? `?${query}` : ""}`, { signal });
  return { data: result?.data ?? [], meta: result?.meta ?? {} };
}

export async function getArtwork(id, { signal } = {}) {
  const result = await request(`/artworks/${id}`, { signal });
  return result?.data ?? null;
}

export async function createArtwork(fields) {
  const result = await request("/artworks", { method: "POST", body: fields, auth: true });
  return result?.data ?? null;
}

export async function updateArtwork(id, fields) {
  const result = await request(`/artworks/${id}`, { method: "PUT", body: fields, auth: true });
  return result?.data ?? null;
}

export async function deleteArtwork(id) {
  await request(`/artworks/${id}`, { method: "DELETE", auth: true });
  return null;
}

// ---- auth endpoints ----
// register returns no token;
// login returns data.accessToken;
// create-api-key needs ONLY th bearer token (no X-Noroff-API-Key yet), so the token is passed in and set via the headers merge — authHeaders() (both-headers) is left untouched and login can stay atomic.

export async function authRegister({ name, email, password }) {
  const result = await request("/auth/register", {
    method: "POST",
    body: { name, email, password },
  });
  return result?.data ?? null;
}

export async function authLogin({ email, password }) {
  const result = await request("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  return result?.data ?? null;
}

export async function authCreateApiKey(token, { name } = {}) {
  const result = await request("/auth/create-api-key", {
    method: "POST",
    body: name ? { name } : undefined,
    headers: { Authorization: `Bearer ${token}` },
  });
  return result?.data ?? null;
}
