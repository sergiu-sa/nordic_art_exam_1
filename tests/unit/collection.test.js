import { describe, expect, it } from "vitest";
import {
  filterArtworks,
  topArtists,
  distinctArtistCount,
  sortByYearAsc,
  splitRooms,
  drawCollage,
  LIGHT_PATTERN,
  DARK_PATTERN,
  OVERFLOW_PATTERN,
} from "../../js/collection.js";

const work = (over = {}) => ({
  id: "x",
  title: "Vinternatt",
  artist: "Harald Sohlberg",
  medium: "painting",
  year: 1914,
  image: { url: "https://img/x.jpg", alt: "" },
  ...over,
});

describe("filterArtworks", () => {
  const list = [
    work({ id: "1", title: "Nøkken", artist: "Kittelsen", medium: "watercolour" }),
    work({ id: "2", title: "Skrik", artist: "Munch", medium: "painting" }),
    work({ id: "3", title: "york bridge", artist: "yorroam", medium: "Photograpy" }),
  ];

  it("passes everything on the defaults", () => {
    expect(filterArtworks(list)).toHaveLength(3);
    expect(filterArtworks(list, { medium: "all", query: "" })).toHaveLength(3);
  });

  it("matches medium exactly on the raw value, typos and all", () => {
    expect(filterArtworks(list, { medium: "Photograpy" })).toEqual([list[2]]);
    expect(filterArtworks(list, { medium: "photograpy" })).toEqual([]);
  });

  it("matches the query case-insensitively over title, artist, and medium", () => {
    expect(filterArtworks(list, { query: "SKRIK" })).toEqual([list[1]]);
    expect(filterArtworks(list, { query: "kittel" })).toEqual([list[0]]);
    expect(filterArtworks(list, { query: "watercol" })).toEqual([list[0]]);
  });

  it("composes medium and query", () => {
    expect(filterArtworks(list, { medium: "painting", query: "york" })).toEqual([]);
    expect(filterArtworks(list, { medium: "Photograpy", query: "york" })).toEqual([list[2]]);
  });

  it("trims the query and treats blank as no query", () => {
    expect(filterArtworks(list, { query: "  " })).toHaveLength(3);
  });

  it("tolerates missing fields on junk records", () => {
    expect(filterArtworks([{ id: "j" }], { query: "any" })).toEqual([]);
    expect(filterArtworks([{ id: "j" }])).toHaveLength(1);
  });

  it("does not mutate the input", () => {
    const copy = [...list];
    filterArtworks(list, { query: "a" });
    expect(list).toEqual(copy);
  });
});

describe("topArtists", () => {
  const list = [
    work({ artist: "yorroam" }),
    work({ artist: "Yorroam" }),
    work({ artist: "mothy" }),
    work({ artist: "Anna Ancher" }),
    work({ artist: "  " }),
    work({ artist: "mothy" }),
  ];

  it("counts case-insensitively and keeps the first casing seen", () => {
    const rows = topArtists(list);
    expect(rows[0]).toEqual({ artist: "mothy", count: 2 });
    expect(rows[1]).toEqual({ artist: "yorroam", count: 2 });
  });

  it("breaks ties alphabetically and honours the limit", () => {
    const rows = topArtists(list, 2);
    expect(rows.map((r) => r.artist)).toEqual(["mothy", "yorroam"]);
  });

  it("drops blank artists", () => {
    const names = topArtists(list).map((r) => r.artist);
    expect(names).toHaveLength(3);
    expect(names).toContain("Anna Ancher");
  });
});

describe("distinctArtistCount", () => {
  it("counts distinct artists with the same keying as topArtists", () => {
    expect(
      distinctArtistCount([
        work({ artist: "A" }),
        work({ artist: "a" }),
        work({ artist: "B" }),
        work({ artist: "" }),
      ])
    ).toBe(2);
  });
});

describe("sortByYearAsc", () => {
  it("orders numerically ascending, junk and missing years last, stable", () => {
    const a = work({ id: "a", year: 1928 });
    const b = work({ id: "b", year: 1842 });
    const c = work({ id: "c", year: undefined });
    const d = work({ id: "d", year: "not-a-year" });
    expect(sortByYearAsc([a, c, b, d]).map((w) => w.id)).toEqual(["b", "a", "c", "d"]);
  });

  it("copies, never mutates", () => {
    const list = [work({ year: 2 }), work({ year: 1 })];
    const copy = [...list];
    sortByYearAsc(list);
    expect(list).toEqual(copy);
  });
});

describe("splitRooms", () => {
  it("fills the daylight, caps the designed dark hang, and overflows the rest", () => {
    const list = Array.from({ length: 30 }, (_, i) => work({ id: String(i) }));
    const { light, dark, overflow } = splitRooms(list);
    expect(light).toHaveLength(LIGHT_PATTERN.length);
    expect(dark).toHaveLength(DARK_PATTERN.length);
    expect(overflow).toHaveLength(30 - LIGHT_PATTERN.length - DARK_PATTERN.length);
    expect(overflow[0].id).toBe(String(LIGHT_PATTERN.length + DARK_PATTERN.length));
  });

  it("leaves the dark room and the overflow empty on a short list", () => {
    const { light, dark, overflow } = splitRooms([work()], 15, 6);
    expect(light).toHaveLength(1);
    expect(dark).toHaveLength(0);
    expect(overflow).toHaveLength(0);
  });

  it("never grows the designed dark hang past its cap", () => {
    const list = Array.from({ length: 100 }, (_, i) => work({ id: String(i) }));
    expect(splitRooms(list).dark).toHaveLength(DARK_PATTERN.length);
  });
});

describe("drawCollage", () => {
  const list = Array.from({ length: 8 }, (_, i) => work({ id: String(i) }));

  it("draws the requested number of distinct works", () => {
    const drawn = drawCollage(list, { slots: 6, random: () => 0.99 });
    expect(drawn).toHaveLength(6);
    expect(new Set(drawn.map((w) => w.id)).size).toBe(6);
  });

  it("is deterministic under an injected rng", () => {
    const a = drawCollage(list, { random: () => 0 });
    const b = drawCollage(list, { random: () => 0 });
    expect(a.map((w) => w.id)).toEqual(b.map((w) => w.id));
  });

  it("returns the whole pool when it is smaller than the slot count", () => {
    expect(drawCollage(list.slice(0, 3))).toHaveLength(3);
  });

  it("does not mutate the input", () => {
    const copy = [...list];
    drawCollage(list);
    expect(list).toEqual(copy);
  });
});

describe("placement patterns", () => {
  it("every slot fits the 12-column grid and reserves an aspect", () => {
    for (const slot of [...LIGHT_PATTERN, ...DARK_PATTERN, ...OVERFLOW_PATTERN]) {
      expect(slot.col).toBeGreaterThanOrEqual(1);
      expect(slot.col + slot.span).toBeLessThanOrEqual(13);
      expect(slot.ratio).toBeGreaterThan(0);
      expect(Number.isFinite(slot.mt)).toBe(true);
    }
  });

  it("the dark pattern's first slot straddles the seam", () => {
    expect(DARK_PATTERN[0].mt).toBeLessThan(0);
  });

  it("the overflow pattern repeats cleanly — no upward pulls anywhere", () => {
    for (const slot of OVERFLOW_PATTERN) {
      expect(slot.mt).toBeGreaterThanOrEqual(0);
    }
  });
});
