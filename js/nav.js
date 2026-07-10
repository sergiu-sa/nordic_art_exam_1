// Shared chrome behaviour, reused by every page that renders the masthead + curtain: the menu's open/close with focus management, and the masthead's condense-on-scroll.
// Presentation lives in css/components/nav.css.

import { isLoggedIn, logout } from "./auth.js";

const OPEN_CLASS = "open";

// logoutTarget: guarded pages (create/edit/own room) pass a path so logging out leaves the page instead of stranding owner-only content behind a dead session.
export function initNav({ logoutTarget = "" } = {}) {
  const doc = document;
  initCurtain(doc);
  initScrolled(doc);
  initAuthState(doc, logoutTarget);
}

function initCurtain(doc) {
  const curtain = doc.getElementById("curtain");
  const openBtn = doc.getElementById("menu-open");
  const closeBtn = doc.getElementById("menu-close");
  if (!curtain || !openBtn || !closeBtn) return;

  const nav = curtain.querySelector("nav");
  // everything behind the curtain;  made inert while it's open so focus and assistive tech stay inside the menu (native inert, no JS focus loop)
  const background = [...doc.body.children].filter(
    (el) => el !== curtain && el.nodeName !== "SCRIPT"
  );
  let lastFocused = null;

  function apply(open) {
    curtain.classList.toggle(OPEN_CLASS, open);
    curtain.setAttribute("aria-hidden", String(!open));
    openBtn.setAttribute("aria-expanded", String(open));
    doc.documentElement.style.overflow = open ? "hidden" : "";
    for (const el of background) {
      el.toggleAttribute("inert", open);
      if (open) el.setAttribute("aria-hidden", "true");
      else el.removeAttribute("aria-hidden");
    }
  }

  function open() {
    lastFocused = doc.activeElement;
    apply(true);
    (nav?.querySelector("a") ?? closeBtn).focus();
  }

  function close({ restoreFocus = true } = {}) {
    apply(false);
    if (restoreFocus) {
      if (lastFocused instanceof HTMLElement) lastFocused.focus();
      else openBtn.focus();
    }
  }

  openBtn.addEventListener("click", open);
  closeBtn.addEventListener("click", () => close());
  doc.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && curtain.classList.contains(OPEN_CLASS)) close();
  });
  // following a link navigates away; just release the page (don't yank focus)
  nav?.addEventListener("click", (event) => {
    if (event.target.closest("a")) close({ restoreFocus: false });
  });

  initPreview(curtain, nav, openBtn);
}

// The destination preview: a hovered/focused browse link fades its screenshot into the right void.
// Wide-desktop + hover only
function initPreview(curtain, nav, openBtn) {
  const preview = curtain.querySelector(".menu-preview");
  if (!preview) return;
  const shots = [...preview.querySelectorAll(".mp")];
  const wideHover = window.matchMedia("(min-width: 1024px) and (hover: hover)");
  let loaded = false;

  function loadShots() {
    if (loaded || !wideHover.matches) return;
    loaded = true;
    for (const img of shots) if (img.dataset.src) img.src = img.dataset.src;
  }
  function show(key) {
    for (const img of shots) img.classList.toggle("show", img.dataset.prev === key);
  }
  function hide() {
    for (const img of shots) img.classList.remove("show");
  }

  for (const link of nav?.querySelectorAll("a[data-prev]") ?? []) {
    const { prev } = link.dataset;
    link.addEventListener("pointerenter", () => show(prev));
    // :focus-visible so the curtain's programmatic focus-on-open (mouse) doesn't flash a preview; real keyboard focus still drives it.
    link.addEventListener("focus", () => {
      if (link.matches(":focus-visible")) show(prev);
    });
    link.addEventListener("pointerleave", hide);
    link.addEventListener("blur", hide);
  }
  openBtn.addEventListener("click", loadShots);
}

function initScrolled(doc) {
  const body = doc.body;
  // hysteresis: condensing changes the masthead's own height, so the on/off thresholds sit far apart to stop flip-flop jitter at the boundary
  function update() {
    if (window.scrollY > 140) body.classList.add("scrolled");
    else if (window.scrollY < 40) body.classList.remove("scrolled");
  }
  window.addEventListener("scroll", update, { passive: true });
  update();
}

// reflect the session in the chrome: body.authed swaps the owner nav in (add-artwork /my-works / log out) across the masthead, curtain, and footer.
// Logout flips it back in place — feed/detail simply return to the logged-out chrome
function initAuthState(doc, logoutTarget) {
  applyAuthClass(doc);
  for (const btn of doc.querySelectorAll(".logout")) {
    btn.addEventListener("click", () => {
      logout();
      // guarded content mustn't outlive the session — replace() so Back can't return to it
      if (logoutTarget) {
        window.location.replace(logoutTarget);
        return;
      }
      applyAuthClass(doc);
      // applyAuthClass hides the .auth-in subtree (display:none via body.authed), which would drop focus to document.body — a keyboard/switch user loses their place.
      // Move focus to the first focusable element inside the .auth-out partner that just became visible in the same region as the clicked button.
      const region = btn.closest(".auth, .fcol");
      const successor =
        region?.querySelector(".auth-out a, .auth-out button") ?? doc.getElementById("menu-open");
      successor?.focus();
    });
  }
}

// Re-sync the chrome to the current session
// called after a login completes mid-page (login.js), so nav.js stays the single owner of the body.authed toggle.
export function syncAuthState(doc = document) {
  applyAuthClass(doc);
}

function applyAuthClass(doc) {
  doc.body.classList.toggle("authed", isLoggedIn());
}
