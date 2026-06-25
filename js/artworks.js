// Pure, DOM-free shaping for the artworks feed — usability filter, hero pick,grid split, medium register, and chaos placement. feed.js wires these to the API and the page.

import { formatYear } from "./format.js";

const JUNK_TITLES = new Set(["", "string"]);

// The feed is the whole shared pool, so guard the obvious junk: a real title and a real http(s) image URL.
// Dead URLs that still look valid are caught at render by guardImage; there's no way to know a host is down without a probe.
export function isUsableArtwork(artwork) {
  if (!artwork) return false;
  const title = String(artwork.title ?? "").trim();
  if (!title || JUNK_TITLES.has(title.toLowerCase())) return false;
  const url = String(artwork.image?.url ?? "").trim();
  return /^https?:\/\//i.test(url);
}

export function usableArtworks(list = []) {
  return list.filter(isUsableArtwork);
}

// The API's alt is often blank; fall back to the title so it's never empty.
export function artworkAlt(artwork) {
  const alt = String(artwork?.image?.alt ?? "").trim();
  return alt || String(artwork?.title ?? "").trim();
}

// medium is free text; deep-link to the collection on the raw value.
export function mediumHref(medium) {
  return `collection.html?medium=${encodeURIComponent(medium)}`;
}

// http image URLs are blocked as mixed content on the live HTTPS site;
// upgrade to https (http-only hosts fail either way and fall to the dead-image plate).
export function secureImageUrl(url) {
  return String(url ?? "").replace(/^http:\/\//i, "https://");
}

// The hero is the page's thesis, so feature the best-catalogued work, not just the newest — the shared pool is full of junk (one-word titles, lorem walls).
// A higher score = more likely a real, presentable work.
function heroScore(work) {
  const title = String(work.title ?? "").trim();
  const description = String(work.description ?? "").trim();
  const words = title.split(/\s+/).filter(Boolean);
  let score = 0;
  if (words.length >= 2 && words.length <= 6) score += 2; // a real title, not a lorem sentence
  if (!/^[a-z]+$/.test(title)) score += 1; // not a bare lowercase word (dill, cats)
  if (description.length >= 40 && description.length <= 600) score += 1; // a written description
  if (formatYear(work.year)) score += 1;
  if (/\b(lorem|ipsum|dolor|consectetur|adipiscing|elit)\b/i.test(`${title} ${description}`)) {
    score -= 3;
  }
  return score;
}

// The highest-scoring work; ties keep the input order (newest-first), so a linear max is deliberate over sort (stable, no engine-dependent ordering).
export function pickHero(list = []) {
  if (!list.length) return null;
  let best = list[0];
  let bestScore = heroScore(best);
  for (let i = 1; i < list.length; i += 1) {
    const score = heroScore(list[i]);
    if (score > bestScore) {
      best = list[i];
      bestScore = score;
    }
  }
  return best;
}

// The home shows the featured lead + two grids. The featured work is pulled out
// so it never repeats in a grid; the slot patterns cap each grid, so the page
// reads designed whether the pool holds 14 works or 140.
export function splitSections(
  list = [],
  { feedCount = FEED_PATTERN.length, darkCount = DARK_PATTERN.length } = {}
) {
  const featured = pickHero(list);
  const rest = featured ? list.filter((work) => work !== featured) : [...list];
  return {
    featured,
    feed: rest.slice(0, feedCount),
    dark: rest.slice(feedCount, feedCount + darkCount),
  };
}

// Top-n mediums by count, printed raw (typos and all).
// Ties break alphabetically so the order is stable across loads. sample = the first usable work of that medium, for the row's thumbnail.
export function topMediums(list = [], limit = 5) {
  const counts = new Map();
  const samples = new Map();
  for (const artwork of list) {
    const medium = String(artwork.medium ?? "").trim();
    if (!medium) continue;
    counts.set(medium, (counts.get(medium) ?? 0) + 1);
    if (!samples.has(medium) && isUsableArtwork(artwork)) samples.set(medium, artwork);
  }
  return [...counts.entries()]
    .map(([medium, count]) => ({ medium, count, sample: samples.get(medium) ?? null }))
    .sort((a, b) => b.count - a.count || a.medium.localeCompare(b.medium))
    .slice(0, limit);
}

// The archive-in-numbers register: the total comes from meta.totalCount; the rest are distinct over the fetched list.
export function deriveCounts(list = [], totalCount) {
  const artists = new Set();
  const mediums = new Set();
  for (const artwork of list) {
    const artist = String(artwork.artist ?? "").trim();
    const medium = String(artwork.medium ?? "").trim();
    if (artist) artists.add(artist.toLowerCase());
    if (medium) mediums.add(medium.toLowerCase());
  }
  return {
    artworks: Number.isFinite(totalCount) ? totalCount : list.length,
    artists: artists.size,
    mediums: mediums.size,
  };
}

// The curated chaos placement — column start + span, a vertical offset, and a reserved aspect ratio per slot, hand-tuned.
// Works fill the slots in order; the one-empty-column gap between neighbours is the hanging rule, kept by construction.
// The wide slots (5, 4) are the feature moments.
export const FEED_PATTERN = [
  { col: 1, span: 5, mt: 0, ratio: 1.6 },
  { col: 7, span: 2, mt: 48, ratio: 1.0 },
  { col: 10, span: 3, mt: 110, ratio: 1.37 },
  { col: 2, span: 3, mt: -16, ratio: 1.6 },
  { col: 6, span: 6, mt: 36, ratio: 2.1 },
  { col: 1, span: 4, mt: 10, ratio: 1.9 },
  { col: 6, span: 3, mt: 80, ratio: 1.43 },
  { col: 10, span: 3, mt: 26, ratio: 1.08 },
];

// The dark room; the first work pulls up across the flip seam (negative mt);
// slot 4 is the room's wide feature.
export const DARK_PATTERN = [
  { col: 2, span: 4, mt: -180, ratio: 1.6 },
  { col: 7, span: 3, mt: 58, ratio: 1.47 },
  { col: 11, span: 2, mt: 18, ratio: 1.24 },
  { col: 1, span: 6, mt: 30, ratio: 2.28 },
  { col: 8, span: 4, mt: 100, ratio: 1.85 },
];

export function assignPlacement(items = [], pattern = FEED_PATTERN) {
  return items.map((item, index) => ({ item, slot: pattern[index % pattern.length] }));
}

/* ---- detail-page shaping ---- */

// Case-insensitive, whitespace-trimmed equality; blank never matches blank.
function sameText(a, b) {
  const x = String(a ?? "")
    .trim()
    .toLowerCase();
  const y = String(b ?? "")
    .trim()
    .toLowerCase();
  return x !== "" && x === y;
}

// There is no relations data, so related works are a client-side heuristic:
// same artist → same medium → same location → nearest year.
// Each kept work carries the reason that placed it; the current work and the
// shared pool's junk are excluded, and a work appears once under its highest
// reason.
export function relatedArtworks(current, list = [], { limit = 4 } = {}) {
  if (!current) return [];
  const currentId = current.id;
  const candidates = usableArtworks(list).filter((work) =>
    currentId ? work.id !== currentId : work !== current
  );

  const chosen = [];
  const taken = new Set();
  const take = (work, reason) => {
    if (taken.has(work)) return;
    taken.add(work);
    chosen.push({ work, reason });
  };

  for (const work of candidates) {
    if (sameText(work.artist, current.artist)) take(work, `also ${String(work.artist).trim()}`);
  }
  for (const work of candidates) {
    if (sameText(work.medium, current.medium)) take(work, `also ${String(work.medium).trim()}`);
  }
  for (const work of candidates) {
    if (sameText(work.location, current.location)) {
      take(work, `also from ${String(work.location).trim()}`);
    }
  }

  // the rest, nearest year first; "same era" only when both years are real
  const currentYear = Number(formatYear(current.year));
  candidates
    .filter((work) => !taken.has(work))
    .map((work) => {
      const dated = Boolean(formatYear(work.year)) && Boolean(formatYear(current.year));
      const distance = dated ? Math.abs(Number(formatYear(work.year)) - currentYear) : Infinity;
      return { work, distance, dated };
    })
    .sort((a, b) => a.distance - b.distance)
    .forEach(({ work, dated }) => take(work, dated ? "same era" : "also in the archive"));

  return chosen.slice(0, limit);
}

// Prev/next walk along the fetched list order, by id; null past either end or when the current work isn't in the list (the band hides that side).
export function neighbours(current, list = []) {
  const id = current?.id;
  const index = id ? list.findIndex((work) => work.id === id) : -1;
  if (index === -1) return { prev: null, next: null };
  return { prev: list[index - 1] ?? null, next: list[index + 1] ?? null };
}

// "In detail" is three fixed close-ups of the ONE API image.
// The window shapes follow the work's own orientation; the captions stay positional, so they never imply a second work.
const CROP_CAPTIONS = ["detail — upper centre", "detail — lower left", "detail — right edge"];

const CROP_SETS = {
  landscape: [
    { w: 400, aspectRatio: 1.5, originX: 50, originY: 6 },
    { w: 300, aspectRatio: 0.8, originX: 8, originY: 92 },
    { w: 352, aspectRatio: 1.5, originX: 82, originY: 38 },
  ],
  portrait: [
    { w: 300, aspectRatio: 0.8, originX: 50, originY: 8 },
    { w: 360, aspectRatio: 1.5, originX: 15, originY: 60 },
    { w: 300, aspectRatio: 0.78, originX: 82, originY: 30 },
  ],
  square: [
    { w: 360, aspectRatio: 1.0, originX: 50, originY: 10 },
    { w: 300, aspectRatio: 0.85, originX: 12, originY: 85 },
    { w: 340, aspectRatio: 1.3, originX: 80, originY: 40 },
  ],
};

export function cropSet(ratio) {
  const value = Number(ratio);
  let orientation = "square";
  if (Number.isFinite(value) && value > 0) {
    if (value >= 1.2) orientation = "landscape";
    else if (value <= 1 / 1.2) orientation = "portrait";
  }
  const windows = CROP_SETS[orientation].map((win, index) => ({
    ...win,
    caption: CROP_CAPTIONS[index],
  }));
  return { orientation, windows };
}

// The entry sentence, templated from real fields only — empties drop;
// The artist is emphasised. Returns segments so the renderer can italicise it.
export function introSegments(work = {}) {
  const medium = String(work.medium ?? "").trim();
  const artist = String(work.artist ?? "").trim();
  const year = formatYear(work.year);
  const location = String(work.location ?? "").trim();

  const segments = [];
  const lead = `A ${medium || "work"}`;
  if (artist) {
    segments.push({ text: `${lead} by ` });
    segments.push({ text: artist, em: true });
  } else {
    segments.push({ text: lead });
  }

  let tail = "";
  if (year) tail += `, ${year}`;
  tail += " — ";
  tail += location
    ? `kept in ${location}, part of the living archive.`
    : "part of the living archive.";
  segments.push({ text: tail });
  return segments;
}

// Free-text descriptions: paragraphs split on blank lines; an unbroken blob is one paragraph; empty or whitespace-only yields [].
export function splitParagraphs(text) {
  return String(text ?? "")
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

const SHORT_DESCRIPTION_MAX = 400;

// Description length picks the story layout: under the threshold reads as a single column (facts-card-led), over it as the two-column spread.
export function isShortDescription(text, threshold = SHORT_DESCRIPTION_MAX) {
  return String(text ?? "").trim().length < threshold;
}

// ownership is stricter than the body.authed nav gate
// the edit/delete tools show only when the signed-in user's name matches the work's owner.
// Owner name is embedded in GET /artworks(/:id).
export function isOwnArtwork(work, userName) {
  const owner = String(work?.owner?.name ?? "").trim();
  return Boolean(userName) && owner === userName;
}
