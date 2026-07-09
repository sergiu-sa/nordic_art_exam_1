// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { probeImages } from "../../js/image-probe.js";

// behaviours: url → { w, h } | "error" | "hang"
function fakeImageFactory(behaviours, calls = []) {
  return () => {
    const listeners = {};
    return {
      naturalWidth: 0,
      naturalHeight: 0,
      addEventListener(type, fn) {
        listeners[type] = fn;
      },
      set src(url) {
        calls.push(url);
        const plan = behaviours[url];
        queueMicrotask(() => {
          if (plan === "hang") return;
          if (plan === "error") return listeners.error?.();
          this.naturalWidth = plan.w;
          this.naturalHeight = plan.h;
          listeners.load?.();
        });
      },
    };
  };
}

beforeEach(() => {
  sessionStorage.clear();
});

describe("probeImages", () => {
  it("measures a loaded image's natural ratio", async () => {
    const createImage = fakeImageFactory({ a: { w: 300, h: 200 } });
    const results = await probeImages(["a"], { createImage });
    expect(results.get("a")).toEqual({ ratio: 1.5 });
  });

  it("marks a failed load dead", async () => {
    const createImage = fakeImageFactory({ a: "error" });
    const results = await probeImages(["a"], { createImage });
    expect(results.get("a")).toEqual({ dead: true });
  });

  it("times out to unknown without caching", async () => {
    const createImage = fakeImageFactory({ a: "hang" });
    const results = await probeImages(["a"], { timeoutMs: 20, createImage });
    expect(results.get("a")).toEqual({ unknown: true });
    expect(sessionStorage.getItem("naa.imageProbe")).not.toContain("a");
  });

  it("treats a zero-dimension load as unknown", async () => {
    const createImage = fakeImageFactory({ a: { w: 0, h: 0 } });
    const results = await probeImages(["a"], { createImage });
    expect(results.get("a")).toEqual({ unknown: true });
  });

  it("serves cached ratios and dead verdicts without re-probing", async () => {
    const first = fakeImageFactory({ a: { w: 100, h: 100 }, b: "error" });
    await probeImages(["a", "b"], { createImage: first });
    const calls = [];
    const second = fakeImageFactory({}, calls);
    const results = await probeImages(["a", "b"], { createImage: second });
    expect(results.get("a")).toEqual({ ratio: 1 });
    expect(results.get("b")).toEqual({ dead: true });
    expect(calls).toEqual([]);
  });

  it("survives a corrupt cache", async () => {
    sessionStorage.setItem("naa.imageProbe", "{nope");
    const createImage = fakeImageFactory({ a: { w: 100, h: 50 } });
    const results = await probeImages(["a"], { createImage });
    expect(results.get("a")).toEqual({ ratio: 2 });
  });

  it("dedupes urls and caps concurrency", async () => {
    let inFlight = 0;
    let peak = 0;
    const release = [];
    const createImage = () => ({
      naturalWidth: 100,
      naturalHeight: 100,
      addEventListener(type, fn) {
        this[`on${type}`] = fn;
      },
      set src(url) {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        release.push(() => {
          inFlight -= 1;
          this.onload();
        });
      },
    });
    const probe = probeImages(["a", "b", "c", "d", "a"], { concurrency: 2, createImage });
    for (let i = 0; i < 5; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      release.splice(0).forEach((fn) => fn());
    }
    const results = await probe;
    expect(peak).toBe(2);
    expect(results.size).toBe(4);
  });
});
