import { describe, it, expect } from "vitest";

import {
  isUsableArtwork,
  usableArtworks,
  artworkAlt,
  mediumHref,
  secureImageUrl,
  sortByCreatedDesc,
  pickHero,
  splitSections,
  topMediums,
  deriveCounts,
  assignPlacement,
  FEED_PATTERN,
  DARK_PATTERN,
  relatedArtworks,
  neighbours,
  cropSet,
  introSegments,
  splitParagraphs,
  isShortDescription,
  isOwnArtwork,
  isArtworkId,
} from "../../js/artworks.js";

// A minimal usable artwork; override fields per case.
function art(over = {}) {
  return {
    title: "Winter Night",
    artist: "Harald Sohlberg",
    medium: "painting",
    year: 1914,
    image: { url: "https://example.com/a.jpg", alt: "" },
    ...over,
  };
}

describe("isUsableArtwork", () => {
  it("accepts a work with a real title and an http(s) image", () => {
    expect(isUsableArtwork(art())).toBe(true);
    expect(isUsableArtwork(art({ image: { url: "http://x.com/b.png" } }))).toBe(true);
  });

  it("rejects nullish or junk-titled works", () => {
    expect(isUsableArtwork(null)).toBe(false);
    expect(isUsableArtwork(art({ title: "" }))).toBe(false);
    expect(isUsableArtwork(art({ title: "   " }))).toBe(false);
    expect(isUsableArtwork(art({ title: "string" }))).toBe(false);
    expect(isUsableArtwork(art({ title: "STRING" }))).toBe(false);
  });

  it("rejects a missing or non-http image url", () => {
    expect(isUsableArtwork(art({ image: { url: "" } }))).toBe(false);
    expect(isUsableArtwork(art({ image: undefined }))).toBe(false);
    expect(isUsableArtwork(art({ image: { url: "not-a-url" } }))).toBe(false);
    expect(isUsableArtwork(art({ image: { url: "ftp://x.com/c.jpg" } }))).toBe(false);
  });
});

describe("usableArtworks", () => {
  it("keeps only usable works and preserves order", () => {
    const list = [art({ title: "A" }), art({ title: "string" }), art({ title: "B" })];
    expect(usableArtworks(list).map((a) => a.title)).toEqual(["A", "B"]);
  });

  it("returns [] for no input", () => {
    expect(usableArtworks()).toEqual([]);
  });
});

describe("artworkAlt", () => {
  it("uses the image alt when present", () => {
    expect(artworkAlt(art({ image: { url: "x", alt: "a blue room" } }))).toBe("a blue room");
  });

  it("falls back to the title when alt is blank or missing", () => {
    expect(artworkAlt(art({ title: "Skrik", image: { url: "x", alt: "" } }))).toBe("Skrik");
    expect(artworkAlt(art({ title: "Skrik", image: { url: "x" } }))).toBe("Skrik");
  });
});

describe("mediumHref", () => {
  it("deep-links to the collection on the encoded raw value", () => {
    expect(mediumHref("Charcoal (Drawing)")).toBe("collection.html?medium=Charcoal%20(Drawing)");
    expect(mediumHref("oil & water")).toBe("collection.html?medium=oil%20%26%20water");
  });
});

describe("secureImageUrl", () => {
  it("upgrades http to https", () => {
    expect(secureImageUrl("http://x.com/a.jpg")).toBe("https://x.com/a.jpg");
    expect(secureImageUrl("HTTP://x.com/a.jpg")).toBe("https://x.com/a.jpg");
  });

  it("leaves https and relative paths untouched", () => {
    expect(secureImageUrl("https://x.com/a.jpg")).toBe("https://x.com/a.jpg");
    expect(secureImageUrl("assets/img/cover.webp")).toBe("assets/img/cover.webp");
  });

  it("returns an empty string for nullish input", () => {
    expect(secureImageUrl(null)).toBe("");
    expect(secureImageUrl(undefined)).toBe("");
  });
});

