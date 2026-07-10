import { describe, it, expect } from "vitest";

import { pickDoorWorks } from "../../js/door-works.js";

const w = (id) => ({ id, image: { url: `https://example.com/${id}.jpg`, alt: "" } });

describe("pickDoorWorks", () => {
  it("puts landscape works in the anchors and the rest in supporting", () => {
    const works = [w("a"), w("b"), w("c"), w("d"), w("e"), w("f")];
    const ratios = new Map([
      ["a", 1.8],
      ["b", 0.7],
      ["c", 1.9],
      ["d", 1.0],
      ["e", 0.6],
      ["f", 2.1],
    ]);
    const { anchors, supporting } = pickDoorWorks(works, ratios);
    expect(anchors).toEqual([works[0], works[2]]); // a, c (landscape, in order)
    expect(supporting).toEqual([works[5], works[1], works[3], works[4]]); // f (leftover landscape), then b, d, e
  });

  it("returns short anchors when there aren't enough landscape works", () => {
    const works = [w("a"), w("b")];
    const ratios = new Map([
      ["a", 0.7],
      ["b", 0.6],
    ]);
    const { anchors, supporting } = pickDoorWorks(works, ratios);
    expect(anchors).toEqual([]); // no landscape → caller keeps the static fallback
    expect(supporting).toEqual([works[0], works[1]]);
  });
});
