import { describe, it, expect } from "vitest";
import {
  validateRequired,
  validateEmail,
  validatePassword,
  validateName,
  validateYear,
  validateImageUrl,
  validateImageAlt,
} from "../../js/validation.js";

// Convention across validators: null means valid, a string is the inline message.

describe("validateRequired", () => {
  it("passes a non-empty value", () => {
    expect(validateRequired("Dawn")).toBeNull();
  });

  it("trims, so a value with surrounding space is still present", () => {
    expect(validateRequired("  Dawn  ")).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(validateRequired("")).toBe("This field is required.");
  });

  it("rejects whitespace only", () => {
    expect(validateRequired("   ")).toBe("This field is required.");
  });

  it("rejects null and undefined", () => {
    expect(validateRequired(null)).toBe("This field is required.");
    expect(validateRequired(undefined)).toBe("This field is required.");
  });

  it("names the field in the message when a label is given", () => {
    expect(validateRequired("", "Title")).toBe("Title is required.");
  });
});

describe("validateEmail", () => {
  it("passes a stud.noroff.no address", () => {
    expect(validateEmail("first.last@stud.noroff.no")).toBeNull();
  });

  it("allows hyphens, dots and underscores in the local part", () => {
    expect(validateEmail("first-l.a_st@stud.noroff.no")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(validateEmail("USER@STUD.NOROFF.NO")).toBeNull();
  });

  it("reports a required error when empty", () => {
    expect(validateEmail("")).toBe("Email is required.");
    expect(validateEmail(null)).toBe("Email is required.");
  });

  it("rejects the plain noroff.no domain (the brief requires stud.)", () => {
    expect(validateEmail("user@noroff.no")).toBe("Enter a valid stud.noroff.no email address.");
  });

  it("rejects other domains", () => {
    expect(validateEmail("user@gmail.com")).toBe("Enter a valid stud.noroff.no email address.");
  });

  it("rejects an address with no @", () => {
    expect(validateEmail("userstud.noroff.no")).toBe("Enter a valid stud.noroff.no email address.");
  });

  it("is anchored — no trailing domain smuggling", () => {
    expect(validateEmail("user@stud.noroff.no.evil.com")).toBe(
      "Enter a valid stud.noroff.no email address."
    );
  });

  it("rejects a stray space in the address", () => {
    expect(validateEmail("user @stud.noroff.no")).toBe(
      "Enter a valid stud.noroff.no email address."
    );
  });
});

describe("validatePassword", () => {
  it("passes a password of at least 8 characters", () => {
    expect(validatePassword("password")).toBeNull();
  });

  it("reports a required error when empty", () => {
    expect(validatePassword("")).toBe("Password is required.");
    expect(validatePassword(null)).toBe("Password is required.");
  });

  it("rejects a password shorter than 8 characters", () => {
    expect(validatePassword("short")).toBe("Password must be at least 8 characters.");
  });

  it("counts the boundary exactly (7 fails, 8 passes)", () => {
    expect(validatePassword("1234567")).toBe("Password must be at least 8 characters.");
    expect(validatePassword("12345678")).toBeNull();
  });

  it("does not trim — spaces count toward length", () => {
    expect(validatePassword("        ")).toBeNull();
  });
});

describe("validateName", () => {
  it("passes letters, numbers and underscores", () => {
    expect(validateName("art_lover_99")).toBeNull();
  });

  it("reports a required error when empty or whitespace only", () => {
    expect(validateName("")).toBe("Name is required.");
    expect(validateName("   ")).toBe("Name is required.");
    expect(validateName(null)).toBe("Name is required.");
  });

  it("rejects spaces and punctuation", () => {
    const message = "Name can use only letters, numbers and underscores.";
    expect(validateName("John Doe")).toBe(message);
    expect(validateName("john-doe")).toBe(message);
    expect(validateName("åsa")).toBe(message);
  });

  it("rejects a name longer than 20 characters", () => {
    expect(validateName("a".repeat(21))).toBe("Name must be 20 characters or fewer.");
  });

  it("accepts a name of exactly 20 characters", () => {
    expect(validateName("a".repeat(20))).toBeNull();
  });

  it("flags the charset before the length on a long invalid name", () => {
    expect(validateName("this is a far too long name")).toBe(
      "Name can use only letters, numbers and underscores."
    );
  });
});

describe("validateYear", () => {
  it("is optional — empty is valid", () => {
    expect(validateYear("")).toBeNull();
    expect(validateYear("   ")).toBeNull();
    expect(validateYear(null)).toBeNull();
    expect(validateYear(undefined)).toBeNull();
  });

  it("passes a positive whole year as a string", () => {
    expect(validateYear("1893")).toBeNull();
  });

  it("passes a positive whole year as a number", () => {
    expect(validateYear(1893)).toBeNull();
  });

  it("tolerates surrounding whitespace", () => {
    expect(validateYear("  1893  ")).toBeNull();
  });

  const invalid = "Enter a valid year — a positive whole number like 1893.";

  it("rejects non-numeric text", () => {
    expect(validateYear("abc")).toBe(invalid);
  });

  it("rejects a decimal", () => {
    expect(validateYear("18.5")).toBe(invalid);
    expect(validateYear(1893.5)).toBe(invalid);
  });

  it("rejects zero and negatives", () => {
    expect(validateYear("0")).toBe(invalid);
    expect(validateYear("-5")).toBe(invalid);
  });

  it("rejects the number zero passed directly", () => {
    expect(validateYear(0)).toBe(invalid);
  });

  it("rejects digits mixed with other characters", () => {
    expect(validateYear("1893!")).toBe(invalid);
  });
});

describe("validateImageUrl", () => {
  it("is optional — empty is valid", () => {
    expect(validateImageUrl("")).toBeNull();
    expect(validateImageUrl(null)).toBeNull();
  });

  it("passes an http and an https URL", () => {
    expect(validateImageUrl("http://example.org/a.jpg")).toBeNull();
    expect(validateImageUrl("https://example.org/a.jpg")).toBeNull();
  });

  const badUrl = "Enter a valid image URL starting with http:// or https://.";

  it("rejects a URL with no scheme", () => {
    expect(validateImageUrl("example.org/a.jpg")).toBe(badUrl);
  });

  it("rejects a non-web scheme", () => {
    expect(validateImageUrl("ftp://example.org/a.jpg")).toBe(badUrl);
    expect(validateImageUrl("mailto:someone@example.org")).toBe(badUrl);
  });

  it("rejects free text", () => {
    expect(validateImageUrl("not a url")).toBe(badUrl);
  });

  it("rejects a scheme with no host", () => {
    expect(validateImageUrl("https://")).toBe(badUrl);
    expect(validateImageUrl("http://")).toBe(badUrl);
  });

  it("accepts a minimal URL that has a host", () => {
    expect(validateImageUrl("https://x")).toBeNull();
  });

  it("rejects a URL longer than 300 characters before checking its shape", () => {
    const longUrl = `https://example.org/${"a".repeat(300)}.jpg`;
    expect(validateImageUrl(longUrl)).toBe("Image URL must be 300 characters or fewer.");
  });

  it("accepts a URL of exactly 300 characters", () => {
    const base = "https://example.org/";
    const url = base + "a".repeat(300 - base.length);
    expect(url).toHaveLength(300);
    expect(validateImageUrl(url)).toBeNull();
  });
});

describe("validateImageAlt", () => {
  it("is optional — empty is valid", () => {
    expect(validateImageAlt("")).toBeNull();
    expect(validateImageAlt(null)).toBeNull();
  });

  it("passes ordinary alt text", () => {
    expect(validateImageAlt("A misty fjord at dawn")).toBeNull();
  });

  it("accepts exactly 120 characters", () => {
    expect(validateImageAlt("a".repeat(120))).toBeNull();
  });

  it("rejects more than 120 characters", () => {
    expect(validateImageAlt("a".repeat(121))).toBe("Alt text must be 120 characters or fewer.");
  });
});