describe("sortByCreatedDesc", () => {
  it("orders works newest-first by created", () => {
    const oldWork = art({ title: "old", created: "2026-03-30T09:58:23.710Z" });
    const newWork = art({ title: "new", created: "2026-04-05T12:53:45.191Z" });
    const midWork = art({ title: "mid", created: "2026-04-01T09:58:03.044Z" });
    expect(sortByCreatedDesc([oldWork, newWork, midWork]).map((w) => w.title)).toEqual([
      "new",
      "mid",
      "old",
    ]);
  });

  it("sorts works with an invalid or missing created last", () => {
    const dated = art({ title: "dated", created: "2026-04-05T12:53:45.191Z" });
    const junk = art({ title: "junk", created: "not-a-date" });
    const missing = art({ title: "missing" }); // no created field
    const result = sortByCreatedDesc([junk, missing, dated]);
    expect(result[0].title).toBe("dated");
    expect(result.slice(1).map((w) => w.title)).toEqual(["junk", "missing"]); // input order kept
  });

  it("is stable for equal or both-junk created values (keeps input order)", () => {
    const a = art({ title: "A", created: "2026-04-05T00:00:00.000Z" });
    const b = art({ title: "B", created: "2026-04-05T00:00:00.000Z" });
    const j1 = art({ title: "J1", created: "" });
    const j2 = art({ title: "J2", created: "" });
    expect(sortByCreatedDesc([a, b, j1, j2]).map((w) => w.title)).toEqual(["A", "B", "J1", "J2"]);
  });

  it("returns [] for no input and does not mutate the source", () => {
    expect(sortByCreatedDesc()).toEqual([]);
    const src = [
      art({ title: "x", created: "2026-01-01T00:00:00.000Z" }),
      art({ title: "y", created: "2026-02-01T00:00:00.000Z" }),
    ];
    const snapshot = [...src];
    sortByCreatedDesc(src);
    expect(src).toEqual(snapshot); // original array order unchanged
  });
});

describe("splitSections", () => {
  const many = Array.from({ length: 20 }, (_, i) => art({ title: `W${i}` }));

  it("takes the lead, then fills the two grids in order", () => {
    const { featured, feed, dark } = splitSections(many);
    expect(featured.title).toBe("W0");
    expect(feed.map((a) => a.title)).toEqual(["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"]);
    expect(dark.map((a) => a.title)).toEqual(["W9", "W10", "W11", "W12", "W13"]);
  });

  it("degrades gracefully when there are few works", () => {
    const { featured, feed, dark } = splitSections([art({ title: "only" })]);
    expect(featured.title).toBe("only");
    expect(feed).toEqual([]);
    expect(dark).toEqual([]);
  });

  it("returns a null lead for an empty list", () => {
    expect(splitSections([]).featured).toBeNull();
  });
});

describe("pickHero", () => {
  it("features the best-catalogued work, not just the newest", () => {
    const junk = art({ title: "dill", artist: "dill", medium: "dill", description: "" });
    const real = art({
      title: "Bergen Urban City",
      description: "A long-enough written description that reads as a real catalogue entry.",
      year: 2023,
    });
    expect(pickHero([junk, real])).toBe(real); // junk is first/newest but loses
  });

  it("penalises lorem-filled placeholder works", () => {
    const lorem = art({
      title: "Aliquam feugiat lorem sit amet",
      description: "Lorem ipsum dolor sit amet consectetur adipiscing elit.",
      year: 2012,
    });
    const real = art({
      title: "Winter Night",
      description: "A quiet study of a mountain range under a wide field of stars.",
      year: 1914,
    });
    expect(pickHero([lorem, real])).toBe(real);
  });

  it("keeps the input order (newest-first) when scores tie", () => {
    const first = art({ title: "First In" });
    const second = art({ title: "Second In" });
    expect(pickHero([first, second])).toBe(first);
  });

  it("returns null for an empty list", () => {
    expect(pickHero([])).toBeNull();
  });
});

describe("topMediums", () => {
  it("counts raw values, ranks by count, breaks ties alphabetically", () => {
    const list = [
      art({ medium: "Photograpy" }),
      art({ medium: "Photograpy" }),
      art({ medium: "Wood (Sculpture)" }),
      art({ medium: "Charcoal" }),
      art({ medium: "Charcoal" }),
    ];
    const top = topMediums(list, 5);
    expect(top.map((m) => [m.medium, m.count])).toEqual([
      ["Charcoal", 2],
      ["Photograpy", 2],
      ["Wood (Sculpture)", 1],
    ]);
  });

  it("skips blank mediums and applies the limit", () => {
    const list = [art({ medium: "" }), art({ medium: "a" }), art({ medium: "b" })];
    expect(topMediums(list, 1)).toHaveLength(1);
  });

  it("attaches the first usable work of each medium as the sample", () => {
    const junk = art({ title: "string", medium: "print" });
    const good = art({ title: "real", medium: "print" });
    const [row] = topMediums([junk, good]);
    expect(row.sample.title).toBe("real");
  });
});

describe("deriveCounts", () => {
  it("uses meta total for artworks and distinct (case-insensitive) for the rest", () => {
    const list = [
      art({ artist: "Munch", medium: "painting" }),
      art({ artist: "munch", medium: "Painting" }),
      art({ artist: "Dahl", medium: "print" }),
    ];
    expect(deriveCounts(list, 33)).toEqual({ artworks: 33, artists: 2, mediums: 2 });
  });

  it("falls back to the list length when no total is given", () => {
    expect(deriveCounts([art(), art()]).artworks).toBe(2);
  });
});

