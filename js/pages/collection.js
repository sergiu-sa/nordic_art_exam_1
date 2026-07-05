// Collection / all artworks.
// One resilient fetch, then everything is client-side: search, medium chips, the  grid/index toggle, and load-more all re-slice the same fetched pool (the API has no search endpoint).
// Pure shaping lives in collection.js, state visuals in ui.js, chrome behaviour in nav.js.

import { initNav } from "../nav.js";
import { getAllArtworks } from "../api.js";
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
  sortByCreatedDesc,
  usableArtworks,
  topMediums,
  assignPlacement,
  artworkAlt,
  secureImageUrl,
} from "../artworks.js";
import {
  filterArtworks,
  topArtists,
  distinctArtistCount,
  sortByYearAsc,
  splitRooms,
  drawCollage,
  LIGHT_PATTERN,
  DARK_PATTERN,
  OVERFLOW_PATTERN,
} from "../collection.js";

const PAGE_SIZE = 12;
const FETCH_TIMEOUT_MS = 15000; // a hung request falls to the error state
const INITIAL_REVEAL = LIGHT_PATTERN.length + DARK_PATTERN.length; // the walk's first hang
const REVEAL_STEP = 12;
const SEARCH_DEBOUNCE_MS = 300;
const COUNT_UP_MS = 850;
const HAND_LIMIT = 5;
const SKELETON_COUNT = 6;
const STATES = ["is-loading", "is-ready", "is-empty", "is-error"];
const SVG_NS = "http://www.w3.org/2000/svg";
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// the orbit's five fixed hanging positions (the prototype's composition)
const HAND_SLOTS = [
  { left: "9%", top: "7%" },
  { left: "71%", top: "4%" },
  { left: "5%", top: "64%" },
  { left: "76%", top: "58%" },
  { left: "39%", top: "81%" },
];

const els = {
  body: document.body,
  state: document.getElementById("collection-state"),
  status: document.getElementById("collection-status"),
  intro: document.getElementById("intro"),
  crumbs: document.querySelector(".crumbs"),
  total: document.getElementById("total"),
  search: document.getElementById("search"),
  chips: document.getElementById("chips"),
  viewGrid: document.getElementById("v-grid"),
  viewIndex: document.getElementById("v-index"),
  gridview: document.getElementById("gridview"),
  lightGrid: document.getElementById("light-grid"),
  threshold: document.querySelector(".threshold"),
  darkStart: document.getElementById("dark-start"),
  inkstretch: document.querySelector(".inkstretch"),
  darkGrid: document.getElementById("dark-grid"),
  byhand: document.getElementById("byhand"),
  overflowGrid: document.getElementById("overflow-grid"),
  hands: document.getElementById("hands"),
  wanderplaque: document.getElementById("wanderplaque"),
  morehands: document.getElementById("morehands"),
  indexview: document.getElementById("indexview"),
  indexList: document.querySelector("#indexview ol"),
  empty: document.getElementById("empty"),
  gridfoot: document.querySelector(".gridfoot"),
  count: document.querySelector(".gridfoot .count"),
  shown: document.getElementById("shown"),
  of: document.getElementById("of"),
  bar: document.getElementById("bar"),
  shortfall: document.getElementById("shortfall"),
  loadmore: document.getElementById("loadmore"),
  darkEnd: document.getElementById("dark-end"),
};

// One pool, one state object — every control re-renders from here.
const state = {
  pool: [],
  totalCount: 0,
  loadedCount: 0,
  query: "",
  medium: "all",
  view: "grid",
  revealed: INITIAL_REVEAL,
};

let controller = null;
let onScrollFrame = () => {};
let scrubIntro = () => {};
let landP = 0;
let revealedOnce = false;

initNav();
initScroll();
initToolbar();
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
    const { data, meta } = await getAllArtworks({ pageSize: PAGE_SIZE, signal: request.signal });
    state.pool = usableArtworks(sortByCreatedDesc(data));
    state.loadedCount = data.length;
    state.totalCount = Number.isFinite(meta?.totalCount) ? meta.totalCount : state.pool.length;
    if (!state.pool.length) return showEmpty();
    renderPage();
    setState("ready");
    buildThreads(); // the orbit only has real boxes once the page is visible
    landCollage();
    honourSearchHash();
  } catch (error) {
    if (timedOut) {
      return showError({
        message: "The archive took too long to answer.",
        sub: "Check your connection and try again.",
      });
    }
    const feedback = errorToMessage(error);
    if (feedback.ignore) return; // aborted by a newer request that owns the UI
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
  renderSkeletonGrid(els.lightGrid, { count: SKELETON_COUNT });
  els.lightGrid.setAttribute("aria-busy", "true");
  setStatus(els.status, { state: "busy", message: "gathering the collection…" });
}

