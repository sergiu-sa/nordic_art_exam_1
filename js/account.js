// Shared "door" presentation for the account pages (register + login): the page's one orchestrated entrance and the show/hide-password peek.
// Pure presentation — no form or network knowledge.

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
// The works uncover once hydration settles;
// this timer is the last-resort reveal if it never does;
// a shorter cap would fire mid-hydration, reveal the static fallback, then let the image swap land after it:
// the very flash this fix removes.
const WORKS_REVEAL_MAX_MS = 8000;

// worksReady is the hydrateDoor() promise (or undefined): the form card enters at once, but the works stay hidden until it settles, so they reveal with their final images instead of flashing the static fallback first.
export function initDoor(doc = document, worksReady) {
  initEntrance(doc, worksReady);
  initPeek(doc);
}

function initEntrance(doc, worksReady) {
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
  revealWorksWhenReady(door, worksReady);
}

// Uncover the works on .works-in once hydration settles, with a safety timer so they never stay hidden.
// The extra rAF lets a just-swapped src commit before the pieces fade in.
// Network-agnostic: initDoor never inspects the fetch itself.
function revealWorksWhenReady(door, worksReady) {
  let done = false;
  const reveal = () => {
    if (done) return;
    done = true;
    requestAnimationFrame(() => door.classList.add("works-in"));
  };
  const safety = setTimeout(reveal, WORKS_REVEAL_MAX_MS);
  Promise.resolve(worksReady)
    .catch(() => {})
    .then(() => {
      clearTimeout(safety);
      reveal();
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
