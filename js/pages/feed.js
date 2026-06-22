// Home / artworks feed
// One fetch drives the four states (loading / ready / empty / error); the pure shaping lives in artworks.js, the state visuals in ui.js, the chrome behaviour in nav.js.

import { initNav } from "../nav.js";
import { getArtworks } from "../api.js";
import {
  errorToMessage,
  renderSkeletonGrid,
  renderError,
  renderEmpty,
  guardImage,
  setStatus,
} from "../ui.js";
import { formatYear } from "../format.js";
import {
  usableArtworks,
  splitSections,
  topMediums,
  deriveCounts,
  assignPlacement,
  artworkAlt,
  mediumHref,
  secureImageUrl,
  FEED_PATTERN,
  DARK_PATTERN,
} from "../artworks.js";

// The pool is a single page (see the API probe); fetch it whole so the medium list and the register count the real archive, then display the lead + grids.
const FEED_LIMIT = 100;
const FETCH_TIMEOUT_MS = 15000; // a hung request falls to the error state
const STATES = ["is-loading", "is-ready", "is-empty", "is-error"];
const SVG_NS = "http://www.w3.org/2000/svg";
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const els = {
  body: document.body,
  hero: document.getElementById("hero"),
  grid: document.getElementById("feed-grid"),
  status: document.getElementById("feed-status"),
  state: document.getElementById("feed-state"),
  darkGrid: document.getElementById("dark-grid"),
  mediums: document.getElementById("medium-list"),
  register: document.getElementById("register"),
  drift: document.getElementById("drift"),
};

let controller = null;

initNav();
initScroll();
load();

async function load() {
  controller?.abort();
  controller = new AbortController();
  const request = controller; // capture so the timeout aborts this request only
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    request.abort();
  }, FETCH_TIMEOUT_MS);
  showLoading();
  try {
    const { data, meta } = await getArtworks({
      sort: "created",
      sortOrder: "desc",
      limit: FEED_LIMIT,
      signal: request.signal,
    });
    const usable = usableArtworks(data);
    if (!usable.length) return showEmpty();
    renderPage(usable, meta);
    setState("ready");
    // observe only once the editorial sections are visible (is-ready); an IntersectionObserver set on display:none elements won't reliably re-fire
    observeReveals();
  } catch (error) {
    if (timedOut) {
      return showError({
        message: "The archive took too long to answer.",
        sub: "Check your connection and try again.",
      });
    }
    const feedback = errorToMessage(error);
    if (feedback.ignore) return; // aborted by a newer request it owns the UI
    showError(feedback);
  } finally {
    clearTimeout(timeout);
  }
}

/* ---- states ---- */

function setState(name) {
  els.body.classList.remove(...STATES);
  els.body.classList.add(`is-${name}`);
}

function showLoading() {
  setState("loading");
  els.state.replaceChildren();
  els.hero.replaceChildren(skeletonHero());
  els.hero.setAttribute("aria-busy", "true");
  renderSkeletonGrid(els.grid, { count: FEED_PATTERN.length });
  els.grid.setAttribute("aria-busy", "true");
  setStatus(els.status, { state: "busy", message: "gathering the works…" });
}

function showEmpty() {
  setState("empty");
  renderEmpty(els.state, {
    message: "Nothing hangs here — yet.",
    sub: "The archive is waiting for its first works.",
    action: { label: "add an artwork", href: "account/login.html?from=create" },
  });
}

function showError({ message, sub }) {
  setState("error");
  renderError(els.state, { message, sub: sub ?? "", onRetry: load });
}

/* ---- render ---- */

function renderPage(usable, meta) {
  const { featured, feed, dark } = splitSections(usable);
  renderHero(featured);
  wireConnections(featured);
  renderGrid(els.grid, feed, FEED_PATTERN);
  renderGrid(els.darkGrid, dark, DARK_PATTERN);
  renderMediums(topMediums(usable, 5));
  renderRegister(deriveCounts(usable, meta?.totalCount));
  renderDrift([featured, ...feed, ...dark].filter(Boolean));
  setStatus(els.status, { state: "idle", message: "" });
}

// The archive's cover - a bundled public-domain Nordic work, shown honestly (real attribution, a "browse" CTA, no live-artwork id) when the pool can't supply a usable hero or the featured work's image is dead.
// Source: "Winter Night in the Mountains" (Harald Sohlberg, 1914), public
// domain — Wikimedia Commons:
// https://commons.wikimedia.org/wiki/File:Harald_Sohlberg_-_Winter_Night_in_the_Mountains_-_Google_Art_Project.jpg
const HERO_COVER = {
  cover: true,
  title: "Vinternatt i Rondane",
  artist: "Harald Sohlberg",
  medium: "painting",
  year: 1914,
  image: {
    url: "assets/img/hero-cover.webp",
    alt: "Winter Night in the Mountains by Harald Sohlberg — blue mountains under a starlit sky",
  },
};