function showEmpty() {
  setState("empty");
  setStatus(els.status, { state: "idle", message: "" }); // never leave "gathering…" standing
  renderEmpty(els.state, {
    message: "Nothing hangs here — yet.",
    sub: "The archive is waiting for its first works.",
    action: { label: "add an artwork", href: "account/login.html?from=create" },
  });
}

function showError({ message, sub }) {
  setState("error");
  setStatus(els.status, { state: "idle", message: "" }); // the alert block speaks; the status line must not
  renderError(els.state, { message, sub: sub ?? "", onRetry: load });
}

/* ---- render (once per load) ---- */

function renderPage() {
  renderTotal();
  renderChips();
  renderHands();
  renderCollage();
  els.shortfall.hidden = state.loadedCount >= state.totalCount;
  const preset = new URLSearchParams(location.search).get("medium");
  if (preset) setMedium(preset);
  else applyFilters();
  setStatus(els.status, { state: "idle", message: "" });
}

// the count ticks up — "always growing"; instant under reduced motion
function renderTotal() {
  const end = state.totalCount;
  // one settled name for AT — the sup glues onto the title and the tick would chatter
  els.total.closest("h1").setAttribute("aria-label", `all artworks — ${end} in the archive`);
  if (prefersReducedMotion) {
    els.total.textContent = String(end);
    return;
  }
  const t0 = performance.now();
  const tick = (t) => {
    const p = Math.min((t - t0) / COUNT_UP_MS, 1);
    els.total.textContent = String(Math.round(end * p));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// every medium value, raw, with counts over the loaded usable pool
// The live vocabulary runs to 20+ values, so the row keeps the prototype's balance: all + the top five by count, with the long tail behind a quiet "…N more mediums" fold (the orbit's own "…more hands" gesture).
// The active chip is never folded away.
const TOP_CHIP_COUNT = 5;
let chipsExpanded = false;

function renderChips() {
  const rows = topMediums(state.pool, Infinity);
  const top = rows.slice(0, TOP_CHIP_COUNT);
  const tail = rows.slice(TOP_CHIP_COUNT);

  const fragment = document.createDocumentFragment();
  fragment.appendChild(chip("all", state.pool.length, "all"));
  for (const { medium, count } of top) fragment.appendChild(chip(medium, count, medium));
  if (chipsExpanded) {
    for (const { medium, count } of tail) fragment.appendChild(chip(medium, count, medium));
  } else {
    const active = tail.find(({ medium }) => medium === state.medium);
    if (active) fragment.appendChild(chip(active.medium, active.count, active.medium));
  }

  if (tail.length) {
    const toggle = el("button", "morechips");
    toggle.type = "button";
    toggle.id = "morechips";
    toggle.setAttribute("aria-expanded", String(chipsExpanded));
    toggle.setAttribute("aria-controls", "chips");
    toggle.textContent = chipsExpanded
      ? "…fewer mediums"
      : `…${tail.length} more ${tail.length === 1 ? "medium" : "mediums"}`;
    toggle.addEventListener("click", () => {
      chipsExpanded = !chipsExpanded;
      renderChips();
      els.chips.querySelector(".morechips")?.focus();
    });
    fragment.appendChild(toggle);
  }
  els.chips.replaceChildren(fragment);
}

function chip(label, count, medium) {
  const btn = el("button", "chip tickbtn");
  btn.type = "button";
  btn.dataset.medium = medium;
  btn.setAttribute("aria-pressed", String(medium === state.medium));
  // the visible text reads "painting12"; name the button in full for AT (the home's rule)
  btn.setAttribute("aria-label", `${label} — ${count} ${count === 1 ? "work" : "works"}`);
  btn.append(label);
  const sup = el("sup");
  sup.textContent = String(count);
  btn.appendChild(sup);
  return btn;
}

// 03 — the hands' orbit: top artists as ways back in, the wanderer as the hub
function renderHands() {
  els.hands.querySelectorAll(".node").forEach((node) => node.remove()); // a retried load re-hangs cleanly
  const rows = topArtists(state.pool, HAND_LIMIT);
  const fragment = document.createDocumentFragment();
  rows.forEach(({ artist, count }, index) => {
    const node = el("div", "node");
    const slot = HAND_SLOTS[index % HAND_SLOTS.length];
    node.style.left = slot.left;
    node.style.top = slot.top;
    const card = el("button", "hcard");
    card.type = "button";
    card.dataset.artist = artist;
    card.setAttribute(
      "aria-label",
      `${artist} — ${count} ${count === 1 ? "work" : "works"}, see theirs`
    );
    const name = el("span", "hname");
    name.append(artist);
    const sup = el("sup");
    sup.textContent = String(count);
    name.appendChild(sup);
    const go = el("span", "hgo");
    go.append("their works ", icon("i-arrow-right"));
    card.append(name, go);
    node.appendChild(card);
    fragment.appendChild(node);
  });
  els.hands.appendChild(fragment);

  // the wanderer: a random work from the room (a fresh pick every visit)
  const wander = state.pool[Math.floor(Math.random() * state.pool.length)];
  if (wander?.id) els.wanderplaque.href = artworkHref(wander.id);

  const more = distinctArtistCount(state.pool) - rows.length;
  if (more > 0) {
    els.morehands.replaceChildren(
      `…${more} more ${more === 1 ? "hand" : "hands"} — search them `,
      icon("i-arrow-right")
    );
  } else {
    els.morehands.closest(".handsfoot").hidden = true;
  }
}

// the wall rehangs itself: the six slots keep their composition, the works filling them shuffle per visit
function renderCollage() {
  const imgs = [...els.intro.querySelectorAll("img")];
  const drawn = drawCollage(state.pool, { slots: imgs.length });
  imgs.forEach((img, index) => {
    const work = drawn[index];
    if (!work) {
      img.remove();
      return;
    }
    img.src = secureImageUrl(work.image.url);
    img.addEventListener("error", () => img.remove(), { once: true });
  });
}

/* ---- the one filter pass ---- */

function currentMatches() {
  return filterArtworks(state.pool, { query: state.query, medium: state.medium });
}

function applyFilters({ keepReveal = false } = {}) {
  if (!keepReveal) state.revealed = INITIAL_REVEAL;
  const matches = currentMatches();
  const visible = matches.slice(0, state.revealed);

  const none = matches.length === 0;
  // re-write the line on the way in so the status region has a fresh mutation to announce (the count line — the page's other live region — hides with the foot)
  if (none && els.empty.hidden) {
    const line = els.empty.querySelector(".line");
    line.replaceChildren("Nothing hangs here — ", Object.assign(el("em"), { textContent: "yet." }));
  }
  els.empty.hidden = !none;
  els.gridfoot.hidden = none;
  els.gridview.hidden = none || state.view !== "grid";
  els.indexview.hidden = none || state.view !== "index";

  const { light, dark, overflow } = splitRooms(visible);
  renderGrid(els.lightGrid, light, LIGHT_PATTERN);
  renderGrid(els.darkGrid, dark, DARK_PATTERN);
  renderGrid(els.overflowGrid, overflow, OVERFLOW_PATTERN);
  updateDarkSuite(none);

  renderIndex(sortByYearAsc(visible));
  renderFoot(visible.length, matches.length);
  // the rise plays once, on arrival; filter re-renders and load-more slot works straight in
  if (revealedOnce) {
    document.querySelectorAll(".r:not(.in)").forEach((node) => node.classList.add("in"));
  } else {
    observeReveals();
    revealedOnce = true;
  }
  onScrollFrame(); // re-judge the flip and soak against the new layout
}

// Load-more appends — it never rebuilds what's already hanging.
// A rebuild destroys the browser's scroll anchor and re-mounts every image, which reads as the page reloading under the visitor.
// INITIAL_REVEAL fills the daylight and the designed dark hang exactly, so everything load-more reveals joins the overflow past the exit seam.
function revealMore() {
  const matches = currentMatches();
  const already = Math.min(state.revealed, matches.length);
  state.revealed += REVEAL_STEP;
  const fresh = matches.slice(already, state.revealed);
  if (!fresh.length) return;

  renderFoot(Math.min(state.revealed, matches.length), matches.length);

  if (state.view === "grid") {
    const start = els.overflowGrid.children.length;
    const fragment = document.createDocumentFragment();
    fresh.forEach((work, index) => {
      fragment.appendChild(card(work, OVERFLOW_PATTERN[(start + index) % OVERFLOW_PATTERN.length]));
    });
    els.overflowGrid.appendChild(fragment);
    observeReveals(); // the appended works rise as the visitor reaches them the walk continues from the seam:
    // the new works begin where the eye was, and focus follows the content so keyboard/AT read on from the first new work instead of a button that just moved a screenful away
    els.overflowGrid.children[start]?.querySelector("a")?.focus({ preventScroll: true });
  } else {
    // the register stays chronological, so new works interleave — rebuild it (fixed-height rows, so the scroll position holds; focus keeps the foot)
    renderIndex(sortByYearAsc(matches.slice(0, state.revealed)));
    observeReveals();
    if (els.loadmore.hidden) els.count.focus();
  }
  onScrollFrame();
}

// the dark suite lives and dies together: threshold, room, and the orbit.
// The orbit sits outside #gridview (after the list's foot), so it minds the view and the no-results state itself.
function updateDarkSuite(none) {
  const darkAlive = els.darkGrid.children.length > 0 && !none;
  els.threshold.hidden = !darkAlive;
  els.inkstretch.hidden = !darkAlive;
  const orbitWasHidden = els.byhand.hidden;
  els.byhand.hidden = !darkAlive || state.view !== "grid";
  // thread anchors go stale while the orbit is display:none — re-pin on return
  if (orbitWasHidden && !els.byhand.hidden) buildThreads();
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

  // the link wraps only the image; figcaption stays a direct child of the figure
  link.appendChild(wrap);
  figure.append(link, caption);
  return figure;
}

// the register: the same works read chronologically, oldest first
function renderIndex(works) {
  const fragment = document.createDocumentFragment();
  for (const work of works) {
    const item = el("li");
    const row = el("a", "irow r");
    row.href = artworkHref(work.id);
    const year = formatYear(work.year);
    const byline = [work.artist, work.medium]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .join(" · ");
    // the sup year glues onto the title visually; name the link in full for AT
    row.setAttribute(
      "aria-label",
      [year ? `${work.title}, ${year}` : work.title, byline].filter(Boolean).join(" — ")
    );
    const thumb = new Image();
    thumb.className = "ithumb";
    thumb.src = secureImageUrl(work.image.url);
    thumb.alt = "";
    thumb.loading = "lazy";
    thumb.addEventListener("error", () => thumb.remove(), { once: true });
    row.appendChild(thumb);
    const title = el("span", "it");
    title.append(work.title);
    if (year) {
      const sup = el("sup", "iy");
      sup.textContent = year;
      title.appendChild(sup);
    }
    row.appendChild(title);
    const bylineEl = el("span", "ia");
    bylineEl.textContent = byline;
    row.appendChild(bylineEl);
    item.appendChild(row);
    fragment.appendChild(item);
  }
  els.indexList.replaceChildren(fragment);
}

// counts stay honest: X of Y where Y is what the current filter can actually show from the loaded pool — never meta.totalCount
function renderFoot(shown, matching) {
  els.shown.textContent = String(shown);
  els.of.textContent = String(matching);
  els.bar.style.width = `${matching ? Math.round((shown / matching) * 100) : 0}%`;
  els.loadmore.hidden = shown >= matching;
}

/* ---- toolbar + controls ---- */

function initToolbar() {
  let debounce = 0;
  const applySearch = () => {
    state.query = els.search.value;
    applyFilters();
  };
  els.search.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(applySearch, SEARCH_DEBOUNCE_MS);
  });
  // the native clear (the field's ✕) fires "search" — apply at once
  els.search.addEventListener("search", () => {
    clearTimeout(debounce);
    applySearch();
  });

  els.chips.addEventListener("click", (event) => {
    const btn = event.target.closest(".chip");
    if (!btn) return;
    const medium = btn.dataset.medium;
    setMedium(medium);
    // setMedium re-renders the row (the fold), replacing the pressed node — re-seat focus
    els.chips.querySelector(`.chip[data-medium="${CSS.escape(medium)}"]`)?.focus();
  });

  els.viewGrid.addEventListener("click", () => setView("grid"));
  els.viewIndex.addEventListener("click", () => setView("index"));

  document.getElementById("reset").addEventListener("click", () => {
    els.search.value = "";
    state.query = "";
    setMedium("all");
    els.search.focus({ preventScroll: true });
  });

  // a hand is a way back in: clicking searches the room for that artist
  els.hands.addEventListener("click", (event) => {
    const hand = event.target.closest(".hcard");
    if (!hand) return;
    els.search.value = hand.dataset.artist;
    state.query = hand.dataset.artist;
    applyFilters();
    focusSearch();
  });
  els.morehands.addEventListener("click", focusSearch);

  els.loadmore.addEventListener("click", revealMore);
}

