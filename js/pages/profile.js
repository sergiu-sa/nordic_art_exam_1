// The collector's room: one self-aware page.
// No ?owner → your own room (guarded, owner tools); ?owner=<name> → any contributor's room, read-only.
// Everything derives client-side from the fetched pool — no profile endpoints.
import { getAllArtworks, deleteArtwork } from "../api.js";
import { requireAuth } from "../auth.js";
import { getUserName } from "../session.js";
import { initNav } from "../nav.js";
import { initDelete } from "../delete-artwork.js";
import { renderSkeletonGrid, renderError, errorToMessage, guardImage, setStatus } from "../ui.js";
import { artworkAlt, secureImageUrl } from "../artworks.js";
import { formatYear } from "../format.js";
import {
  collectorsRegister,
  roomWorks,
  colophon,
  artistRegister,
  enfiladeNeighbours,
  weightedHang,
} from "../rooms.js";

const FETCH_TIMEOUT_MS = 15000;
const SEARCH_DEBOUNCE_MS = 300;

const params = new URLSearchParams(window.location.search);
const ownerParam = (params.get("owner") ?? "").trim();
const sessionName = getUserName();
// ?owner naming yourself is still your own room — no phantom read-only view
const isOwnRoom = !ownerParam || ownerParam === sessionName;
// guard first — a logged-out own-room hit bounces before anything renders
const allowed = !isOwnRoom || requireAuth({ from: "profile", loginPath: "account/login.html" });

function initRoom() {
  if (!isOwnRoom) {
    document.body.classList.add("readonly");
  } else {
    // this page is "my works" — mark the chrome's links to it
    for (const link of document.querySelectorAll('a[href="profile.html"]')) {
      link.setAttribute("aria-current", "page");
    }
  }
  let debounce = 0;
  els.roomq.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(applyFilter, SEARCH_DEBOUNCE_MS);
  });
  // the native clear (the field's ✕) fires "search" — apply at once
  els.roomq.addEventListener("search", () => {
    clearTimeout(debounce);
    applyFilter();
  });
  load();
}

const els = {
  state: document.getElementById("room-state"),
  face: document.getElementById("face"),
  hereTag: document.getElementById("here-tag"),
  roomName: document.getElementById("room-name"),
  roomBio: document.getElementById("room-bio"),
  colophon: document.getElementById("colophon"),
  emptyRoom: document.getElementById("empty-room"),
  litHang: document.getElementById("lit-hang"),
  byhang: document.getElementById("byhang"),
  roomq: document.getElementById("roomq"),
  roomStatus: document.getElementById("room-status"),
  handList: document.getElementById("hand-list"),
  hang: document.getElementById("hang"),
  roomsKicker: document.getElementById("rooms-kicker"),
  pnPrev: document.getElementById("pn-prev"),
  pnNext: document.getElementById("pn-next"),
  crumbName: document.getElementById("crumb-name"),
};

let works = [];
let register = [];
let activeArtistKey = "";

function setPageState(state) {
  document.body.classList.remove("is-loading", "is-ready", "is-empty", "is-error");
  document.body.classList.add(state);
}

async function load() {
  setPageState("is-loading");
  renderSkeletonGrid(els.state, { count: 8 });
  const gathering = document.createElement("p");
  gathering.className = "status";
  els.state.prepend(gathering);
  setStatus(gathering, { state: "busy", message: "gathering the room…" });
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, FETCH_TIMEOUT_MS);
  try {
    const { data } = await getAllArtworks({ signal: controller.signal });
    register = collectorsRegister(data);
    const name = isOwnRoom ? sessionName : ownerParam;
    works = roomWorks(register, name);
    renderRoom(name);
  } catch (error) {
    if (timedOut) {
      setPageState("is-error");
      renderError(els.state, {
        message: "The archive took too long to answer.",
        sub: "Check your connection and try again.",
        onRetry: load,
      });
      return;
    }
    const result = errorToMessage(error, { fallback: "The room couldn't be reached." });
    if (result.ignore) return;
    setPageState("is-error");
    renderError(els.state, {
      message: result.message,
      sub: result.sub ?? "",
      onRetry: load,
    });
  } finally {
    clearTimeout(timer);
  }
}