describe("assignPlacement", () => {
  it("pairs each work with a pattern slot in order", () => {
    const items = [art(), art()];
    const placed = assignPlacement(items, FEED_PATTERN);
    expect(placed[0].slot).toBe(FEED_PATTERN[0]);
    expect(placed[1].slot).toBe(FEED_PATTERN[1]);
  });

  it("cycles the pattern if there are more works than slots", () => {
    const items = Array.from({ length: DARK_PATTERN.length + 1 }, () => art());
    const placed = assignPlacement(items, DARK_PATTERN);
    expect(placed[DARK_PATTERN.length].slot).toBe(DARK_PATTERN[0]);
  });
});

// ---- detail-page shaping ----

describe("relatedArtworks", () => {
  const current = art({
    id: "c",
    artist: "Sohlberg",
    medium: "painting",
    location: "Norway",
    year: 1914,
  });

  it("ranks artist → medium → location → nearest year, with reason lines", () => {
    const list = [
      current,
      art({
        id: "a4",
        artist: "Gallen-Kallela",
        medium: "sculpture",
        location: "Finland",
        year: 1910,
      }),
      art({ id: "a1", artist: "sohlberg", medium: "print", location: "Sweden", year: 1900 }),
      art({ id: "a3", artist: "Kittelsen", medium: "drawing", location: "norway", year: 1887 }),
      art({ id: "a2", artist: "Munch", medium: "Painting", location: "Sweden", year: 1893 }),
      art({ id: "a5", artist: "Dahl", medium: "sketch", location: "Denmark", year: 1850 }),
    ];
    const related = relatedArtworks(current, list, { limit: 4 });
    expect(related.map((r) => [r.work.id, r.reason])).toEqual([
      ["a1", "also sohlberg"],
      ["a2", "also Painting"],
      ["a3", "also from norway"],
      ["a4", "same era"],
    ]);
  });

  it("excludes the current work and any junk works", () => {
    const list = [
      current,
      art({ id: "dup", artist: "Munch" }),
      art({ id: "junk", title: "string", artist: "Munch" }),
      art({ id: "noimg", artist: "Munch", image: { url: "not-a-url" } }),
    ];
    const ids = relatedArtworks(current, list).map((r) => r.work.id);
    expect(ids).toEqual(["dup"]);
  });

  it("orders the nearest-year tier by distance and degrades the reason without a year", () => {
    const lone = art({
      id: "c",
      artist: "Solo",
      medium: "unique",
      location: "Nowhere",
      year: 1900,
    });
    const list = [
      lone,
      art({ id: "far", artist: "A", medium: "m", location: "L", year: 1850 }),
      art({ id: "near", artist: "B", medium: "n", location: "M", year: 1905 }),
      art({ id: "undated", artist: "C", medium: "o", location: "N", year: null }),
    ];
    const related = relatedArtworks(lone, list);
    expect(related.map((r) => r.work.id)).toEqual(["near", "far", "undated"]);
    expect(related.find((r) => r.work.id === "undated").reason).toBe("also in the archive");
  });

  it("returns [] with no candidates or no current", () => {
    expect(relatedArtworks(current, [current])).toEqual([]);
    expect(relatedArtworks(null, [art({ id: "x" })])).toEqual([]);
    expect(relatedArtworks(current, [])).toEqual([]);
  });
});

describe("neighbours", () => {
  const list = [art({ id: "1" }), art({ id: "2" }), art({ id: "3" })];

  it("returns the works either side of the current one", () => {
    const { prev, next } = neighbours(list[1], list);
    expect([prev?.id, next?.id]).toEqual(["1", "3"]);
  });

  it("returns null past the ends of the list", () => {
    expect(neighbours(list[0], list).prev).toBeNull();
    expect(neighbours(list[2], list).next).toBeNull();
  });

  it("returns both null when the current work is not in the list", () => {
    expect(neighbours(art({ id: "x" }), list)).toEqual({ prev: null, next: null });
    expect(neighbours(art({ id: "1" }), [])).toEqual({ prev: null, next: null });
  });
});

