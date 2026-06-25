// Artwork detail
// One primary fetch drives the four states (loading / ready / not-found / error);
// A best-effort list fetch enriches the page with related works, prev/next, and "more from the archive" without ever blocking or breaking the view.
// Pure shaping lives in artworks.js.

import { initNav } from "../nav.js";
import { getArtwork, getArtworks } from "../api.js";
import { errorToMessage, setStatus, guardImage } from "../ui.js";
import { formatYear, formatDate } from "../format.js";
import {
  usableArtworks,
  artworkAlt,
  secureImageUrl,
  relatedArtworks,
  neighbours,
  cropSet,
  introSegments,
  splitParagraphs,
  isShortDescription,
  isOwnArtwork,
} from "../artworks.js";
import { isLoggedIn } from "../auth.js";
import { getUserName } from "../session.js";

const LIST_LIMIT = 100; // the shared pool is a single page; one fetch covers related + neighbours + more
const FETCH_TIMEOUT_MS = 15000;
const STATES = ["is-loading", "is-ready", "is-notfound", "is-error"];
const SVG_NS = "http://www.w3.org/2000/svg";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HTTP_RE = /^https?:\/\//i;
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// the constellation's chaos layout — hub centre, then related works around it
const HUB_SLOT = { left: 41, top: 30, width: 170 };
const SATELLITE_SLOTS = [
  { left: 20, top: 8, width: 125 },
  { left: 83, top: 22, width: 100 },
  { left: 6, top: 56, width: 190 },
  { left: 62, top: 68, width: 145 },
];

// "more from the archive" — a 4-card chaos row reusing the shared .card
const MORE_PATTERN = [
  { col: 1, span: 3, mt: 0, ratio: 1.4 },
  { col: 5, span: 2, mt: 50, ratio: 1.18 },
  { col: 8, span: 2, mt: 14, ratio: 1.32 },
  { col: 11, span: 2, mt: 90, ratio: 0.95 },
];

const els = {
  body: document.body,
  h1: document.getElementById("art-h1"),
  crumbs: document.getElementById("crumbs"),
  status: document.getElementById("detail-status"),
  state: document.getElementById("detail-state"),
  label: document.getElementById("entry-label"),
  title: document.getElementById("art-title"),
  titleInk: document.getElementById("art-title-ink"),
  intro: document.getElementById("intro"),
  tagrow: document.getElementById("tagrow"),
  wall: document.getElementById("wall"),
  frame: document.getElementById("art-frame"),
  image: document.getElementById("art-image"),
  fullsize: document.getElementById("fullsize"),
  crops: document.getElementById("crops"),
  reading: document.getElementById("reading"),
  credit: document.getElementById("credit"),
  facts: document.getElementById("facts-dl"),
  ownerTools: document.getElementById("owner-tools"),
  editLink: document.getElementById("edit-link"),
  connzone: document.getElementById("connzone"),
  constellation: document.getElementById("constellation"),
  lines: document.getElementById("constellation-lines"),
  moreGrid: document.getElementById("more-grid"),
  prevnext: document.getElementById("prevnext"),
};

const metaDescription = document.querySelector('meta[name="description"]');
const id = new URLSearchParams(location.search).get("id");

let controller = null;

initNav();
initConnzoneTint();

// a missing or malformed id can never resolve to a work
// fail fast to the not-found state with no wasted request (the API answers a bad id with 400)
if (!id || !UUID_RE.test(id)) {
  showNotFound();
} else {
  load();
}

async function load() {
  controller?.abort();
  const request = new AbortController();
  controller = request;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    request.abort();
  }, FETCH_TIMEOUT_MS);

  showLoading();

  let work;
  try {
    work = await getArtwork(id, { signal: request.signal });
  } catch (error) {
    clearTimeout(timeout);
    if (timedOut) {
      return showError({
        message: "The archive took too long to answer.",
        sub: "Check your connection and try again.",
      });
    }
    const feedback = errorToMessage(error);
    if (feedback.ignore) return; // aborted by a newer request that owns the UI
    if (error?.status === 404 || error?.status === 400) return showNotFound();
    return showError(feedback);
  }
  clearTimeout(timeout);

  if (!work) return showNotFound();

  renderWork(work);
  setState("ready");
  observeReveals();

  // best-effort enrichment
  // related / prev-next / more never block or break the graded view;
  // if the list can't be fetched, those sections stay hidden
  getArtworks({ limit: LIST_LIMIT, signal: request.signal })
    .then(({ data }) => {
      if (request !== controller) return; // superseded by a newer load
      renderEnrichment(work, usableArtworks(data));
      observeReveals();
    })
    .catch(() => {});
}