function renderHero(featured) {
  const work = featured ?? HERO_COVER;
  const isCover = work.cover === true;
  els.hero.classList.toggle("hero--cover", isCover);
  els.hero.removeAttribute("aria-busy");

  const img = new Image();
  img.src = secureImageUrl(work.image.url);
  img.alt = artworkAlt(work);
  img.loading = "eager";
  img.setAttribute("fetchpriority", "high");
  img.addEventListener(
    "error",
    () => {
      // a dead featured image swaps to the bundled cover; the cover itself shouldn't fail (it's local) — if it does, drop to its ink ground
      if (isCover) img.remove();
      else renderHero(HERO_COVER);
    },
    { once: true }
  );

  const row = el("div", "herorow");
  // a <p>, not the <h1>: the page's heading is the stable site-name h1 in the shell, so the hero's title is display type, present in the ready state but never the sole heading
  const title = el("p", "hero-title");
  title.textContent = work.title;
  const twin = el("span", "hero-title heroink");
  twin.setAttribute("aria-hidden", "true");
  twin.textContent = work.title;
  row.append(title, twin);

  const info = el("div", "hero-card");
  const pill = el("span", "pill");
  pill.textContent = heroPill(work, isCover ? "the cover" : "featured");
  const artist = el("div", "artist");
  artist.textContent = work.artist ?? "";
  const cta = el("a", "cta");
  if (isCover) {
    cta.href = "collection.html";
    cta.append("browse the archive ", icon("i-arrow-right"));
  } else {
    cta.href = artworkHref(work.id);
    cta.append("view artwork ", icon("i-arrow-right"));
  }
  info.append(pill, artist, cta);

  els.hero.replaceChildren(img, row, info);
}

function heroPill(work, lead) {
  return [lead, String(work.medium ?? "").trim(), formatYear(work.year)]
    .filter(Boolean)
    .join(" · ");
}

// the dark-room threshold's "explore connections" arrow leads to the featured work's constellation on its detail page — a real ?id=, like the cards
function wireConnections(featured) {
  const link = document.querySelector(".threshold .arrow");
  if (link && featured?.id) {
    link.href = `${artworkHref(featured.id)}#connections`;
  }
}

function renderGrid(container, works, pattern) {
  container.removeAttribute("aria-busy");
  const fragment = document.createDocumentFragment();
  for (const { item, slot } of assignPlacement(works, pattern)) {
    fragment.appendChild(card(item, slot));
  }
  container.replaceChildren(fragment);
}

function card(work, slot) {
  const figure = el("figure", "card r");
  figure.style.gridColumn = `${slot.col} / span ${slot.span}`;
  figure.style.marginTop = `${slot.mt}px`;
  figure.style.setProperty("--card-ratio", String(slot.ratio));

  const link = el("a", "cardlink");
  link.href = artworkHref(work.id);

  const wrap = el("div", "imgwrap");
  const img = new Image();
  img.src = secureImageUrl(work.image.url);
  img.alt = artworkAlt(work);
  img.loading = "lazy";
  guardImage(img, { title: work.title });
  wrap.appendChild(img);

  const caption = el("figcaption");
  const year = formatYear(work.year);
  caption.append(year ? `${work.title}, ${year}` : work.title, el("br"));
  const byline = el("span", "a");
  byline.textContent = [work.artist, work.medium]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" · ");
  caption.append(byline, el("br"));
  const view = el("span", "view");
  view.setAttribute("aria-hidden", "true");
  view.append("view artwork ", icon("i-arrow-right"));
  caption.append(view);

  // the link wraps only the image;
  // the figcaption is a direct child of the figure (spec-valid — figcaption can't live inside the <a>)
  link.appendChild(wrap);
  figure.append(link, caption);
  return figure;
}

function renderMediums(rows) {
  const fragment = document.createDocumentFragment();
  for (const { medium, count, sample } of rows) {
    const row = el("a", "row r");
    row.href = mediumHref(medium);
    // the visible text reads "Painting 12"; name the link in full for AT
    row.setAttribute("aria-label", `${medium} — ${count} ${count === 1 ? "work" : "works"}`);
    const url = sample?.image?.url;
    if (url) {
      const img = new Image();
      img.src = secureImageUrl(url);
      img.alt = "";
      img.loading = "lazy";
      img.addEventListener("error", () => img.remove(), { once: true });
      row.appendChild(img);
    }
    row.append(medium);
    const sup = el("sup");
    sup.textContent = String(count);
    row.appendChild(sup);
    fragment.appendChild(row);
  }
  els.mediums.replaceChildren(fragment);
}

function renderRegister({ artworks, artists, mediums }) {
  const plus = el("sup");
  plus.textContent = "+";
  els.register.replaceChildren(
    String(artworks),
    plus,
    ` artworks · ${artists} artists · ${mediums} mediums`
  );
}

// the drift wall reuses the already-loaded works (cached images), duplicated so the -50% translate loops seamlessly; decorative, so alt is empty
const DRIFT_SIZES = [
  { h: 140, mt: 20 },
  { h: 180, mt: 45 },
  { h: 115, mt: 35 },
  { h: 160, mt: 65 },
  { h: 125, mt: 10 },
  { h: 170, mt: 50 },
  { h: 100, mt: 110 },
  { h: 165, mt: 25 },
  { h: 135, mt: 60 },
  { h: 150, mt: 5 },
  { h: 115, mt: 80 },
];

