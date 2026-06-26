// Single access layer for the Noroff Artworks API.

import { getToken, getApiKey } from "./session.js";

const API_BASE = "https://v2.api.noroff.dev";

const ALL_ARTWORKS_DEFAULT_PAGE_SIZE = 12;
const ALL_ARTWORKS_MAX_PAGES = 10; // runaway guard, used only until a page succeeds and pageCount is known

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

// The live API's server-side sort and large limits 500, and one poisoned record can crash any page window that includes it.
// So walk the pool in small unsorted pages, retry-then-skip a failing page, dedupe by id, and stop at the last page.
// Sorting is the caller's job (the server can't).
// Throws only when no page succeeds, so the feed can show its error state (not the empty state).
// Composing getArtworks keeps endpoint knowledge in one place; the collection page reuses it.
export async function getAllArtworks({ pageSize = ALL_ARTWORKS_DEFAULT_PAGE_SIZE, signal } = {}) {
  const seen = new Set();
  const data = [];
  let firstGoodMeta = null;
  let lastPage = null;
  let succeeded = 0;
  let lastFailure = null;

  for (let page = 1; page <= (lastPage ?? ALL_ARTWORKS_MAX_PAGES); page += 1) {
    let result;
    try {
      result = await fetchPageWithRetry({ page, limit: pageSize, signal });
    } catch (error) {
      if (error?.isAbort) throw error; // an abort/timeout ends the whole walk at once
      lastFailure = error; // a poisoned page: remember it, skip, keep walking
      continue;
    }

    succeeded += 1;
    if (!firstGoodMeta) firstGoodMeta = result.meta;
    if (result.meta?.pageCount) lastPage = result.meta.pageCount;

    for (const work of result.data) {
      const id = work?.id;
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      data.push(work);
    }

    if (result.meta?.isLastPage) break;
    if (!result.data.length) break; // an empty page means we walked past the end
  }

  if (succeeded === 0) {
    throw lastFailure ?? new ApiError("The archive is unavailable right now.", { status: 503 });
  }
  return { data, meta: firstGoodMeta ?? {} };
}

// One immediate retry absorbs a transient blip; a deterministic 500 fails the retry too and bubbles up to be skipped.
// An abort is never retried.
async function fetchPageWithRetry({ page, limit, signal }) {
  try {
    return await getArtworks({ page, limit, signal });
  } catch (error) {
    if (error?.isAbort) throw error;
    return await getArtworks({ page, limit, signal });
  }
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