/* ---- states ---- */

function setState(name) {
  els.body.classList.remove(...STATES);
  els.body.classList.add(`is-${name}`);
}

function showLoading() {
  setState("loading");
  els.body.classList.remove("is-noimage");
  setCrumbs();
  els.state.removeAttribute("role");
  els.state.replaceChildren();
  setStatus(els.status, { state: "busy", message: "fetching the work from the archive…" });
  setHead("Artwork", "Loading an artwork from the Nordic Art Archive.");
}

function showNotFound() {
  setState("notfound");
  els.body.classList.remove("is-noimage");
  setCrumbs();
  setStatus(els.status, { state: "idle", message: "" });
  setHead("Artwork not found", "This artwork isn’t in the Nordic Art Archive.");
  els.h1.textContent = "Artwork not found";
  renderStateMessage({
    role: "status",
    message: "This work isn’t in the archive.",
    sub: "It may have been taken down, or the link is broken.",
    actions: [{ label: "back to all artworks", href: "../collection.html", icon: "i-arrow-left" }],
  });
}

function showError({ message, sub = "" }) {
  setState("error");
  els.body.classList.remove("is-noimage");
  setCrumbs();
  setStatus(els.status, { state: "idle", message: "" });
  setHead("Artwork", "Couldn’t load this artwork from the Nordic Art Archive.");
  els.h1.textContent = "Artwork";
  renderStateMessage({
    role: "alert",
    message,
    sub,
    actions: [
      { label: "try again", onClick: load, icon: "i-arrow-right" },
      { label: "back to all artworks", href: "../collection.html", icon: "i-arrow-left" },
    ],
  });
}

function renderStateMessage({ role, message, sub, actions = [] }) {
  els.state.setAttribute("role", role);
  const msg = el("p", "emsg");
  msg.textContent = message;
  const nodes = [msg];
  if (sub) {
    const subEl = el("p", "esub");
    subEl.textContent = sub;
    nodes.push(subEl);
  }
  if (actions.length) {
    const row = el("div", "statebtns");
    for (const action of actions) {
      const node = action.href ? el("a", "ebtn tickbtn") : el("button", "ebtn tickbtn");
      if (action.href) {
        node.href = action.href;
      } else {
        node.type = "button";
        node.addEventListener("click", action.onClick);
      }
      if (action.icon === "i-arrow-left") node.append(icon(action.icon), ` ${action.label}`);
      else node.append(`${action.label} `, icon(action.icon));
      row.appendChild(node);
    }
    nodes.push(row);
  }
  els.state.replaceChildren(...nodes);
}

/* ---- render: the work ---- */

function renderWork(work) {
  setHead(headTitle(work), headDescription(work));
  els.h1.textContent = work.title;
  setCrumbs(work);
  renderEntry(work);
  renderWall(work);
  renderStory(work);
  setOwnerTools(work);
  observeBand();
}

// owner tools (edit + delete) show only to the owner — stricter than the body.authed nav gate.
// Set before the page flips to is-ready, so a logged-in non-owner never sees them.
// The delete handler arrives with owner-actions; here the tools just become visible + the edit link points at this work.
function setOwnerTools(work) {
  const isOwner = isLoggedIn() && isOwnArtwork(work, getUserName());
  if (els.ownerTools) els.ownerTools.style.display = isOwner ? "" : "none";
  if (isOwner && els.editLink && work.id) {
    els.editLink.href = `edit.html?id=${encodeURIComponent(work.id)}`;
  }
}

function renderEntry(work) {
  const artist = String(work.artist ?? "").trim();
  const year = formatYear(work.year);
  els.label.textContent = [artist, year].filter(Boolean).join(" · ");

  els.title.textContent = work.title;
  els.titleInk.textContent = work.title;

  els.intro.replaceChildren();
  for (const segment of introSegments(work)) {
    if (segment.em) {
      const em = el("em");
      em.textContent = segment.text;
      els.intro.appendChild(em);
    } else {
      els.intro.appendChild(document.createTextNode(segment.text));
    }
  }

  const tags = [work.medium, year, work.location]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  els.tagrow.replaceChildren(
    ...tags.map((value) => {
      const tag = el("span", "tag");
      tag.textContent = value;
      return tag;
    })
  );
}

