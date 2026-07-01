import { describe, it, expect } from "vitest";
import { captionParts } from "../../js/studio-wall.js";
import { buildPayload } from "../../js/studio.js";

describe("captionParts", () => {
  it("falls back to a faint Untitled when there is no title", () => {
    const c = captionParts({ title: "", artist: "", year: "", medium: "" });
    expect(c.title).toBe("Untitled");
    expect(c.faint).toBe(true);
    expect(c.year).toBe("");
    expect(c.meta).toBe("");
  });

  it("builds the label from the fields", () => {
    const c = captionParts({
      title: "Winter Night",
      artist: "Sohlberg",
      year: "1914",
      medium: "painting",
    });
    expect(c.title).toBe("Winter Night");
    expect(c.faint).toBe(false);
    expect(c.year).toBe(", 1914");
    expect(c.meta).toBe("Sohlberg · painting");
  });

  it("joins artist and medium with a middot, dropping the blank one", () => {
    expect(captionParts({ title: "X", artist: "A", year: "", medium: "" }).meta).toBe("A");
    expect(captionParts({ title: "X", artist: "", year: "", medium: "oil" }).meta).toBe("oil");
  });

  it("trims surrounding whitespace", () => {
    const c = captionParts({
      title: "  Dawn  ",
      artist: " Munch ",
      year: " 1893 ",
      medium: " oil ",
    });
    expect(c.title).toBe("Dawn");
    expect(c.year).toBe(", 1893");
    expect(c.meta).toBe("Munch · oil");
  });
});

describe("buildPayload", () => {
  const full = {
    title: "Winter Night",
    artist: "Sohlberg",
    year: "1914",
    medium: "painting",
    description: "Dusk on the ridge.",
    location: "Oslo",
    imageUrl: "https://example.com/a.jpg",
    imageAlt: "A snowy ridge",
  };

  it("sends the four required fields plus present optionals", () => {
    expect(buildPayload(full)).toEqual({
      title: "Winter Night",
      artist: "Sohlberg",
      medium: "painting",
      description: "Dusk on the ridge.",
      year: 1914,
      location: "Oslo",
      image: { url: "https://example.com/a.jpg", alt: "A snowy ridge" },
    });
  });

  it("coerces year to an integer", () => {
    expect(buildPayload(full).year).toBe(1914);
  });

  it("drops empty optionals — no NaN year, no empty image", () => {
    const payload = buildPayload({ ...full, year: "", location: "", imageUrl: "", imageAlt: "" });
    expect(payload).toEqual({
      title: "Winter Night",
      artist: "Sohlberg",
      medium: "painting",
      description: "Dusk on the ridge.",
    });
    expect("year" in payload).toBe(false);
    expect("image" in payload).toBe(false);
  });

  it("includes image without alt when alt is blank, and upgrades http to https", () => {
    const payload = buildPayload({ ...full, imageUrl: "http://example.com/a.jpg", imageAlt: "" });
    expect(payload.image).toEqual({ url: "https://example.com/a.jpg" });
  });
});