describe("cropSet", () => {
  const CAPTIONS = ["detail — upper centre", "detail — lower left", "detail — right edge"];

  it("reads orientation from the image ratio", () => {
    expect(cropSet(2).orientation).toBe("landscape");
    expect(cropSet(0.5).orientation).toBe("portrait");
    expect(cropSet(1).orientation).toBe("square");
  });

  it("returns three positional windows with in-range origins", () => {
    for (const ratio of [2, 0.5, 1]) {
      const { windows } = cropSet(ratio);
      expect(windows).toHaveLength(3);
      expect(windows.map((w) => w.caption)).toEqual(CAPTIONS);
      for (const w of windows) {
        expect(w.originX).toBeGreaterThanOrEqual(0);
        expect(w.originX).toBeLessThanOrEqual(100);
        expect(w.originY).toBeGreaterThanOrEqual(0);
        expect(w.originY).toBeLessThanOrEqual(100);
        expect(typeof w.w).toBe("number");
        expect(w.aspectRatio).toBeGreaterThan(0);
      }
    }
  });

  it("shapes the windows to the orientation", () => {
    expect(cropSet(2).windows.some((w) => w.aspectRatio > 1)).toBe(true);
    expect(cropSet(0.5).windows[0].aspectRatio).toBeLessThan(1);
  });

  it("defaults to square for missing or junk ratios", () => {
    expect(cropSet(0).orientation).toBe("square");
    expect(cropSet(NaN).orientation).toBe("square");
    expect(cropSet().orientation).toBe("square");
  });
});

describe("introSegments", () => {
  const text = (work) =>
    introSegments(work)
      .map((s) => s.text)
      .join("");
  const emPart = (work) => introSegments(work).find((s) => s.em)?.text ?? null;

  it("templates a full sentence and emphasises the artist", () => {
    const work = art({
      medium: "painting",
      artist: "Harald Sohlberg",
      year: 1914,
      location: "Norway",
    });
    expect(text(work)).toBe(
      "A painting by Harald Sohlberg, 1914 — kept in Norway, part of the living archive."
    );
    expect(emPart(work)).toBe("Harald Sohlberg");
  });

  it("drops empty fields cleanly", () => {
    expect(text(art({ medium: "", artist: "Munch", year: 1893, location: "" }))).toBe(
      "A work by Munch, 1893 — part of the living archive."
    );
    expect(text(art({ medium: "print", artist: "", year: "", location: "Oslo" }))).toBe(
      "A print — kept in Oslo, part of the living archive."
    );
    expect(emPart(art({ artist: "" }))).toBeNull();
  });

  it("ignores a junk year", () => {
    expect(text(art({ medium: "painting", artist: "X", year: "n/a", location: "" }))).toBe(
      "A painting by X — part of the living archive."
    );
  });
});

describe("splitParagraphs", () => {
  it("splits on blank lines and trims", () => {
    expect(splitParagraphs("one\n\ntwo\n\n\nthree")).toEqual(["one", "two", "three"]);
  });

  it("treats unbroken text as a single paragraph", () => {
    expect(splitParagraphs("a single blob of prose")).toEqual(["a single blob of prose"]);
  });

  it("returns [] for empty or nullish input", () => {
    expect(splitParagraphs("")).toEqual([]);
    expect(splitParagraphs("   \n  ")).toEqual([]);
    expect(splitParagraphs(null)).toEqual([]);
  });
});

describe("isShortDescription", () => {
  it("is short under the threshold and long over it", () => {
    expect(isShortDescription("Freedom")).toBe(true);
    expect(isShortDescription("x".repeat(401))).toBe(false);
  });

  it("treats empty as short and respects a custom threshold", () => {
    expect(isShortDescription("")).toBe(true);
    expect(isShortDescription("abcde", 5)).toBe(false);
    expect(isShortDescription("abcd", 5)).toBe(true);
  });
});

describe("isOwnArtwork", () => {
  it("is true when the user name matches the owner", () => {
    expect(isOwnArtwork({ owner: { name: "vera_holt" } }, "vera_holt")).toBe(true);
  });

  it("is false for a different user", () => {
    expect(isOwnArtwork({ owner: { name: "vera_holt" } }, "lars_b")).toBe(false);
  });

  it("is false when there is no user name", () => {
    expect(isOwnArtwork({ owner: { name: "vera_holt" } }, null)).toBe(false);
    expect(isOwnArtwork({ owner: { name: "vera_holt" } }, "")).toBe(false);
  });

  it("is false when the work has no owner", () => {
    expect(isOwnArtwork({}, "vera_holt")).toBe(false);
    expect(isOwnArtwork({ owner: {} }, "vera_holt")).toBe(false);
  });

  it("ignores surrounding whitespace on the owner name", () => {
    expect(isOwnArtwork({ owner: { name: " vera_holt " } }, "vera_holt")).toBe(true);
  });
});

describe("isArtworkId", () => {
  it("accepts a UUID", () => {
    expect(isArtworkId("a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isArtworkId("A1B2C3D4-E5F6-7890-ABCD-EF1234567890")).toBe(true);
  });

  it("rejects a non-UUID, empty, or nullish value", () => {
    expect(isArtworkId("123")).toBe(false);
    expect(isArtworkId("not-a-uuid")).toBe(false);
    expect(isArtworkId("")).toBe(false);
    expect(isArtworkId(null)).toBe(false);
    expect(isArtworkId(undefined)).toBe(false);
  });
});