function renderWall(work) {
  const url = secureImageUrl(work.image?.url);
  els.body.classList.remove("is-noimage");

  // a single work bypasses the feed's usable filter, so its image can be junk or dead — either way, degrade to the "image unavailable" plate
  if (!HTTP_RE.test(url)) {
    els.body.classList.add("is-noimage");
    return;
  }

  els.image.src = url;
  els.image.alt = artworkAlt(work);
  els.image.loading = "eager";
  els.image.setAttribute("fetchpriority", "high");
  els.fullsize.href = url;

  // place the band + cut the crops once the frame's size is known;
  // the guard keeps a cached image from doing it twice
  let framed = false;
  const onFrameReady = () => {
    if (framed) return;
    framed = true;
    placeBand();
    renderCrops(work, url, els.image.naturalWidth / els.image.naturalHeight);
  };
  els.image.addEventListener("load", onFrameReady, { once: true });
  els.image.addEventListener("error", () => els.body.classList.add("is-noimage"), { once: true });
  if (els.image.complete && els.image.naturalWidth) onFrameReady();
}

function renderCrops(work, url, ratio) {
  const alt = artworkAlt(work);
  const fragment = document.createDocumentFragment();
  for (const win of cropSet(ratio).windows) {
    const figure = el("figure", "crop r");

    const wrap = el("div", "cwrap");
    wrap.style.setProperty("--w", `${win.w}px`);
    wrap.style.aspectRatio = String(win.aspectRatio);

    const img = new Image();
    img.src = url;
    // positional, never overclaiming a second work; the main image carries the descriptive alt, so the close-ups note only where they sit
    img.alt = `${alt} — ${win.caption}`;
    img.loading = "lazy";
    img.style.transformOrigin = `${win.originX}% ${win.originY}%`;
    wrap.appendChild(img);

    const caption = el("figcaption");
    caption.textContent = win.caption;
    figure.append(wrap, caption);
    fragment.appendChild(figure);
  }
  els.crops.replaceChildren(fragment);
  observeReveals(); // the crops render after the frame loads
}

function renderStory(work) {
  const paragraphs = splitParagraphs(work.description);
  els.reading.classList.toggle("short", isShortDescription(work.description));
  if (paragraphs.length) {
    els.reading.replaceChildren(
      ...paragraphs.map((text) => {
        const p = el("p");
        p.textContent = text;
        return p;
      })
    );
  } else {
    const p = el("p");
    p.textContent = "No description was recorded for this work.";
    els.reading.replaceChildren(p);
  }

  const owner = String(work.owner?.name ?? "").trim();
  if (owner) {
    els.credit.replaceChildren("added to the archive by ");
    const link = el("a");
    link.href = `../profile.html?owner=${encodeURIComponent(owner)}`;
    link.textContent = owner;
    els.credit.appendChild(link);
    show(els.credit);
  } else {
    hide(els.credit);
  }

  const rows = [
    ["artist", String(work.artist ?? "").trim()],
    ["year", formatYear(work.year)],
    ["medium", String(work.medium ?? "").trim()],
    ["location", String(work.location ?? "").trim()],
    ["added", formatDate(work.created)],
  ];
  const fragment = document.createDocumentFragment();
  for (const [label, value] of rows) {
    if (!value) continue; // drop empty rows — never an "undefined" line
    const row = el("div", "row");
    const dt = el("dt");
    dt.textContent = label;
    const dd = el("dd");
    dd.textContent = value;
    row.append(dt, dd);
    fragment.appendChild(row);
  }
  els.facts.replaceChildren(fragment);
}

/* ---- render: enrichment (related / prev-next / more) ---- */