function renderRoom(name) {
  if (!works.length && !isOwnRoom) {
    // collectors only exist through their works — never fabricate a plaque from a URL parameter
    setPageState("is-error");
    renderError(els.state, {
      message: "No works hang under this name.",
      sub: "The room may have emptied, or the address may be mistyped.",
      retryHref: "collection.html",
      retryLabel: "all artworks",
    });
    return;
  }

  document.title = `${name} — Nordic Art Archive`;
  els.crumbName.textContent = name;
  renderPlaque(name);

  if (!works.length) {
    // your own empty room: the plaque, the invitation, and the doors out - clear the last ready render first so no stale link hides behind it
    els.colophon.textContent = "";
    els.litHang.replaceChildren();
    els.handList.replaceChildren();
    els.hang.replaceChildren();
    els.roomStatus.textContent = "";
    setPageState("is-empty");
    els.emptyRoom.hidden = false;
    els.roomsKicker.textContent = "01 — the rooms beyond";
    renderEnfilade(name);
    return;
  }

  setPageState("is-ready");
  renderColophon();
  renderLitwall();
  renderRail();
  renderHang();
  applyFilter();
  initSpotlights();
  renderEnfilade(name);
}

function renderPlaque(name) {
  els.roomName.textContent = name;
  els.hereTag.textContent = isOwnRoom ? "you are here" : "a collector in the archive";
  const owner = works[0]?.owner ?? {};
  const avatarUrl = String(owner.avatar?.url ?? "").trim();
  if (avatarUrl) {
    const img = new Image();
    img.src = secureImageUrl(avatarUrl);
    img.alt = "";
    img.addEventListener("error", () => showInitial(name), { once: true });
    els.face.replaceChildren(img);
  } else {
    showInitial(name);
  }
  const bio = String(owner.bio ?? "").trim();
  els.roomBio.textContent = bio;
  els.roomBio.hidden = !bio;
}

function showInitial(name) {
  els.face.textContent = name.charAt(0).toUpperCase();
}

function renderColophon() {
  const c = colophon(works);
  const parts = [
    `${c.works} ${c.works === 1 ? "work" : "works"}`,
    `${c.artists} ${c.artists === 1 ? "artist" : "artists"}`,
    `${c.mediums} ${c.mediums === 1 ? "medium" : "mediums"}`,
  ];
  if (c.years) {
    parts.push(c.years.min === c.years.max ? `${c.years.min}` : `${c.years.min}–${c.years.max}`);
  }
  els.colophon.replaceChildren(...colophonNodes(parts));
}

function colophonNodes(parts) {
  const nodes = [];
  parts.forEach((part, index) => {
    if (index) nodes.push("  ·  ");
    const [figure, label] = part.split(" ");
    nodes.push(figure);
    if (label) {
      const sup = document.createElement("sup");
      sup.textContent = label;
      nodes.push(sup);
    }
  });
  return nodes;
}

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "i");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#${name}`);
  svg.appendChild(use);
  return svg;
}

