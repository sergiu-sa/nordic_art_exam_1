import { describe, it, expect } from "vitest";
import {
  collectorsRegister,
  roomWorks,
  colophon,
  artistRegister,
  keepsLine,
  enfiladeNeighbours,
  weightedHang,
  LITWALL_PATTERN,
} from "../../js/rooms.js";

// minimal work factory — only the fields rooms.js reads
function work({
  id,
  owner,
  artist,
  medium,
  year,
  created,
  title = "A real title",
  url = "https://img.example/a.jpg",
} = {}) {
  return {
    id,
    title,
    artist,
    medium,
    year,
    created,
    owner: owner ? { name: owner } : undefined,
    image: { url, alt: "" },
  };
}

const POOL = [
  work({
    id: "a1",
    owner: "eline",
    artist: "Edvard Munch",
    medium: "painting",
    year: 1901,
    created: "2026-06-01T00:00:00Z",
  }),
  work({
    id: "a2",
    owner: "eline",
    artist: "Edvard Munch",
    medium: "print",
    year: 1894,
    created: "2026-06-03T00:00:00Z",
  }),
  work({
    id: "a3",
    owner: "eline",
    artist: "Theodor Kittelsen",
    medium: "watercolour",
    year: 1887,
    created: "2026-06-02T00:00:00Z",
  }),
  work({
    id: "b1",
    owner: "anders",
    artist: "P.S. Krøyer",
    medium: "painting",
    year: 1899,
    created: "2026-05-01T00:00:00Z",
  }),
  work({
    id: "c1",
    owner: "bjorn",
    artist: "Vilhelm Hammershøi",
    medium: "painting",
    year: 1904,
    created: "2026-04-01T00:00:00Z",
  }),
  work({
    id: "c2",
    owner: "bjorn",
    artist: "Vilhelm Hammershøi",
    medium: "painting",
    year: 1901,
    created: "2026-04-02T00:00:00Z",
  }),
];

describe("collectorsRegister", () => {
  it("groups by trimmed owner.name, weight-desc, ties alphabetical", () => {
    const register = collectorsRegister(POOL);
    expect(register.map((r) => r.name)).toEqual(["eline", "bjorn", "anders"]);
    expect(register.map((r) => r.count)).toEqual([3, 2, 1]);
  });
  it("sorts each room's works newest-first", () => {
    const register = collectorsRegister(POOL);
    expect(register[0].works.map((w) => w.id)).toEqual(["a2", "a3", "a1"]);
  });
  it("skips works with no owner name", () => {
    expect(collectorsRegister([work({ id: "x" }), ...POOL])).toHaveLength(3);
  });
});

describe("roomWorks", () => {
  const register = collectorsRegister(POOL);
  it("finds a room by exact trimmed name", () => {
    expect(roomWorks(register, " eline ").map((w) => w.id)).toEqual(["a2", "a3", "a1"]);
  });
  it("returns [] for an unknown or empty name", () => {
    expect(roomWorks(register, "nobody")).toEqual([]);
    expect(roomWorks(register, "")).toEqual([]);
  });
});

describe("colophon", () => {
  it("counts works, distinct artists/mediums (case-insensitive), and the year span", () => {
    const register = collectorsRegister(POOL);
    expect(colophon(register[0].works)).toEqual({
      works: 3,
      artists: 2,
      mediums: 3,
      years: { min: 1887, max: 1901 },
    });
  });
  it("drops the year span when no work has a real year", () => {
    expect(
      colophon([work({ id: "z", owner: "o", artist: "A", medium: "m", year: "unknown" })]).years
    ).toBeNull();
  });
  it("is empty-safe", () => {
    expect(colophon([])).toEqual({ works: 0, artists: 0, mediums: 0, years: null });
  });
});

describe("artistRegister", () => {
  it("ranks artists by count with the raw first-seen label", () => {
    const { artists, rest } = artistRegister(roomWorks(collectorsRegister(POOL), "eline"));
    expect(artists[0]).toEqual({ artist: "Edvard Munch", key: "edvard munch", count: 2 });
    expect(artists[1].artist).toBe("Theodor Kittelsen");
    expect(rest).toBe(0);
  });
  it("reports the rest beyond the limit", () => {
    const works = ["A", "B", "C"].map((artist, i) => work({ id: `r${i}`, owner: "o", artist }));
    expect(artistRegister(works, 2).rest).toBe(1);
  });
});

describe("keepsLine", () => {
  const register = collectorsRegister(POOL);
  it("prints the top one or two raw artist values", () => {
    expect(keepsLine(roomWorks(register, "eline"))).toBe("keeps Edvard Munch & Theodor Kittelsen");
    expect(keepsLine(roomWorks(register, "anders"))).toBe("keeps P.S. Krøyer");
  });
  it("is empty for no works", () => {
    expect(keepsLine([])).toBe("");
  });
});

describe("enfiladeNeighbours", () => {
  const register = collectorsRegister(POOL); // eline · bjorn · anders
  it("walks the register order and wraps at the ends", () => {
    const { prev, next } = enfiladeNeighbours(register, "eline");
    expect(prev.name).toBe("anders"); // wrap: the biggest room's previous is the smallest
    expect(next.name).toBe("bjorn");
  });
  it("summarises each side (name, count, keeps, peek)", () => {
    const { next } = enfiladeNeighbours(register, "eline");
    expect(next).toMatchObject({ name: "bjorn", count: 2, keeps: "keeps Vilhelm Hammershøi" });
    expect(next.peek.id).toBe("c2"); // newest usable work
  });
  it("stands a name outside the register at the seam", () => {
    const { prev, next } = enfiladeNeighbours(register, "newcomer");
    expect(prev.name).toBe("anders"); // smallest
    expect(next.name).toBe("eline"); // biggest
  });
  it("dedupes when both sides would be the same room", () => {
    const two = collectorsRegister(POOL.filter((w) => w.owner?.name !== "anders"));
    const { prev, next } = enfiladeNeighbours(two, "eline");
    expect(prev).toBeNull();
    expect(next.name).toBe("bjorn");
  });
  it("goes quiet when there is no other room", () => {
    const solo = collectorsRegister(POOL.slice(0, 3));
    expect(enfiladeNeighbours(solo, "eline")).toEqual({ prev: null, next: null });
    expect(enfiladeNeighbours([], "anyone")).toEqual({ prev: null, next: null });
  });
});

describe("weightedHang", () => {
  it("gives the heaviest hand the largest slot, one work per artist, in DOM order", () => {
    const works = roomWorks(collectorsRegister(POOL), "eline");
    const hang = weightedHang(works);
    expect(hang).toHaveLength(2); // 2 artists → 2 slots
    const munch = hang.find((p) => p.work.artist === "Edvard Munch");
    expect(munch.slot.span).toBe(Math.max(...LITWALL_PATTERN.map((s) => s.span)));
    // output follows pattern (DOM) order, not weight order
    const spans = hang.map((p) => p.slot);
    expect(LITWALL_PATTERN.indexOf(spans[0])).toBeLessThan(LITWALL_PATTERN.indexOf(spans[1]));
  });
  it("prefers a usable work but falls back to the newest", () => {
    const junkOnly = [
      work({ id: "j1", owner: "o", artist: "A", title: "string", created: "2026-01-02T00:00:00Z" }),
      work({ id: "j2", owner: "o", artist: "A", title: "string", created: "2026-01-01T00:00:00Z" }),
    ];
    const hang = weightedHang(collectorsRegister(junkOnly)[0].works);
    expect(hang[0].work.id).toBe("j1");
  });
});
