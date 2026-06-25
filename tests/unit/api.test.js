import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// api.js reads credentials from session.js — mock it to control auth state.
vi.mock("../../js/session.js", () => ({
  getToken: vi.fn(),
  getApiKey: vi.fn(),
}));

import { request, ApiError } from "../../js/api.js";
import { getToken, getApiKey } from "../../js/session.js";
import {
  getArtworks,
  getArtwork,
  createArtwork,
  updateArtwork,
  deleteArtwork,
  authRegister,
  authLogin,
  authCreateApiKey,
} from "../../js/api.js";

const BASE = "https://v2.api.noroff.dev";

// Build a minimal fetch Response stand-in.
function fakeResponse(body, { status = 200, headers = {} } = {}) {
  const lower = {};
  for (const key of Object.keys(headers)) lower[key.toLowerCase()] = headers[key];
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `status ${status}`,
    headers: { get: (name) => lower[name.toLowerCase()] ?? null },
    json: async () => body,
  };
}

// Pull the headers object out of the most recent fetch call.
function lastHeaders() {
  return globalThis.fetch.mock.calls.at(-1)[1].headers;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  getToken.mockReset();
  getApiKey.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("request — reads", () => {
  it("issues a public GET with no auth headers and returns the envelope", async () => {
    fetch.mockResolvedValue(fakeResponse({ data: [{ id: "1" }], meta: { totalCount: 1 } }));

    const result = await request("/artworks");

    expect(fetch).toHaveBeenCalledWith(
      `${BASE}/artworks`,
      expect.objectContaining({ method: "GET" })
    );
    expect(lastHeaders().Authorization).toBeUndefined();
    expect(lastHeaders()["X-Noroff-API-Key"]).toBeUndefined();
    expect(result).toEqual({ data: [{ id: "1" }], meta: { totalCount: 1 } });
  });
});

describe("request — auth", () => {
  it("sends both auth headers, Content-Type, and a JSON body on an authed write", async () => {
    getToken.mockReturnValue("tok-123");
    getApiKey.mockReturnValue("key-abc");
    fetch.mockResolvedValue(fakeResponse({ data: { id: "1" } }, { status: 201 }));

    await request("/artworks", { method: "POST", body: { title: "Dawn" }, auth: true });

    const [, options] = fetch.mock.calls.at(-1);
    expect(options.method).toBe("POST");
    expect(options.headers.Authorization).toBe("Bearer tok-123");
    expect(options.headers["X-Noroff-API-Key"]).toBe("key-abc");
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(options.body).toBe(JSON.stringify({ title: "Dawn" }));
  });

  it("throws before fetching when an authed request is missing a credential", async () => {
    getToken.mockReturnValue(null);
    getApiKey.mockReturnValue("key-abc");

    await expect(
      request("/artworks", { method: "POST", body: {}, auth: true })
    ).rejects.toMatchObject({ name: "ApiError", status: 401 });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("request — responses and errors", () => {
  it("returns null on 204 without parsing a body", async () => {
    getToken.mockReturnValue("tok-123");
    getApiKey.mockReturnValue("key-abc");
    const json = vi.fn(async () => {
      throw new Error("204 body must not be parsed");
    });
    fetch.mockResolvedValue({ ok: true, status: 204, headers: { get: () => null }, json });

    const result = await request("/artworks/1", { method: "DELETE", auth: true });

    expect(result).toBeNull();
    expect(json).not.toHaveBeenCalled();
  });

  it("throws an ApiError carrying the API message and status on non-2xx", async () => {
    fetch.mockResolvedValue(fakeResponse({ errors: [{ message: "Not Found" }] }, { status: 404 }));

    await expect(request("/artworks/missing")).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
      message: "Not Found",
    });
  });

  it("falls back to a default message when the body is unparseable and statusText is blank", async () => {
    // An HTTP/2 error response: no reason phrase (statusText "") and a non-JSON body.
    fetch.mockResolvedValue({
      ok: false,
      status: 502,
      statusText: "",
      headers: { get: () => null },
      json: async () => {
        throw new Error("not json");
      },
    });

    await expect(request("/artworks")).rejects.toMatchObject({
      name: "ApiError",
      status: 502,
      message: "Request failed.",
    });
  });

  it("wraps a network failure as an ApiError with isNetwork", async () => {
    fetch.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(request("/artworks")).rejects.toMatchObject({ isNetwork: true });
  });

  it("wraps an aborted request as an ApiError with isAbort", async () => {
    const abortError = Object.assign(new Error("aborted"), { name: "AbortError" });
    fetch.mockRejectedValue(abortError);

    await expect(request("/artworks")).rejects.toMatchObject({ isAbort: true });
  });

  it("ApiError is the exported error type", async () => {
    fetch.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(request("/artworks")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("artwork wrappers", () => {
  it("getArtworks returns { data, meta } from the list envelope", async () => {
    fetch.mockResolvedValue(fakeResponse({ data: [{ id: "1" }], meta: { totalCount: 33 } }));

    const result = await getArtworks();

    expect(fetch.mock.calls.at(-1)[0]).toBe(`${BASE}/artworks`);
    expect(result).toEqual({ data: [{ id: "1" }], meta: { totalCount: 33 } });
  });

  it("getArtworks serialises only the params that are set", async () => {
    fetch.mockResolvedValue(fakeResponse({ data: [], meta: {} }));

    await getArtworks({ page: 2, limit: 24, sort: "created", sortOrder: "desc" });

    expect(fetch.mock.calls.at(-1)[0]).toBe(
      `${BASE}/artworks?page=2&limit=24&sort=created&sortOrder=desc`
    );
  });

  it("getArtwork returns the unwrapped single work", async () => {
    fetch.mockResolvedValue(fakeResponse({ data: { id: "1", title: "Dawn" }, meta: {} }));

    const result = await getArtwork("1");

    expect(fetch.mock.calls.at(-1)[0]).toBe(`${BASE}/artworks/1`);
    expect(result).toEqual({ id: "1", title: "Dawn" });
  });

  it("createArtwork POSTs the fields with auth and returns the created work", async () => {
    getToken.mockReturnValue("tok-123");
    getApiKey.mockReturnValue("key-abc");
    fetch.mockResolvedValue(fakeResponse({ data: { id: "9" } }, { status: 201 }));

    const result = await createArtwork({
      title: "Dawn",
      artist: "Anon",
      medium: "oil",
      description: "x",
    });

    const [url, options] = fetch.mock.calls.at(-1);
    expect(url).toBe(`${BASE}/artworks`);
    expect(options.method).toBe("POST");
    expect(options.headers.Authorization).toBe("Bearer tok-123");
    expect(result).toEqual({ id: "9" });
  });

  it("updateArtwork PUTs to the id path with auth", async () => {
    getToken.mockReturnValue("tok-123");
    getApiKey.mockReturnValue("key-abc");
    fetch.mockResolvedValue(fakeResponse({ data: { id: "9", title: "Dusk" } }));

    const result = await updateArtwork("9", { title: "Dusk" });

    const [url, options] = fetch.mock.calls.at(-1);
    expect(url).toBe(`${BASE}/artworks/9`);
    expect(options.method).toBe("PUT");
    expect(result).toEqual({ id: "9", title: "Dusk" });
  });

  it("deleteArtwork DELETEs the id path with auth and returns null", async () => {
    getToken.mockReturnValue("tok-123");
    getApiKey.mockReturnValue("key-abc");
    fetch.mockResolvedValue({
      ok: true,
      status: 204,
      headers: { get: () => null },
      json: vi.fn(),
    });

    const result = await deleteArtwork("9");

    const [url, options] = fetch.mock.calls.at(-1);
    expect(url).toBe(`${BASE}/artworks/9`);
    expect(options.method).toBe("DELETE");
    expect(result).toBeNull();
  });
});

describe("auth wrappers", () => {
  it("authRegister POSTs name/email/password with no auth headers and returns data", async () => {
    fetch.mockResolvedValue(
      fakeResponse({ data: { name: "vera_holt", email: "vera@stud.noroff.no" } }, { status: 201 })
    );

    const result = await authRegister({
      name: "vera_holt",
      email: "vera@stud.noroff.no",
      password: "alpenglow",
    });

    const [url, options] = fetch.mock.calls.at(-1);
    expect(url).toBe(`${BASE}/auth/register`);
    expect(options.method).toBe("POST");
    expect(options.headers.Authorization).toBeUndefined();
    expect(options.headers["X-Noroff-API-Key"]).toBeUndefined();
    expect(JSON.parse(options.body)).toEqual({
      name: "vera_holt",
      email: "vera@stud.noroff.no",
      password: "alpenglow",
    });
    expect(result).toEqual({ name: "vera_holt", email: "vera@stud.noroff.no" });
  });

  it("authLogin POSTs the credentials and returns the profile with the token", async () => {
    fetch.mockResolvedValue(fakeResponse({ data: { name: "vera_holt", accessToken: "tok-123" } }));

    const result = await authLogin({ email: "vera@stud.noroff.no", password: "alpenglow" });

    const [url, options] = fetch.mock.calls.at(-1);
    expect(url).toBe(`${BASE}/auth/login`);
    expect(options.method).toBe("POST");
    expect(options.headers.Authorization).toBeUndefined();
    expect(result).toEqual({ name: "vera_holt", accessToken: "tok-123" });
  });

  it("authCreateApiKey sends only the Bearer token (no API key) and returns the key", async () => {
    fetch.mockResolvedValue(fakeResponse({ data: { name: "nordic-art-archive", key: "key-abc" } }));

    const result = await authCreateApiKey("tok-123", { name: "nordic-art-archive" });

    const [url, options] = fetch.mock.calls.at(-1);
    expect(url).toBe(`${BASE}/auth/create-api-key`);
    expect(options.method).toBe("POST");
    expect(options.headers.Authorization).toBe("Bearer tok-123");
    expect(options.headers["X-Noroff-API-Key"]).toBeUndefined();
    expect(result).toEqual({ name: "nordic-art-archive", key: "key-abc" });
  });
});
