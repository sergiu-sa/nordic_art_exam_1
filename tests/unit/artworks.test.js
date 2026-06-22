import { describe, it, expect } from "vitest";

import {
  isUsableArtwork,
  usableArtworks,
  artworkAlt,
  mediumHref,
  secureImageUrl,
  pickHero,
  splitSections,
  topMediums,
  deriveCounts,
  assignPlacement,
  FEED_PATTERN,
  DARK_PATTERN,
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