function card(work, slot, { tools = false } = {}) {
  const figure = el("figure", "card r");
  figure.dataset.artist = String(work.artist ?? "")
    .trim()
    .toLowerCase();
  // the search matches title + artist only — never the tools/confirm copy
  figure.dataset.search = `${String(work.title ?? "")} ${String(work.artist ?? "")}`.toLowerCase();
  if (slot) {
    figure.style.gridColumn = `${slot.col} / span ${slot.span}`;
    figure.style.marginTop = `${slot.mt}px`;
    figure.style.setProperty("--card-ratio", String(slot.ratio));
  }

  const link = el("a", "cardlink");
  link.href = `artwork/index.html?id=${encodeURIComponent(work.id)}`;
  const wrap = el("div", "imgwrap");
  const img = new Image();
  img.src = secureImageUrl(work.image?.url ?? "");
  img.alt = artworkAlt(work);
  img.loading = "lazy";
  guardImage(img, { title: work.title });
  wrap.appendChild(img);
  link.appendChild(wrap);

  const caption = el("figcaption");
  const year = formatYear(work.year);
  caption.append(year ? `${work.title}, ${year}` : work.title, el("br"));
  const byline = el("span", "a");
  byline.textContent = [work.artist, work.medium]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" · ");
  caption.append(byline);

  figure.append(link, caption);
  if (tools) ownerTools(work, figure);
  return figure;
}

// the tools row + inline confirm are siblings of the cardlink, never nested in it; class names are the scoped delete-artwork grammar
function ownerTools(work, figure) {
  const tools = el("div", "owntools");
  const edit = el("a", "tickbtn");
  edit.href = `artwork/edit.html?id=${encodeURIComponent(work.id)}`;
  edit.append(icon("i-pencil"), "edit");
  const del = el("button", "del tickbtn");
  del.type = "button";
  del.append(icon("i-trash"), "delete");
  tools.append(edit, del);

  const confirm = el("div", "confirm");
  confirm.tabIndex = -1;
  confirm.hidden = true;
  confirm.setAttribute("role", "group");
  const ask = el("p", "ask");
  ask.id = `confirm-q-${work.id}`;
  confirm.setAttribute("aria-labelledby", ask.id);
  const em = el("em", "confirm-title");
  em.textContent = work.title;
  ask.append("Take ", em, " down for good?");
  const choices = el("div", "choices");
  const yes = el("button", "del-yes tickbtn");
  yes.type = "button";
  yes.textContent = "yes, take it down";
  const keep = el("button", "del-keep tickbtn");
  keep.type = "button";
  keep.textContent = "no, keep it";
  choices.append(yes, keep);
  const status = el("p", "del-status status");
  const relog = el("a", "del-relog relog");
  relog.href = "account/login.html?from=profile";
  relog.append("log in again ", icon("i-arrow-right"));
  confirm.append(ask, choices, status, relog);

  // initDelete queries by class inside one root; the figure holds both the tools row and the confirm, so it is that root — append before wiring it up
  figure.append(tools, confirm);

  initDelete({
    id: work.id,
    title: work.title,
    deleteVerb: deleteArtwork,
    root: figure,
    onDeleted: () => removeWork(work.id, figure),
  });
}

function removeWork(id, figure) {
  works = works.filter((work) => work.id !== id);
  figure.remove();
  // the register holds the pre-delete pool; rebuild it so counts, order, and the enfilade stay truthful
  register = collectorsRegister(
    register.flatMap((room) => room.works).filter((work) => work.id !== id)
  );
  if (!works.length) {
    renderRoom(sessionName);
    // roomq sits in the now-hidden hang chapter — hand focus to the invitation
    els.emptyRoom.querySelector("a")?.focus();
    return;
  }
  renderColophon();
  if (
    activeArtistKey &&
    !works.some(
      (w) =>
        String(w.artist ?? "")
          .trim()
          .toLowerCase() === activeArtistKey
    )
  ) {
    activeArtistKey = "";
  }
  renderRail();
  applyFilter();
  renderLitwall();
  renderEnfilade(sessionName);
  els.roomq.focus();
}

function renderLitwall() {
  const fragment = document.createDocumentFragment();
  for (const { work, slot } of weightedHang(works)) {
    fragment.appendChild(card(work, slot));
  }
  els.litHang.replaceChildren(fragment);
  observeReveals(els.litHang);
}

