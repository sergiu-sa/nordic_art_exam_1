// Measures image natural ratios in the browser;
// a failed load marks the image dead (docs/next-session-loose-ends 2.2+2.3 — one probe serves both).
// The probe doubles as the preload: probed images render from the browser cache.
// Results persist in sessionStorage so pages share one verdict per URL per session;
// a timeout stays unknown and is never cached.

const CACHE_KEY = "naa.imageProbe";
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_CONCURRENCY = 8;

function readCache() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(CACHE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeCache(cache) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // a full or blocked store only costs re-probes
  }
}

function fromCache(entry) {
  if (entry === "dead") return { dead: true };
  if (Number.isFinite(entry) && entry > 0) return { ratio: entry };
  return null;
}

function probeOne(url, { timeoutMs, createImage }) {
  return new Promise((resolve) => {
    const img = createImage();
    const timer = setTimeout(() => resolve({ unknown: true }), timeoutMs);
    img.addEventListener(
      "load",
      () => {
        clearTimeout(timer);
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          resolve({ ratio: img.naturalWidth / img.naturalHeight });
        } else {
          resolve({ unknown: true });
        }
      },
      { once: true }
    );
    img.addEventListener(
      "error",
      () => {
        clearTimeout(timer);
        resolve({ dead: true });
      },
      { once: true }
    );
    img.src = url;
  });
}

export async function probeImages(
  urls = [],
  {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    concurrency = DEFAULT_CONCURRENCY,
    createImage = () => new Image(),
  } = {}
) {
  const results = new Map();
  const cache = readCache();
  const pending = [];
  for (const url of new Set(urls)) {
    const cached = fromCache(cache[url]);
    if (cached) results.set(url, cached);
    else pending.push(url);
  }

  let cursor = 0;
  async function worker() {
    while (cursor < pending.length) {
      const url = pending[cursor];
      cursor += 1;
      const result = await probeOne(url, { timeoutMs, createImage });
      results.set(url, result);
      if (result.dead) cache[url] = "dead";
      else if (result.ratio) cache[url] = result.ratio;
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, worker));

  if (pending.length) writeCache(cache);
  return results;
}
