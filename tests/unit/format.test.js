import { describe, it, expect } from "vitest";
import { formatYear, formatDate, truncate } from "../../js/format.js";

describe("formatYear", () => {
  it("renders a whole year number", () => {
    expect(formatYear(1893)).toBe("1893");
  });

  it("renders a year given as a string", () => {
    expect(formatYear("1893")).toBe("1893");
  });

  it("trims surrounding whitespace", () => {
    expect(formatYear("  1893  ")).toBe("1893");
  });

  it("returns an empty string for an absent year", () => {
    expect(formatYear(null)).toBe("");
    expect(formatYear(undefined)).toBe("");
    expect(formatYear("")).toBe("");
    expect(formatYear("   ")).toBe("");
  });

  it("returns an empty string for non-numeric text", () => {
    expect(formatYear("unknown")).toBe("");
  });

  it("returns an empty string for a decimal or non-whole value", () => {
    expect(formatYear(1893.5)).toBe("");
    expect(formatYear("18.5")).toBe("");
  });

  it("returns an empty string for zero or a negative year", () => {
    expect(formatYear(0)).toBe("");
    expect(formatYear(-5)).toBe("");
  });
});

describe("formatDate", () => {
  it("renders an ISO timestamp as an editorial date", () => {
    expect(formatDate("2026-06-16T10:00:00Z")).toBe("16 June 2026");
  });

  it("renders a date-only ISO string", () => {
    expect(formatDate("2026-06-16")).toBe("16 June 2026");
  });

  it("uses no leading zero on the day", () => {
    expect(formatDate("2026-01-05T00:00:00Z")).toBe("5 January 2026");
  });

  it("reads the timestamp in UTC", () => {
    expect(formatDate("2026-06-16T23:30:00Z")).toBe("16 June 2026");
  });

  it("returns an empty string for an absent or unparseable value", () => {
    expect(formatDate(null)).toBe("");
    expect(formatDate(undefined)).toBe("");
    expect(formatDate("")).toBe("");
    expect(formatDate("not a date")).toBe("");
  });
});

describe("truncate", () => {
  it("returns short text unchanged", () => {
    expect(truncate("Freedom", 50)).toBe("Freedom");
  });

  it("returns text of exactly the limit unchanged", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });

  it("cuts back to the last whole word and appends an ellipsis", () => {
    expect(truncate("hello world foo", 8)).toBe("hello…");
  });

  it("keeps a word that ends exactly on the boundary", () => {
    expect(truncate("hello world foo", 11)).toBe("hello world…");
  });

  it("hard-cuts a single long word with no break point", () => {
    expect(truncate("hello!", 5)).toBe("hello…");
  });

  it("does not leave a trailing space before the ellipsis", () => {
    expect(truncate("a b c d e f", 6)).toBe("a b c…");
  });

  it("uses a single ellipsis glyph, not three dots", () => {
    const result = truncate("the quick brown fox jumps", 9);
    expect(result.endsWith("…")).toBe(true);
    expect(result).not.toContain("...");
  });

  it("returns an empty string for absent text", () => {
    expect(truncate(null, 10)).toBe("");
    expect(truncate(undefined, 10)).toBe("");
    expect(truncate("", 10)).toBe("");
  });

  it("returns an empty string for whitespace-only text", () => {
    expect(truncate("     ", 3)).toBe("");
  });

  it("drops leading whitespace when it has to truncate", () => {
    expect(truncate(" helloworld", 6)).toBe("hello…");
  });

  it("returns an empty string when the limit is zero or negative", () => {
    expect(truncate("hello", 0)).toBe("");
    expect(truncate("hello", -3)).toBe("");
  });
});
