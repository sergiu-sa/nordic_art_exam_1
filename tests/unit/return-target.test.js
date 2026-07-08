import { describe, it, expect } from "vitest";
import { resolveReturn } from "../../js/return-target.js";

describe("resolveReturn", () => {
  it("resumes a guarded edit precisely to its artwork id", () => {
    expect(
      resolveReturn({
        from: "edit",
        id: "11111111-2222-3333-4444-555555555555",
      })
    ).toEqual({
      href: "../artwork/edit.html?id=11111111-2222-3333-4444-555555555555",
      label: "edit",
      resume: true,
    });
  });

  it("does not auto-resume edit without an id — falls to the welcome default", () => {
    expect(resolveReturn({ from: "edit" })).toEqual({
      href: "../index.html",
      label: "into the archive",
      resume: false,
    });
  });

  it("resolves create to the create page", () => {
    expect(resolveReturn({ from: "create" })).toEqual({
      href: "../artwork/create.html",
      label: "add artwork",
      resume: true,
    });
  });

  it("resumes a profile bounce to the collector's room", () => {
    expect(resolveReturn({ from: "profile" })).toEqual({
      href: "../profile.html",
      label: "my works",
      resume: true,
    });
  });

  it("returns the default (no resume) when no from is given", () => {
    expect(resolveReturn({})).toEqual({
      href: "../index.html",
      label: "into the archive",
      resume: false,
    });
  });

  it("returns the default for an unknown or hostile from", () => {
    expect(resolveReturn({ from: "https://evil.example" })).toEqual({
      href: "../index.html",
      label: "into the archive",
      resume: false,
    });
  });

  it("encodes an id with reserved characters onto the fixed edit path", () => {
    expect(resolveReturn({ from: "edit", id: "a/b c&d" }).href).toBe(
      "../artwork/edit.html?id=a%2Fb%20c%26d"
    );
  });

  it("tolerates being called with no argument", () => {
    expect(resolveReturn()).toMatchObject({ resume: false });
  });
});