// the full hang reuses the feed pattern's slot mechanism with a simple rolling pattern (weight lives on the lit wall; down here every work hangs)
const HANG_PATTERN = [
  { col: 1, span: 5, mt: 0, ratio: 1.5 },
  { col: 7, span: 4, mt: 56, ratio: 1.45 },
  { col: 1, span: 4, mt: 30, ratio: 1.6 },
  { col: 6, span: 3, mt: 18, ratio: 1.35 },
  { col: 9, span: 4, mt: 40, ratio: 1.5 },
  { col: 2, span: 3, mt: 26, ratio: 1.2 },
  { col: 5, span: 5, mt: 30, ratio: 1.85 },
  { col: 10, span: 3, mt: 16, ratio: 1.4 },
];

function renderHang() {
  const fragment = document.createDocumentFragment();
  works.forEach((work, index) => {
    fragment.appendChild(
      card(work, HANG_PATTERN[index % HANG_PATTERN.length], { tools: isOwnRoom })
    );
  });
  els.hang.replaceChildren(fragment);
  observeReveals(els.hang);
}

// every hand is visible by default; folding to the top five is the opt-in
// (the collection's chip fold, inverted). A selected tail hand never folds away.
const TOP_HAND_COUNT = 5;
let railExpanded = true;

function renderRail() {
  const { artists } = artistRegister(works, Infinity);
  const top = artists.slice(0, TOP_HAND_COUNT);
  const tail = artists.slice(TOP_HAND_COUNT);

  const fragment = document.createDocumentFragment();
  fragment.appendChild(railButton({ artist: "all works", key: "", count: null }));
  for (const entry of top) fragment.appendChild(railButton(entry));
  if (railExpanded) {
    for (const entry of tail) fragment.appendChild(railButton(entry));
  } else {
    const active = tail.find((entry) => entry.key === activeArtistKey);
    if (active) fragment.appendChild(railButton(active));
  }

  if (tail.length) {
    const toggle = el("button", "more");
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", String(railExpanded));
    toggle.setAttribute("aria-controls", "hand-list");
    toggle.textContent = railExpanded
      ? "show fewer hands"
      : `… ${tail.length} more ${tail.length === 1 ? "hand" : "hands"}`;
    toggle.addEventListener("click", () => {
      railExpanded = !railExpanded;
      renderRail();
      els.handList.querySelector(".more")?.focus();
    });
    fragment.appendChild(toggle);
  }
  els.handList.replaceChildren(fragment);
}

function railButton({ artist, key, count }) {
  const btn = el("button");
  btn.type = "button";
  btn.dataset.artist = key;
  btn.setAttribute("aria-pressed", String(key === activeArtistKey));
  btn.append(artist);
  if (count !== null) {
    const sup = document.createElement("sup");
    sup.textContent = count;
    btn.appendChild(sup);
  }
  btn.addEventListener("click", () => {
    activeArtistKey = key;
    // re-render so a folded rail surfaces the pick and drops a stale pin — replacing
    // the pressed node, so re-seat focus (the collection chips' idiom)
    renderRail();
    els.handList.querySelector(`button[data-artist="${CSS.escape(key)}"]`)?.focus();
    applyFilter();
  });
  return btn;
}

function applyFilter() {
  const query = els.roomq.value.trim().toLowerCase();
  let shown = 0;
  let activeLabel = "";
  for (const figure of els.hang.querySelectorAll("figure[data-artist]")) {
    const byArtist = !activeArtistKey || figure.dataset.artist === activeArtistKey;
    const byText = !query || figure.dataset.search.includes(query);
    const show = byArtist && byText;
    figure.style.display = show ? "" : "none";
    if (show) shown += 1;
  }
  if (activeArtistKey) {
    // CSS.escape: free-text artist keys can hold quotes/brackets
    activeLabel =
      els.handList.querySelector(`button[data-artist="${CSS.escape(activeArtistKey)}"]`)?.firstChild
        ?.textContent ?? "";
  }
  els.roomStatus.textContent =
    `showing ${activeArtistKey || query ? "" : "all "}${shown} ${shown === 1 ? "work" : "works"}` +
    (activeLabel ? ` · ${activeLabel}` : "");
}

