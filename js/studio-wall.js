// The studio wall — a live, decorative preview of the work being described.
// The form is the accessible source of truth; the wall is aria-hidden paint, so it never holds data the form doesn't.
// No API calls: it reflects the form's values and probes a candidate image URL only to know whether it can be shown.

import { secureImageUrl } from "./artworks.js";

const IMAGE_DEBOUNCE_MS = 600;

// trim + force https (the live site blocks mixed-content http images)
const cleanUrl = (raw) => secureImageUrl(String(raw || "").trim());

const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Pure: the caption strings written from the current field values.
export function captionParts({ title = "", artist = "", year = "", medium = "" } = {}) {
  const trimmedTitle = String(title).trim();
  const trimmedArtist = String(artist).trim();
  const trimmedMedium = String(medium).trim();
  const trimmedYear = String(year).trim();
  return {
    title: trimmedTitle || "Untitled",
    faint: trimmedTitle === "",
    year: trimmedYear ? `, ${trimmedYear}` : "",
    meta: [trimmedArtist, trimmedMedium].filter(Boolean).join(" · "),
  };
}

export function createWall(wallEl) {
  const noop = {
    update() {},
    setImage() {},
    async probeNow() {
      return { empty: true, live: false };
    },
    prefill() {},
    empty() {},
    destroy() {},
  };
  if (!wallEl) return noop;

  const frame = wallEl.querySelector(".pframe");
  const img = wallEl.querySelector("#pimg") || (frame && frame.querySelector("img")) || null;
  const crops = wallEl.querySelector(".pcrops");
  const cropImgs = crops ? [...crops.querySelectorAll("img")] : [];
  const capTitle = wallEl.querySelector("#pcap-title");
  const capYear = wallEl.querySelector("#pcap-year");
  const capArtist = wallEl.querySelector("#pcap-artist");
  const capMedium = wallEl.querySelector("#pcap-medium");

  let probeToken = 0; // bumped on each new candidate; a stale probe checks it and bails
  let debounceTimer = null;
  let hungSrc = "";

  function update(values) {
    const caption = captionParts(values);
    if (capTitle) {
      capTitle.textContent = caption.title; // textContent only — no injection through the preview
      capTitle.classList.toggle("faint", caption.faint);
    }
    if (capYear) capYear.textContent = caption.year;
    if (capArtist) capArtist.textContent = String(values.artist || "").trim();
    if (capMedium) capMedium.textContent = String(values.medium || "").trim();
  }

  function settle({ animate }) {
    if (!frame) return;
    const commit = () => {
      frame.classList.add("hung");
      frame.classList.remove("drop");
      if (crops) crops.classList.add("show");
    };
    if (animate && !reducedMotion()) {
      frame.classList.add("drop");
      requestAnimationFrame(commit);
    } else {
      commit();
    }
  }

  function hang(src, { animate = true } = {}) {
    if (src === hungSrc && frame && frame.classList.contains("hung")) return;
    hungSrc = src;
    if (img) img.src = src;
    cropImgs.forEach((cropImg) => (cropImg.src = src));
    settle({ animate });
  }

  // Load the url off-DOM; resolves true only if it loads AND no newer probe began.
  function probe(src) {
    const token = ++probeToken;
    return new Promise((resolve) => {
      const test = new Image();
      test.onload = () => resolve(token === probeToken);
      test.onerror = () => resolve(false);
      test.src = src;
    });
  }

  // Debounced candidate set (typing). onResult fires with { empty, live, url }.
  function setImage(rawUrl, { onResult } = {}) {
    clearTimeout(debounceTimer);
    const url = cleanUrl(rawUrl);
    if (!url) {
      probeToken += 1; // cancel any in-flight probe
      empty();
      if (onResult) onResult({ empty: true, live: false });
      return;
    }
    debounceTimer = setTimeout(async () => {
      const live = await probe(url);
      if (live) hang(url, { animate: true });
      if (onResult) onResult({ empty: false, live, url });
    }, IMAGE_DEBOUNCE_MS);
  }

  // Submit path: probe now (no debounce), return liveness.
  async function probeNow(rawUrl) {
    clearTimeout(debounceTimer);
    const url = cleanUrl(rawUrl);
    if (!url) return { empty: true, live: false };
    const live = await probe(url);
    if (live) hang(url, { animate: true });
    return { empty: false, live, url };
  }

  // Edit arrival: the work already hangs — fill the caption and show it without the drop.
  function prefill(values, rawUrl) {
    update(values);
    const url = cleanUrl(rawUrl);
    if (url) hang(url, { animate: false });
  }

  function empty() {
    probeToken += 1; // cancel any in-flight probe
    hungSrc = "";
    if (frame) frame.classList.remove("hung", "drop");
    if (crops) crops.classList.remove("show");
    if (img) img.removeAttribute("src");
    cropImgs.forEach((cropImg) => cropImg.removeAttribute("src"));
  }

  function destroy() {
    clearTimeout(debounceTimer);
    probeToken += 1;
  }

  return { update, setImage, probeNow, prefill, empty, destroy };
}