function renderEnrichment(work, list) {
  const related = relatedArtworks(work, list, { limit: SATELLITE_SLOTS.length });
  if (related.length) initConstellation(work, related);
  else hide(els.connzone);

  const relatedIds = new Set(related.map((entry) => entry.work.id));
  const more = list
    .filter((item) => item.id !== work.id && !relatedIds.has(item.id))
    .slice(0, MORE_PATTERN.length);
  if (more.length) {
    const fragment = document.createDocumentFragment();
    more.forEach((item, index) => fragment.appendChild(card(item, MORE_PATTERN[index])));
    els.moreGrid.replaceChildren(fragment);
  } else {
    hide(els.moreGrid);
  }

  // prev/next walk the USABLE list, not the raw pool,
  // neighbours are always presentable works, and a non-usable current work (e.g. a dead image, absent from this list) gracefully gets no band
  renderPrevNext(neighbours(work, list));
}

function renderPrevNext({ prev, next }) {
  if (!prev && !next) {
    hide(els.prevnext);
    return;
  }
  const nodes = [];
  if (prev) nodes.push(prevNextLink(prev, "prev"));
  if (next) nodes.push(prevNextLink(next, "next"));
  els.prevnext.replaceChildren(...nodes);
}

function prevNextLink(work, direction) {
  const link = el("a", direction === "prev" ? "pn-prev" : "pn-next");
  link.href = artworkHref(work.id);

  const title = el("span", "ttl");
  title.textContent = work.title;

  const label = el("span", "lbl");
  if (direction === "prev") label.append(icon("i-arrow-left"), " previous");
  else label.append("next ", icon("i-arrow-right"));

  const thumb = new Image();
  thumb.className = "pthumb";
  thumb.src = secureImageUrl(work.image?.url);
  thumb.alt = "";
  thumb.loading = "lazy";
  thumb.addEventListener("error", () => thumb.remove(), { once: true });

  // prev reads title → label → thumb; next mirrors it (thumb → label → title)
  if (direction === "prev") link.append(title, label, thumb);
  else link.append(thumb, label, title);
  return link;
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
  img.src = secureImageUrl(work.image?.url);
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

  link.appendChild(wrap);
  figure.append(link, caption);
  return figure;
}

/* ---- the constellation — breathing threads anchored to the frames ---- */

function initConstellation(work, related) {
  const hub = el("div", "node here");
  hub.style.left = `${HUB_SLOT.left}%`;
  hub.style.top = `${HUB_SLOT.top}%`;
  if (!els.body.classList.contains("is-noimage")) {
    const hubImg = new Image();
    hubImg.src = secureImageUrl(work.image?.url);
    hubImg.alt = "";
    hubImg.loading = "lazy";
    hubImg.style.width = `${HUB_SLOT.width}px`;
    hub.appendChild(hubImg);
  }
  const youare = el("span", "youare");
  youare.textContent = "you are here";
  hub.appendChild(youare);

  const satellites = related.map((entry, index) => {
    const slot = SATELLITE_SLOTS[index];
    const node = el("div", "node");
    node.style.left = `${slot.left}%`;
    node.style.top = `${slot.top}%`;

    const link = el("a");
    link.href = artworkHref(entry.work.id);
    const img = new Image();
    img.src = secureImageUrl(entry.work.image?.url);
    img.alt = artworkAlt(entry.work);
    img.loading = "lazy";
    img.style.width = `${slot.width}px`;
    const why = el("span", "why");
    why.textContent = entry.reason;
    link.append(img, why);
    node.appendChild(link);
    return node;
  });

  els.constellation.append(hub, ...satellites);

  const rebuild = initThreads(hub, satellites);

  // a dead image drops its node (the centre-to-frame thread would dangle), then the remaining threads redraw; the hub just loses its picture
  satellites.forEach((node) => {
    node.querySelector("img")?.addEventListener(
      "error",
      () => {
        node.remove();
        rebuild();
      },
      { once: true }
    );
  });
  hub.querySelector("img")?.addEventListener(
    "error",
    function dropHubImage() {
      this.remove();
      rebuild();
    },
    { once: true }
  );
}

