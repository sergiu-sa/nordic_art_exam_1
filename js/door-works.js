// Decorative door hydration for the account pages:
// swap the six hardcoded works ringing the login/register card for works drawn from the archive per visit.
// The static markup is the fallback — srcs are only overwritten on a fully successful fetch + probe, so the form never waits on decoration and an API outage keeps today's wall.
// Kept out of account.js (pure presentation) so that module stays network-free.

import { getArtworks } from "./api.js";
import { probeImages } from "./image-probe.js";
import {
  isUsableArtwork,
  secureImageUrl,
  browsingPool,
  ratiosById,
  classifyOrientation,
} from "./artworks.js";

const DOOR_LIMIT = 24;
const DOOR_PROBE_TIMEOUT_MS = 5000;

// Landscape works anchor the salon hang (the collage's own rule); the rest fill the supporting slots. Leftover landscape works spill into supporting so nothing is wasted.
export function pickDoorWorks(works = [], ratios, { anchorCount = 2, supportingCount = 4 } = {}) {
  const landscape = [];
  const rest = [];
  for (const work of works) {
    if (classifyOrientation(ratios?.get(work?.id)) === "landscape") landscape.push(work);
    else rest.push(work);
  }
  const anchors = landscape.slice(0, anchorCount);
  const supporting = [...landscape.slice(anchorCount), ...rest].slice(0, supportingCount);
  return { anchors, supporting };
}

export async function hydrateDoor(doc = document) {
  const door = doc.getElementById("door");
  if (!door) return;
  const anchorEls = [...door.querySelectorAll(".piece:not(.ih) img")];
  const supportingEls = [...door.querySelectorAll(".piece.ih img")];
  if (!anchorEls.length && !supportingEls.length) return;

  try {
    const { data } = await getArtworks({ limit: DOOR_LIMIT });
    const usable = data.filter(isUsableArtwork);
    const results = await probeImages(
      usable.map((work) => secureImageUrl(work.image.url)),
      { timeoutMs: DOOR_PROBE_TIMEOUT_MS }
    );
    const { works: alive } = browsingPool(usable, results, { min: 0 });
    const ratios = ratiosById(alive, results);
    const { anchors, supporting } = pickDoorWorks(alive, ratios, {
      anchorCount: anchorEls.length,
      supportingCount: supportingEls.length,
    });
    // partial fills would leave holes next to static works — keep the whole fallback instead
    if (anchors.length < anchorEls.length || supporting.length < supportingEls.length) return;
    anchorEls.forEach((img, i) => {
      img.src = secureImageUrl(anchors[i].image.url);
    });
    supportingEls.forEach((img, i) => {
      img.src = secureImageUrl(supporting[i].image.url);
    });
  } catch {
    // decorative — a caught failure keeps the static wall; not a real error
  }
}
