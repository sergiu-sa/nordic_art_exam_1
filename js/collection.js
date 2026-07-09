// Pure, DOM-free shaping for the collection page — client-side filtering (the API has no search endpoint), the hands' artist counts, the index view's chronology, the room split, and the collage draw.
// pages/collection.js wires these to the DOM.

const key = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

// medium is an exact raw-value match;
// the query is a substring over title + artist + medium, so a typed "watercolour" behaves like its chip and a hand's artist name lands its works.
export function filterArtworks(list = [], { query = "", medium = "all" } = {}) {
  const term = key(query);
  return list.filter((work) => {
    if (medium !== "all" && String(work?.medium ?? "").trim() !== medium) return false;
    if (!term) return true;
    return [work?.title, work?.artist, work?.medium].some((field) => key(field).includes(term));
  });
}

// Count by artist — case-insensitive keying, the first casing seen wins the label;
// ties break alphabetically so the orbit is stable across loads (topMediums' rule).
function artistCounts(list = []) {
  const counts = new Map();
  for (const work of list) {
    const label = String(work?.artist ?? "").trim();
    if (!label) continue;
    const entry = counts.get(label.toLowerCase());
    if (entry) entry.count += 1;
    else counts.set(label.toLowerCase(), { artist: label, count: 1 });
  }
  return counts;
}

export function topArtists(list = [], limit = 5) {
  return [...artistCounts(list).values()]
    .sort((a, b) => b.count - a.count || a.artist.localeCompare(b.artist))
    .slice(0, limit);
}

export function distinctArtistCount(list = []) {
  return artistCounts(list).size;
}

// The index view reads chronologically.
// Junk/missing years sink to the end and ties keep input order (stable) — sortByCreatedDesc's discipline, ascending.
export function sortByYearAsc(list = []) {
  return list
    .map((work, index) => {
      const year = Number(String(work?.year ?? "").trim());
      const time = Number.isInteger(year) && year > 0 ? year : Infinity;
      return { work, index, time };
    })
    .sort((a, b) => (a.time === b.time ? a.index - b.index : a.time - b.time))
    .map((entry) => entry.work);
}

// The walk: the daylight takes the first pattern's worth, the dark room its designed hang, and everything load-more reveals overflows past the exit seam, where the ground walks back to white.
export function splitRooms(
  list = [],
  lightCount = LIGHT_PATTERN.length,
  darkCount = DARK_PATTERN.length
) {
  return {
    light: list.slice(0, lightCount),
    dark: list.slice(lightCount, lightCount + darkCount),
    overflow: list.slice(lightCount + darkCount),
  };
}

// The collage rehangs itself per visit: a Fisher-Yates draw over an index copy;
// random is injectable so tests can pin the shuffle.
export function drawCollage(list = [], { slots = 6, random = Math.random } = {}) {
  const order = list.map((_, index) => index);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order.slice(0, slots).map((index) => list[index]);
}

// Hand-tuned chaos placement, lifted from the prototype's three grid chunks (ratio = slot width / the prototype's px height).
// Wide slots are the features.
export const LIGHT_PATTERN = [
  { col: 1, span: 5, mt: 0, ratio: 1.6 },
  { col: 7, span: 3, mt: 64, ratio: 1.18 },
  { col: 11, span: 2, mt: 140, ratio: 0.97 },
  { col: 2, span: 3, mt: 26, ratio: 1.45 },
  { col: 6, span: 4, mt: 80, ratio: 1.45 },
  { col: 11, span: 2, mt: 30, ratio: 0.72 },
  { col: 3, span: 10, mt: 48, ratio: 1.46 },
  { col: 8, span: 4, mt: 92, ratio: 1.7 },
  { col: 2, span: 3, mt: 0, ratio: 1.38 },
  { col: 6, span: 3, mt: 56, ratio: 1.25 },
  { col: 10, span: 3, mt: 96, ratio: 1.48 },
  { col: 1, span: 5, mt: 34, ratio: 2.0 },
  { col: 8, span: 2, mt: 70, ratio: 0.78 },
  { col: 2, span: 3, mt: 38, ratio: 1.2 },
  { col: 7, span: 4, mt: 96, ratio: 1.57 },
];

// The first slot pulls up across the flip seam; slot 3 is the room's wide feature.
export const DARK_PATTERN = [
  { col: 1, span: 5, mt: -180, ratio: 1.6 },
  { col: 7, span: 4, mt: -36, ratio: 1.79 },
  { col: 3, span: 10, mt: 64, ratio: 1.78 },
  { col: 3, span: 3, mt: 36, ratio: 1.52 },
  { col: 7, span: 5, mt: 64, ratio: 1.68 },
  { col: 3, span: 5, mt: 48, ratio: 1.94 },
];

// The overflow that grows with load-more: denser and calmer than the designed rooms — no feature slots, no seam pulls, modest offsets — so it repeats cleanly however far the pool grows — slot 6 is the portrait home.
export const OVERFLOW_PATTERN = [
  { col: 1, span: 4, mt: 0, ratio: 1.45 },
  { col: 6, span: 3, mt: 44, ratio: 1.2 },
  { col: 10, span: 3, mt: 90, ratio: 1.4 },
  { col: 2, span: 3, mt: 34, ratio: 1.3 },
  { col: 6, span: 4, mt: 60, ratio: 1.6 },
  { col: 11, span: 2, mt: 24, ratio: 0.75 },
];