function renderDrift(works) {
  if (!els.drift || !works.length) return;
  const fragment = document.createDocumentFragment();
  [...works, ...works].forEach((work, index) => {
    const size = DRIFT_SIZES[index % DRIFT_SIZES.length];
    const img = new Image();
    img.src = secureImageUrl(work.image.url);
    img.alt = "";
    img.loading = "lazy";
    img.style.height = `${size.h}px`;
    img.style.marginTop = `${size.mt}px`;
    img.addEventListener("error", () => img.remove(), { once: true });
    fragment.appendChild(img);
  });
  els.drift.replaceChildren(fragment);
}

function skeletonHero() {
  const sk = el("div", "skhero skeleton");
  sk.setAttribute("aria-hidden", "true");
  return sk;
}

function observeReveals() {
  const nodes = document.querySelectorAll(".r:not(.in)");
  if (prefersReducedMotion) {
    nodes.forEach((node) => node.classList.add("in"));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.18 }
  );
  nodes.forEach((node, index) => {
    node.style.transitionDelay = `${(index % 3) * 90}ms`;
    observer.observe(node);
  });
}

/* ---- scroll-coupled motion ---- */

function initScroll() {
  const head = document.querySelector(".site-head");
  const sun = document.querySelector(".yellow");
  const darkStart = document.getElementById("dark-start");
  const darkEnd = document.getElementById("dark-end");

  // the body flip; the home's one dark room, between the two sentinels
  function flip() {
    if (!darkStart || !darkEnd) return;
    const start = darkStart.getBoundingClientRect().top;
    const end = darkEnd.getBoundingClientRect().top;
    const mid = window.innerHeight * 0.55;
    // stay dark until the dark zone clears the top; the yellow room already covers the viewport by then, so the flip back is invisible
    els.body.classList.toggle("dark", start < mid && end > 0);
  }

  // the masthead takes ink exactly where the yellow room overlaps the bar
  function seam() {
    if (!head || !sun) return;
    const bar = head.getBoundingClientRect();
    const room = sun.getBoundingClientRect();
    const a = Math.min(Math.max(room.top - bar.top, 0), bar.height);
    const b = Math.min(Math.max(room.bottom - bar.top, 0), bar.height);
    head.style.setProperty("--sun-a", `${a.toFixed(1)}px`);
    head.style.setProperty("--sun-b", `${b.toFixed(1)}px`);
  }

  // the threshold soak
  // The over-printed echoes cross-fade level to level as the stack crosses the lower fifth of the viewport toward the flip.
  // The SVG filters never animate; only these opacities move (docs/07 §5b).
  const stack = document.getElementById("soakstack");
  const echoes = stack ? Array.from(stack.querySelectorAll(".lv.b")) : [];
  let inkTarget = 0;
  let inkBonus = 0;

  function soak() {
    if (prefersReducedMotion || !echoes.length) return;
    const rect = stack.getBoundingClientRect();
    if (rect.height === 0) return; // not shown yet (loading)
    const vh = window.innerHeight;
    // p: 0 with the stack at the lower fifth, 1 by the time it reaches the flip
    const p = Math.min(1, Math.max(0, (vh * 0.8 - rect.top) / (vh * 0.45)));
    echoes.forEach((wet, i) => {
      const lag = (echoes.length - 1 - i) * 0.25; // the lowest row floods first
      const o = Math.min(1, Math.max(0, p * 1.5 + inkBonus - lag));
      wet.style.opacity = o.toFixed(3);
      const dry = wet.previousElementSibling;
      if (dry) dry.style.opacity = (1 - o * 0.8).toFixed(3); // the strike recedes
    });
  }

  // hover presses extra ink in, eased toward the target; never a snap
  let hoverFrame = 0;
  function easeHover() {
    inkBonus += (inkTarget - inkBonus) * 0.14;
    if (Math.abs(inkTarget - inkBonus) < 0.01) inkBonus = inkTarget;
    soak();
    if (inkBonus !== inkTarget) hoverFrame = requestAnimationFrame(easeHover);
  }
  if (stack && !prefersReducedMotion) {
    const nudge = (target) => {
      inkTarget = target;
      cancelAnimationFrame(hoverFrame);
      hoverFrame = requestAnimationFrame(easeHover);
    };
    stack.addEventListener("mouseenter", () => nudge(0.35));
    stack.addEventListener("mouseleave", () => nudge(0));
  }

  // one rAF-throttled handler for every scroll-coupled effect on the page
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      flip();
      seam();
      soak();
      ticking = false;
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  flip();
  seam();
  soak();
}

/* ---- dom helpers ---- */

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function icon(id) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "i");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `#${id}`);
  svg.appendChild(use);
  return svg;
}

function artworkHref(id) {
  return `artwork/index.html?id=${encodeURIComponent(id)}`;
}
