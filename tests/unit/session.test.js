import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getToken, getApiKey, setSession, clearSession } from "../../js/session.js";

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
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("session", () => {
  it("returns null for unset credentials", () => {
    expect(getToken()).toBeNull();
    expect(getApiKey()).toBeNull();
  });

  it("round-trips the token and api key", () => {
    setSession({ accessToken: "tok-123", apiKey: "key-abc" });
    expect(getToken()).toBe("tok-123");
    expect(getApiKey()).toBe("key-abc");
  });

  it("writes only the provided fields", () => {
    setSession({ accessToken: "tok-123", apiKey: "key-abc" });
    setSession({ accessToken: "tok-456" });
    expect(getToken()).toBe("tok-456");
    expect(getApiKey()).toBe("key-abc");
  });

  it("clearSession removes both credentials", () => {
    setSession({ accessToken: "tok-123", apiKey: "key-abc" });
    clearSession();
    expect(getToken()).toBeNull();
    expect(getApiKey()).toBeNull();
  });
});