function initThreads(hub, satellites) {
  const svg = els.lines;
  const container = els.constellation;
  const hubDrift = { phase: 0.8, speed: 0.45, amp: 5 };
  let threads = [];
  let drawn = false;
  let rafId = 0;

  // where the centre-to-centre segment leaves a frame
  function edgePoint(rect, toward, base) {
    const cx = rect.left + rect.width / 2 - base.left;
    const cy = rect.top + rect.height / 2 - base.top;
    const dx = toward.x - cx;
    const dy = toward.y - cy;
    const t =
      1 / Math.max(Math.abs(dx) / (rect.width / 2 + 6), Math.abs(dy) / (rect.height / 2 + 6));
    return { x: cx + dx * t, y: cy + dy * t };
  }

  function visual(node) {
    return node.querySelector("img") ?? node;
  }

  function build() {
    [hub, ...satellites].forEach((node) => {
      node.style.transform = "none";
    });
    const base = container.getBoundingClientRect();
    // bail when the threads aren't shown (mobile hides .lines) or the section is laid out to 0 — otherwise the anchors compute NaN
    if (getComputedStyle(svg).display === "none" || !base.width || !base.height) {
      threads = [];
      svg.replaceChildren();
      return;
    }
    svg.setAttribute("viewBox", `0 0 ${base.width} ${base.height}`);
    const hubBox = visual(hub).getBoundingClientRect();
    const hubCentre = {
      x: hubBox.left + hubBox.width / 2 - base.left,
      y: hubBox.top + hubBox.height / 2 - base.top,
    };
    svg.replaceChildren();
    threads = satellites
      .filter((node) => node.isConnected)
      .map((node, index) => {
        const box = visual(node).getBoundingClientRect();
        const satCentre = {
          x: box.left + box.width / 2 - base.left,
          y: box.top + box.height / 2 - base.top,
        };
        const a = edgePoint(hubBox, satCentre, base);
        const b = edgePoint(box, hubCentre, base);
        const line = document.createElementNS(SVG_NS, "line");
        const dotA = document.createElementNS(SVG_NS, "circle");
        const dotB = document.createElementNS(SVG_NS, "circle");
        dotA.setAttribute("r", "2");
        dotB.setAttribute("r", "2");
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        line.style.strokeDasharray = length;
        line.style.strokeDashoffset = drawn ? 0 : length;
        line.style.transition = `stroke-dashoffset 0.9s ease ${0.15 + index * 0.12}s`;
        [dotA, dotB].forEach((dot) => {
          dot.style.opacity = drawn ? 1 : 0;
          dot.style.transition = `opacity 0.5s ease ${0.7 + index * 0.12}s`;
        });
        svg.append(line, dotA, dotB);
        return {
          node,
          line,
          dotA,
          dotB,
          a,
          b,
          phase: index * 1.7,
          speed: 0.55 + (index % 3) * 0.18,
          amp: 6 + (index % 2) * 3,
        };
      });
    paint(0);
  }

  function paint(time) {
    if (!threads.length) return;
    const hubDy = prefersReducedMotion
      ? 0
      : Math.sin(time * hubDrift.speed + hubDrift.phase) * hubDrift.amp;
    hub.style.transform = hubDy ? `translateY(${hubDy}px)` : "none";
    for (const thread of threads) {
      const dy = prefersReducedMotion
        ? 0
        : Math.sin(time * thread.speed + thread.phase) * thread.amp;
      thread.node.style.transform = dy ? `translateY(${dy}px)` : "none";
      thread.line.setAttribute("x1", thread.a.x);
      thread.line.setAttribute("y1", thread.a.y + hubDy);
      thread.line.setAttribute("x2", thread.b.x);
      thread.line.setAttribute("y2", thread.b.y + dy);
      thread.dotA.setAttribute("cx", thread.a.x);
      thread.dotA.setAttribute("cy", thread.a.y + hubDy);
      thread.dotB.setAttribute("cx", thread.b.x);
      thread.dotB.setAttribute("cy", thread.b.y + dy);
    }
  }

  function loop(ms) {
    paint(ms / 1000);
    rafId = requestAnimationFrame(loop);
  }
  function startLoop() {
    if (rafId || prefersReducedMotion || !threads.length) return;
    rafId = requestAnimationFrame(loop);
  }
  function stopLoop() {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function rebuild() {
    build();
    if (rafId) {
      stopLoop();
      startLoop();
    }
  }

  build();

  // run the drift only while the section is on screen (and motion is allowed)
  const viewObserver = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) startLoop();
      else stopLoop();
    },
    { threshold: 0 }
  );
  viewObserver.observe(els.connzone);

  // draw the threads outward from the centre when the section first arrives
  const drawObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        drawn = true;
        for (const thread of threads) {
          thread.line.style.strokeDashoffset = 0;
          thread.dotA.style.opacity = 1;
          thread.dotB.style.opacity = 1;
        }
        drawObserver.disconnect();
      }
    },
    { threshold: 0.25 }
  );
  drawObserver.observe(els.constellation);

  // the anchors depend on the loaded image sizes and rebuild as they settle
  let resizeTimer = 0;
  const debouncedRebuild = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(rebuild, 120);
  };
  els.constellation.querySelectorAll("img").forEach((img) => {
    if (!img.complete) img.addEventListener("load", debouncedRebuild, { once: true });
  });
  window.addEventListener("resize", debouncedRebuild, { passive: true });

  return rebuild;
}

