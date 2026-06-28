// Shared "door" presentation for the account pages (register + login): the page's one orchestrated entrance and the show/hide-password peek.
// Pure presentation — no form or network knowledge.

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

export function initDoor(doc = document) {
  initEntrance(doc);
  initPeek(doc);
}

function initEntrance(doc) {
  const door = doc.getElementById("door");
  if (!door) return;
  const reduce = window.matchMedia(REDUCED_MOTION).matches;
  door.querySelectorAll(".piece").forEach((piece, i) => {
    piece.style.setProperty("--dx", piece.dataset.dx || "0");
    piece.style.setProperty("--dy", piece.dataset.dy || "0");
    piece.style.transitionDelay = reduce ? "0s" : `${i * 0.05}s`;
  });
  // double-rAF so the start state paints before .in releases it;
  // otherwise the browser coalesces both frames and the entrance is skipped
  requestAnimationFrame(() => {
    requestAnimationFrame(() => door.classList.add("in"));
  });
}

function initPeek(doc) {
  const peek = doc.getElementById("peek");
  const password = doc.getElementById("password");
  if (!peek || !password) return;
  peek.addEventListener("click", () => {
    const show = password.type === "password";
    password.type = show ? "text" : "password";
    peek.setAttribute("aria-pressed", String(show));
    peek.setAttribute("aria-label", show ? "hide password" : "show password");
    peek.querySelector("use")?.setAttribute("href", show ? "#i-eye-off" : "#i-eye");
  });
}
