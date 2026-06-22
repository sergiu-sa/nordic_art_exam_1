// Shared chrome behaviour, reused by every page that renders the masthead + curtain: the menu's open/close with focus management, and the masthead's condense-on-scroll.
// Presentation lives in css/components/nav.css.

const OPEN_CLASS = "open";

export function initNav(doc = document) {
  initCurtain(doc);
  initScrolled(doc);
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
