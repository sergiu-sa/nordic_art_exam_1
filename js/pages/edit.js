// Edit page: guard (carrying the id so a guarded owner resumes here after login),
// then fetch the work, confirm ownership, pre-fill, and wire the studio to PUT.
import { requireAuth } from "../auth.js";
import { initNav } from "../nav.js";
import { getArtwork, updateArtwork, deleteArtwork } from "../api.js";
import { isArtworkId, isOwnArtwork, secureImageUrl } from "../artworks.js";
import { getUserName } from "../session.js";
import { formatYear } from "../format.js";
import { createWall } from "../studio-wall.js";
import { initStudio } from "../studio.js";
import { initDelete } from "../delete-artwork.js";
import { setStatus, renderError, renderFormSuccess, errorToMessage } from "../ui.js";

const id = new URLSearchParams(location.search).get("id") || undefined;

if (requireAuth({ from: "edit", id })) {
  document.querySelector(".guarded")?.classList.remove("guarded");
  initNav();
  start();
}

async function start() {
  const studio = document.querySelector(".studio");
  const loadRegion = document.querySelector(".studio-load");

  // a malformed id can never resolve to a work — fail fast, no request
  if (!isArtworkId(id)) {
    showLoadState(loadRegion, studio, notFound());
    return;
  }

  showLoading(loadRegion);
  try {
    const artwork = await getArtwork(id);
    if (!artwork) {
      showLoadState(loadRegion, studio, notFound());
      return;
    }
    // ownership is stricter than the auth guard: editing is for the work's owner only
    if (!isOwnArtwork(artwork, getUserName())) {
      showLoadState(loadRegion, studio, notOwner());
      return;
    }
    const wall = createWall(document.querySelector(".wall"));
    prefill(artwork, wall);
    loadRegion.replaceChildren();
    studio.hidden = false;
    wireForm(artwork, wall);
  } catch (error) {
    studio.hidden = true;
    // a bad or unknown id (the API answers 400 / 404) is a not-found, not a transient error
    if (error?.status === 404 || error?.status === 400) {
      showLoadState(loadRegion, studio, notFound());
      return;
    }
    const { message, sub } = errorToMessage(error, { fallback: "Couldn't load this work." });
    renderError(loadRegion, {
      message: message || "Couldn't load this work.",
      sub,
      onRetry: () => location.reload(),
    });
  }
}

function showLoading(region) {
  const line = region.ownerDocument.createElement("p");
  line.className = "status";
  region.replaceChildren(line);
  setStatus(line, { state: "busy", message: "fetching the work…" });
}

const BACK_TO_COLLECTION = { retryLabel: "back to all artworks", retryHref: "../collection.html" };

function notFound() {
  return {
    message: "This work isn't in the archive.",
    sub: "It may have been taken down.",
    ...BACK_TO_COLLECTION,
  };
}

function notOwner() {
  return {
    message: "This isn't your work to edit.",
    sub: "You can only edit works you added.",
    ...BACK_TO_COLLECTION,
  };
}

function showLoadState(region, studio, options) {
  studio.hidden = true;
  renderError(region, options);
}

function prefill(artwork, wall) {
  const form = document.getElementById("studio-form");
  const year = formatYear(artwork.year);
  const set = (name, value) => {
    if (form.elements[name]) form.elements[name].value = value ?? "";
  };
  set("title", artwork.title);
  set("artist", artwork.artist);
  set("year", year);
  set("medium", artwork.medium);
  set("description", artwork.description);
  set("location", artwork.location);
  set("imageUrl", artwork.image?.url ? secureImageUrl(artwork.image.url) : "");
  set("imageAlt", artwork.image?.alt || "");

  // the breadcrumb's middle crumb
  const crumb = document.getElementById("crumb-title");
  if (crumb) {
    const link = document.createElement("a");
    link.href = `index.html?id=${artwork.id}`;
    link.textContent = artwork.title || "the work";
    crumb.replaceWith(link);
  }

  // pre-hang the wall (no drop — the work already hangs)
  wall.prefill(
    { title: artwork.title, artist: artwork.artist, year, medium: artwork.medium },
    artwork.image?.url || ""
  );
}

function wireForm(artwork, wall) {
  const form = document.getElementById("studio-form");
  initStudio({
    form,
    status: document.getElementById("status"),
    wall,
    mode: "edit",
    imgLive: Boolean(artwork.image?.url), // the saved image is known-good
    submit: (payload) => updateArtwork(id, payload),
    onSuccess: (updated) => ({
      message: "Saved. The wall is up to date.",
      actions: [
        { href: `index.html?id=${updated?.id ?? id}`, label: "view it in the archive" },
        { href: "../index.html", label: "your works" },
      ],
    }),
  });
  initDelete({
    id,
    title: artwork.title,
    deleteVerb: deleteArtwork,
    onDeleted: () => {
      wall.empty();
      renderFormSuccess(form, {
        message: "It's gone. The wall hangs empty.",
        actions: [
          { href: "../index.html", label: "your works" },
          { href: "create.html", label: "hang something new" },
        ],
      });
    },
  });
}