// the two spotlights — rail hover lights the artist's works, work hover cues the rail — mutually exclusive, hover + focus, absent on touch by nature
let spotlightsBound = false;

function initSpotlights() {
  // the container listeners survive re-renders (they read state per event) — bind once,
  // even when error → retry → success runs initSpotlights again
  if (spotlightsBound) return;
  spotlightsBound = true;
  let peeked = "";
  let cued = "";
  const setPeek = (key) => {
    if (key === peeked) return;
    peeked = key;
    if (key) setCue("");
    els.byhang.classList.toggle("peeking", Boolean(key));
    for (const figure of els.hang.querySelectorAll("figure[data-artist]")) {
      figure.classList.toggle("lit", Boolean(key) && figure.dataset.artist === key);
    }
  };
  const setCue = (key) => {
    if (key === cued) return;
    cued = key;
    if (key) setPeek("");
    els.byhang.classList.toggle("railpeek", Boolean(key));
    for (const btn of els.handList.querySelectorAll("button[data-artist]")) {
      btn.classList.toggle("cued", Boolean(key) && btn.dataset.artist === key);
    }
  };
  const railKey = (event) => event.target.closest("button[data-artist]")?.dataset.artist ?? "";
  const hangKey = (event) => event.target.closest("figure[data-artist]")?.dataset.artist ?? "";
  els.handList.addEventListener("mouseover", (e) => setPeek(railKey(e)));
  els.handList.addEventListener("mouseleave", () => setPeek(""));
  els.handList.addEventListener("focusin", (e) => setPeek(railKey(e)));
  els.handList.addEventListener("focusout", (e) => {
    if (!els.handList.contains(e.relatedTarget)) setPeek("");
  });
  els.hang.addEventListener("mouseover", (e) => setCue(hangKey(e)));
  els.hang.addEventListener("mouseleave", () => setCue(""));
  els.hang.addEventListener("focusin", (e) => setCue(hangKey(e)));
  els.hang.addEventListener("focusout", (e) => {
    if (!els.hang.contains(e.relatedTarget)) setCue("");
  });
}

function renderEnfilade(name) {
  const { prev, next } = enfiladeNeighbours(register, name);
  fillRoomLink(els.pnPrev, prev);
  fillRoomLink(els.pnNext, next);
}

function fillRoomLink(link, room) {
  if (!room) {
    link.hidden = true;
    return;
  }
  link.hidden = false;
  link.href =
    room.name === sessionName
      ? "profile.html"
      : `profile.html?owner=${encodeURIComponent(room.name)}`;
  const ttl = link.querySelector(".ttl");
  ttl.textContent = room.name;
  const sup = document.createElement("sup");
  sup.textContent = room.count;
  ttl.appendChild(sup);
  link.querySelector(".keeps").textContent = room.keeps;
  const peek = link.querySelector(".pthumb");
  if (room.peek?.image?.url) {
    // a well-shaped URL can still 404 — hide the peek rather than show a broken glyph
    peek.addEventListener(
      "error",
      () => {
        peek.hidden = true;
      },
      { once: true }
    );
    peek.src = secureImageUrl(room.peek.image.url);
    peek.hidden = false;
  } else {
    peek.hidden = true;
  }
}

// reveal on scroll — the shared .r pattern (threshold .18, 90ms sibling stagger)
function observeReveals(container) {
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
  container.querySelectorAll(".r").forEach((node, index) => {
    node.style.transitionDelay = `${(index % 3) * 90}ms`;
    observer.observe(node);
  });
}

// module entry — everything above is declarations; nothing renders unguarded
if (allowed) {
  document.querySelector(".guarded")?.classList.remove("guarded");
  // read-only rooms are public — logout flips in place; only the own room leaves
  initNav({ logoutTarget: isOwnRoom ? "index.html" : "" });
  initRoom();
}