// an unknown ?medium= deep link still applies (no chip lights up)
// the honest result is the no-results state, which offers the way out.
// The row re-renders so a folded-tail pick surfaces its chip and a stale pin drops.
function setMedium(medium) {
  state.medium = medium;
  renderChips();
  for (const btn of els.chips.querySelectorAll(".chip")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.medium === medium));
  }
  applyFilters();
}

function setView(view) {
  state.view = view;
  els.viewGrid.setAttribute("aria-pressed", String(view === "grid"));
  els.viewIndex.setAttribute("aria-pressed", String(view === "index"));
  applyFilters({ keepReveal: true });
  // threads built while #gridview was display:none anchored on 0-boxes — re-pin
  if (view === "grid") buildThreads();
}

function focusSearch() {
  els.search.focus({ preventScroll: true });
  els.search.scrollIntoView({ block: "center" });
}

// the masthead search icon on every page lands here: #search focuses the field
function honourSearchHash() {
  if (location.hash === "#search") focusSearch();
}

/* ---- scroll-coupled motion ---- */

function initScroll() {
  // the body flip; the collection's one dark room ends the walk — the flip back happens behind the ink footer.
  // Suppressed when filters kill the dark suite and in index view (the register never flips).
  function flip() {
    if (!els.darkStart || !els.darkEnd) return;
    // no flip outside the ready walk: not on the skeleton/error screens, not in index view, not when filters killed the dark room
    if (
      !els.body.classList.contains("is-ready") ||
      state.view === "index" ||
      els.inkstretch.hidden ||
      els.gridview.hidden
    ) {
      els.body.classList.remove("dark");
      return;
    }
    const start = els.darkStart.getBoundingClientRect().top;
    const end = els.darkEnd.getBoundingClientRect().top;
    const mid = window.innerHeight * 0.55;
    els.body.classList.toggle("dark", start < mid && end > 0);
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
    if (rect.height === 0) return; // not shown yet (loading, or a filtered-out dark room)
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

  // the collage exits up and to the right from the first scroll, paced to the page head's rise (~0.8 viewport); the crumbs fade in the moment it moves
  const introImgs = els.intro ? [...els.intro.querySelectorAll("img")] : [];
  function introScrub() {
    if (prefersReducedMotion || !introImgs.length) return;
    const ps = Math.min(window.scrollY / (window.innerHeight * 0.8), 1);
    const p = Math.max(ps, landP);
    for (const img of introImgs) {
      if (!img.isConnected) continue; // a dead image dropped out of the wall
      img.style.transform = `translate(${p * img.dataset.sx * 100}vw, ${
        p * (img.dataset.sy || 0) * 100
      }vh)`;
    }
    els.crumbs?.classList.toggle("vis", ps > 0.06);
  }

  // one rAF-throttled handler for every scroll-coupled effect on the page
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      flip();
      soak();
      introScrub();
      ticking = false;
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  flip();
  soak();

  // exposed so applyFilters can re-judge the flip after a re-render
  onScrollFrame = () => {
    flip();
    soak();
    introScrub();
  };
  scrubIntro = introScrub;
}

// on load the works arrive the way they will leave
// the scroll exit played backwards through the same placement math, all pieces at once (~2.2s, the last small drift home slowly);
// max(landing, scroll) hands over mid-entrance
function landCollage() {
  if (prefersReducedMotion) return;
  landP = 0.12;
  scrubIntro();
  const t0 = performance.now();
  const landIn = (t) => {
    const k = Math.min((t - t0) / 2200, 1);
    landP = 0.12 * (1 - k) * (1 - k);
    scrubIntro();
    if (k < 1) requestAnimationFrame(landIn);
  };
  requestAnimationFrame(landIn);
}

/* ---- the hands' orbit threads ---- */

const threadState = { threads: [], drawn: false };

function edgePoint(rect, toward, base) {
  const cx = rect.left + rect.width / 2 - base.left;
  const cy = rect.top + rect.height / 2 - base.top;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  const t = 1 / Math.max(Math.abs(dx) / (rect.width / 2 + 6), Math.abs(dy) / (rect.height / 2 + 6));
  return { x: cx + dx * t, y: cy + dy * t };
}

function buildThreads() {
  const svg = els.hands?.querySelector(".lines");
  if (!svg) return;
  const sats = [...els.hands.querySelectorAll(".node")];
  sats.forEach((n) => {
    n.style.transform = "none";
  });
  const base = els.hands.getBoundingClientRect();
  // bail on hidden / 0-size content (a filtered-out orbit) — anchoring threads on a 0-box floods NaN coords
  if (getComputedStyle(svg).display === "none" || base.width === 0 || base.height === 0) {
    threadState.threads = [];
    svg.replaceChildren();
    return;
  }
  svg.setAttribute("viewBox", `0 0 ${base.width} ${base.height}`);
  const hubBox = els.wanderplaque.getBoundingClientRect();
  const hubC = {
    x: hubBox.left + hubBox.width / 2 - base.left,
    y: hubBox.top + hubBox.height / 2 - base.top,
  };
  svg.replaceChildren();
  threadState.threads = sats.map((node, i) => {
    const box = node.querySelector(".hcard").getBoundingClientRect();
    const satC = {
      x: box.left + box.width / 2 - base.left,
      y: box.top + box.height / 2 - base.top,
    };
    const a = edgePoint(hubBox, satC, base);
    const b = edgePoint(box, hubC, base);
    const line = document.createElementNS(SVG_NS, "line");
    const dotA = document.createElementNS(SVG_NS, "circle");
    const dotB = document.createElementNS(SVG_NS, "circle");
    dotA.setAttribute("r", "2");
    dotB.setAttribute("r", "2");
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    line.style.strokeDasharray = len;
    line.style.strokeDashoffset = threadState.drawn ? 0 : len;
    line.style.transition = `stroke-dashoffset 0.9s ease ${0.15 + i * 0.12}s`;
    for (const dot of [dotA, dotB]) {
      dot.style.opacity = threadState.drawn ? 1 : 0;
      dot.style.transition = `opacity 0.5s ease ${0.7 + i * 0.12}s`;
    }
    svg.append(line, dotA, dotB);
    return {
      node,
      line,
      dotA,
      dotB,
      a,
      b,
      phase: i * 1.7,
      speed: 0.55 + (i % 3) * 0.18,
      amp: 6 + (i % 2) * 3,
    };
  });
  paintThreads(0);
}

function paintThreads(t) {
  for (const th of threadState.threads) {
    const dy = prefersReducedMotion ? 0 : Math.sin(t * th.speed + th.phase) * th.amp;
    th.node.style.transform = dy ? `translateY(${dy}px)` : "none";
    th.line.setAttribute("x1", th.a.x);
    th.line.setAttribute("y1", th.a.y);
    th.line.setAttribute("x2", th.b.x);
    th.line.setAttribute("y2", th.b.y + dy);
    th.dotA.setAttribute("cx", th.a.x);
    th.dotA.setAttribute("cy", th.a.y);
    th.dotB.setAttribute("cx", th.b.x);
    th.dotB.setAttribute("cy", th.b.y + dy);
  }
}

function breathe(ms) {
  paintThreads(ms / 1000);
  requestAnimationFrame(breathe);
}

if (!prefersReducedMotion) requestAnimationFrame(breathe);

let threadResize = 0;
window.addEventListener("resize", () => {
  clearTimeout(threadResize);
  threadResize = setTimeout(buildThreads, 150);
});
// anchors depend on the serif metrics — re-pin once the fonts land
if (document.fonts?.ready) document.fonts.ready.then(() => buildThreads());

const drawObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      threadState.drawn = true;
      for (const th of threadState.threads) {
        th.line.style.strokeDashoffset = 0;
        th.dotA.style.opacity = 1;
        th.dotB.style.opacity = 1;
      }
      drawObserver.disconnect();
    }
  },
  { threshold: 0.2 }
);
if (els.hands) drawObserver.observe(els.hands);

/* ---- reveals ---- */

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
