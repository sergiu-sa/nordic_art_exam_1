// Create page: guard first, then the studio form wired to POST /artworks.
// base.css hides <main> until requireAuth confirms the session, so a logged-out hit never flashes content.
import { requireAuth } from "../auth.js";
import { initNav } from "../nav.js";
import { createArtwork } from "../api.js";
import { createWall } from "../studio-wall.js";
import { initStudio } from "../studio.js";

if (requireAuth({ from: "create" })) {
  document.querySelector(".guarded")?.classList.remove("guarded");
  initNav();

  const wall = createWall(document.querySelector(".wall"));
  wall.update({ title: "", artist: "", year: "", medium: "" });

  initStudio({
    form: document.getElementById("studio-form"),
    status: document.getElementById("status"),
    wall,
    mode: "create",
    submit: createArtwork,
    onSuccess: (artwork) => ({
      message: "It hangs. The archive grew by one.",
      actions: [
        artwork?.id
          ? { href: `index.html?id=${artwork.id}`, label: "view it in the archive" }
          : null,
        { href: "../index.html", label: "see your works" },
        { href: "create.html", label: "add another" },
      ].filter(Boolean),
    }),
  });
}
