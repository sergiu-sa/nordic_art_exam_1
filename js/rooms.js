// The collectors axis
// No profile endpoints exist; owner.name embedded on each work is the only identity the data carries.

import { sortByCreatedDesc, isUsableArtwork } from "./artworks.js";
import { formatYear } from "./format.js";

// Group the pool by trimmed owner.name.
// Every work counts — a room shows its collector's output verbatim; junk degrades at render, it is never hidden.
// Weight-desc so the register reads biggest hand first; ties alphabetical.
export function collectorsRegister(pool = []) {
  const rooms = new Map();
  for (const work of pool) {
    const name = String(work?.owner?.name ?? "").trim();
    if (!name) continue;
    if (!rooms.has(name)) rooms.set(name, []);
    rooms.get(name).push(work);
  }
  return [...rooms.entries()]
    .map(([name, works]) => ({ name, count: works.length, works: sortByCreatedDesc(works) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function roomWorks(register = [], name) {
  const wanted = String(name ?? "").trim();
  const room = wanted ? register.find((entry) => entry.name === wanted) : undefined;
  return room ? room.works : [];
}

// The plaque's colophon line.
// Distinct counts are case-insensitive (the deriveCounts convention); the year span uses real years only and is null when none exist, so the renderer drops the segment.
export function colophon(works = []) {
  const artists = new Set();
  const mediums = new Set();
  const years = [];
  for (const work of works) {
    const artist = String(work?.artist ?? "").trim();
    const medium = String(work?.medium ?? "").trim();
    if (artist) artists.add(artist.toLowerCase());
    if (medium) mediums.add(medium.toLowerCase());
    const year = formatYear(work?.year);
    if (year) years.push(Number(year));
  }
  return {
    works: works.length,
    artists: artists.size,
    mediums: mediums.size,
    years: years.length ? { min: Math.min(...years), max: Math.max(...years) } : null,
  };
}

// The by-artist register: grouped case-insensitively, labelled with the raw first-seen value, count-desc with alphabetical ties. rest = hands beyond the limit ("…N more hands — search the room").
export function artistRegister(works = [], limit = 5) {
  const groups = new Map();
  for (const work of works) {
    const raw = String(work?.artist ?? "").trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    const group = groups.get(key);
    if (group) group.count += 1;
    else groups.set(key, { artist: raw, key, count: 1 });
  }
  const all = [...groups.values()].sort(
    (a, b) => b.count - a.count || a.artist.localeCompare(b.artist)
  );
  return { artists: all.slice(0, limit), rest: Math.max(0, all.length - limit) };
}

// "keeps {A} & {B}" — raw artist values, no surname-guessing over free text.
export function keepsLine(works = []) {
  const { artists } = artistRegister(works, 2);
  if (!artists.length) return "";
  return `keeps ${artists.map((entry) => entry.artist).join(" & ")}`;
}

function roomSummary(room) {
  return {
    name: room.name,
    count: room.count,
    keeps: keepsLine(room.works),
    peek: room.works.find(isUsableArtwork) ?? null,
  };
}

// Prev/next rooms in the register's own order, wrapping at the ends.
// A name outside the register (your own empty room) stands at the seam: prev = the smallest room, next = the biggest.
// When both sides resolve to one room it shows once (next); when there is no other room, both sides go quiet — the band keeps its all-artworks exit either way.
export function enfiladeNeighbours(register = [], name) {
  if (!register.length) return { prev: null, next: null };
  const wanted = String(name ?? "").trim();
  const at = register.findIndex((room) => room.name === wanted);
  const size = register.length;
  const prev = at === -1 ? register[size - 1] : register[(at - 1 + size) % size];
  const next = at === -1 ? register[0] : register[(at + 1) % size];
  if (prev === next) {
    if (prev.name === wanted) return { prev: null, next: null };
    return { prev: null, next: roomSummary(next) };
  }
  return { prev: roomSummary(prev), next: roomSummary(next) };
}

// The lit wall's hand-tuned slots (DOM order — the grid rows flow as laid out; the hanging rule's one-empty-column gaps hold by construction).
// Ratios approximate the prototype hang; fine-tune in the browser pass.
export const LITWALL_PATTERN = [
  { col: 1, span: 5, mt: 0, ratio: 1.5 },
  { col: 7, span: 4, mt: 54, ratio: 1.7 },
  { col: 12, span: 1, mt: 14, ratio: 0.7 },
  { col: 2, span: 4, mt: 34, ratio: 1.6 },
  { col: 7, span: 2, mt: 40, ratio: 1.5 },
  { col: 10, span: 3, mt: 46, ratio: 1.9 },
];

// One representative work per artist — the newest, preferring a usable one — with the heaviest hand on the largest slot.
// The output keeps pattern (DOM) order so the tuned rows survive.
// Assumes works arrive newest-first (as collectorsRegister/roomWorks provide), since the per-artist pick takes the first usable one, else the first.
export function weightedHang(works = [], pattern = LITWALL_PATTERN) {
  const { artists } = artistRegister(works, pattern.length);
  const slotsBySize = pattern
    .map((slot, index) => ({ slot, index }))
    .sort((a, b) => b.slot.span - a.slot.span || a.index - b.index);
  return artists
    .map((entry, rank) => {
      const theirs = works.filter(
        (work) =>
          String(work?.artist ?? "")
            .trim()
            .toLowerCase() === entry.key
      );
      return {
        work: theirs.find(isUsableArtwork) ?? theirs[0],
        slot: slotsBySize[rank].slot,
        order: slotsBySize[rank].index,
      };
    })
    .sort((a, b) => a.order - b.order)
    .map(({ work, slot }) => ({ work, slot }));
}
