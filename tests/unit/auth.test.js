import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// keep the real ApiError + request; replace only the three auth wrappers with spies
vi.mock("../../js/api.js", async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    authRegister: vi.fn(),
    authLogin: vi.fn(),
    authCreateApiKey: vi.fn(),
  };
});

import { authRegister, authLogin, authCreateApiKey, ApiError } from "../../js/api.js";
import { register, login, logout, isLoggedIn, requireAuth } from "../../js/auth.js";
import { getToken, getApiKey, getUserName, setSession } from "../../js/session.js";

// node lacks sessionStorage — back it with an in-memory fake.
function createStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
}

beforeEach(() => {
  vi.stubGlobal("sessionStorage", createStorage());
  authRegister.mockReset();
  authLogin.mockReset();
  authCreateApiKey.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("register", () => {
  it("lowercases the email and posts the fields", async () => {
    authRegister.mockResolvedValue({ name: "vera_holt", email: "vera@stud.noroff.no" });

    await register({ name: "vera_holt", email: "Vera@Stud.Noroff.No", password: "alpenglow" });

    expect(authRegister).toHaveBeenCalledWith({
      name: "vera_holt",
      email: "vera@stud.noroff.no",
      password: "alpenglow",
    });
  });

  it("does not write a session (register returns no token)", async () => {
    authRegister.mockResolvedValue({ name: "vera_holt" });
    await register({ name: "vera_holt", email: "vera@stud.noroff.no", password: "alpenglow" });
    expect(getToken()).toBeNull();
  });
});

describe("login — the bootstrap", () => {
  it("logs in, creates the api key, and commits token + key + name", async () => {
    authLogin.mockResolvedValue({
      name: "vera_holt",
      email: "vera@stud.noroff.no",
      accessToken: "tok-123",
    });
    authCreateApiKey.mockResolvedValue({ key: "key-abc" });

    const identity = await login({ email: "Vera@stud.noroff.no", password: "alpenglow" });

    expect(authLogin).toHaveBeenCalledWith({ email: "vera@stud.noroff.no", password: "alpenglow" });
    expect(authCreateApiKey).toHaveBeenCalledWith("tok-123", expect.any(Object));
    expect(getToken()).toBe("tok-123");
    expect(getApiKey()).toBe("key-abc");
    expect(getUserName()).toBe("vera_holt");
    expect(identity).toEqual({ name: "vera_holt", email: "vera@stud.noroff.no" });
  });

  it("is atomic — a failed api-key step leaves no session", async () => {
    authLogin.mockResolvedValue({ name: "vera_holt", accessToken: "tok-123" });
    authCreateApiKey.mockRejectedValue(new ApiError("create-api-key failed", { status: 500 }));

    await expect(
      login({ email: "vera@stud.noroff.no", password: "alpenglow" })
    ).rejects.toMatchObject({ name: "ApiError" });
    expect(getToken()).toBeNull();
    expect(getApiKey()).toBeNull();
    expect(getUserName()).toBeNull();
  });

  it("throws when login returns no token", async () => {
    authLogin.mockResolvedValue({ name: "vera_holt" });
    await expect(
      login({ email: "vera@stud.noroff.no", password: "alpenglow" })
    ).rejects.toMatchObject({
      name: "ApiError",
    });
    expect(authCreateApiKey).not.toHaveBeenCalled();
  });

  it("throws when no api key is returned", async () => {
    authLogin.mockResolvedValue({ name: "vera_holt", accessToken: "tok-123" });
    authCreateApiKey.mockResolvedValue({});
    await expect(
      login({ email: "vera@stud.noroff.no", password: "alpenglow" })
    ).rejects.toMatchObject({
      name: "ApiError",
    });
    expect(getToken()).toBeNull();
  });
});

describe("logout / isLoggedIn", () => {
  it("isLoggedIn is true only when both token and key are present", () => {
    expect(isLoggedIn()).toBe(false);
    setSession({ accessToken: "tok-123" });
    expect(isLoggedIn()).toBe(false);
    setSession({ apiKey: "key-abc" });
    expect(isLoggedIn()).toBe(true);
  });

  it("logout clears the session", () => {
    setSession({ accessToken: "tok-123", apiKey: "key-abc", name: "vera_holt" });
    logout();
    expect(isLoggedIn()).toBe(false);
    expect(getUserName()).toBeNull();
  });
});

describe("requireAuth", () => {
  it("redirects (replace) to the login page with ?from when logged out", () => {
    const replace = vi.fn();
    vi.stubGlobal("window", { location: { replace } });
    const ok = requireAuth({ from: "create" });
    expect(ok).toBe(false);
    expect(replace).toHaveBeenCalledWith("../account/login.html?from=create");
  });

  it("carries the artwork id on the edit hop", () => {
    const replace = vi.fn();
    vi.stubGlobal("window", { location: { replace } });
    const ok = requireAuth({ from: "edit", id: "abc-123" });
    expect(ok).toBe(false);
    expect(replace).toHaveBeenCalledWith("../account/login.html?from=edit&id=abc-123");
  });

  it("passes through without redirecting when logged in", () => {
    const replace = vi.fn();
    vi.stubGlobal("window", { location: { replace } });
    setSession({ accessToken: "tok-123", apiKey: "key-abc" });
    const ok = requireAuth({ from: "create" });
    expect(ok).toBe(true);
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirects to the bare login path with no query when called with no args", () => {
    const replace = vi.fn();
    vi.stubGlobal("window", { location: { replace } });
    const ok = requireAuth();
    expect(ok).toBe(false);
    expect(replace).toHaveBeenCalledWith("../account/login.html");
  });
});