/* ---- scroll-coupled motion ---- */

// the ink band straddles the work at a fixed fraction of the frame's height, so any ratio is caught the same way rather than pinned to one painting
function placeBand() {
  if (!els.frame) return;
  const top = els.frame.offsetTop + els.frame.offsetHeight * 0.55;
  els.wall.style.setProperty("--band-top", `${Math.round(top)}px`);
}

function initConnzoneTint() {
  // the connections section tints white→ink as the visitor enters and releases as they leave
  let ticking = false;
  function tint() {
    const rect = els.connzone.getBoundingClientRect();
    const vh = window.innerHeight;
    els.connzone.classList.toggle("night", rect.top < vh * 0.78 && rect.bottom > vh * 0.22);
  }
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      tint();
      ticking = false;
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", placeBand, { passive: true });
  tint();
}

// the ink band reveals as the wall enters view, then stays
function observeBand() {
  if (!els.wall) return;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          els.wall.classList.add("on");
          observer.disconnect();
        }
      }
    },
    { threshold: 0.1 }
  );
  observer.observe(els.wall);
}

// one persistent observer; the page reveals in waves (work, then crops on image load, then enrichment), so this is called more than once
let revealObserver = null;

function observeReveals() {
  const nodes = document.querySelectorAll(".r:not(.in)");
  if (prefersReducedMotion) {
    nodes.forEach((node) => node.classList.add("in"));
    return;
  }
  if (!revealObserver) {
    revealObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            revealObserver.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.18 }
    );
  }
  let index = 0;
  nodes.forEach((node) => {
    node.style.transitionDelay = `${(index % 3) * 90}ms`;
    index += 1;
    revealObserver.observe(node);
  });
}

/* ---- head + crumbs ---- */

function headTitle(work) {
  const artist = String(work.artist ?? "").trim();
  return artist ? `${work.title} · ${artist}` : work.title;
}

function headDescription(work) {
  const segments = introSegments(work)
    .map((segment) => segment.text)
    .join("");
  // introSegments already drops empty fields and reads as a sentence
  return `${work.title} — ${segments}`;
}

function setHead(title, description) {
  document.title = `${title} · Nordic Art Archive`;
  if (metaDescription) metaDescription.setAttribute("content", description);
}

function setCrumbs(work) {
  const items = [crumbLink("../index.html", "the archive")];
  if (work) {
    const medium = String(work.medium ?? "").trim();
    if (medium) {
      items.push(crumbLink(`../collection.html?medium=${encodeURIComponent(medium)}`, medium));
    }
    items.push(crumbCurrent(work.title));
  }
  els.crumbs.replaceChildren(...items);
}

function crumbLink(href, label) {
  const li = el("li");
  const a = el("a");
  a.href = href;
  a.textContent = label;
  li.appendChild(a);
  return li;
}

function crumbCurrent(label) {
  const li = el("li");
  const span = el("span");
  span.setAttribute("aria-current", "page");
  span.textContent = label;
  li.appendChild(span);
  return li;
}

/* ---- dom helpers ---- */

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

// inline display, not the [hidden] attribute: .chaos/.pn set an author `display` that outranks the UA [hidden] rule,
// so the attribute alone wouldn't hide them
function hide(node) {
  node.style.display = "none";
}

function show(node) {
  node.style.display = "";
}

function icon(symbolId) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "i");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `#${symbolId}`);
  svg.appendChild(use);
  return svg;
}

function artworkHref(workId) {
  return `index.html?id=${encodeURIComponent(workId)}`;
}
