// The studio form orchestrator — shared by create and edit. Reads the form, validates
// (pure), builds the API payload, calls the injected save verb, and renders the states
// through the shared feedback kit. The wall preview is decorative; this module owns the
// accessible form behaviour.

import { secureImageUrl } from "./artworks.js";
import { validateArtworkForm } from "./validation.js";
import {
  showFieldErrors,
  setFieldError,
  clearFieldError,
  setStatus,
  renderFormSuccess,
  errorToMessage,
} from "./ui.js";

const FIELDS = [
  "title",
  "artist",
  "year",
  "medium",
  "description",
  "imageUrl",
  "imageAlt",
  "location",
];

const AUTH_MESSAGE = "Your session has expired — please log in again.";
const VALIDATION_MESSAGE_CREATE =
  "The archive couldn't accept those details. Check the fields and try again.";
const VALIDATION_MESSAGE_EDIT =
  "The archive couldn't accept the changes. Check the fields and try again.";
const NETWORK_MESSAGE = "Couldn't reach the archive. Check your connection and try again.";
const IMAGE_UNREACHABLE = "We couldn't reach that image — check the link.";

export function readValues(form) {
  const get = (name) => String(form.elements[name]?.value ?? "");
  return {
    title: get("title").trim(),
    artist: get("artist").trim(),
    year: get("year").trim(),
    medium: get("medium").trim(),
    description: get("description").trim(),
    location: get("location").trim(),
    imageUrl: get("imageUrl").trim(),
    imageAlt: get("imageAlt").trim(),
  };
}

// Exactly the API model fields; empty optionals dropped; year an integer; image nested.
export function buildPayload(values) {
  const payload = {
    title: values.title,
    artist: values.artist,
    medium: values.medium,
    description: values.description,
  };
  if (values.year) payload.year = Number(values.year);
  if (values.location) payload.location = values.location;
  if (values.imageUrl) {
    payload.image = { url: secureImageUrl(values.imageUrl) };
    if (values.imageAlt) payload.image.alt = values.imageAlt;
  }
  return payload;
}

export function initStudio({ form, status, submit, wall, mode, imgLive = false, onSuccess }) {
  if (!form) return;
  const submitBtn = form.querySelector("[type='submit']");
  const relog = form.querySelector(".relog");
  const validationMessage = mode === "edit" ? VALIDATION_MESSAGE_EDIT : VALIDATION_MESSAGE_CREATE;
  let imageLive = imgLive;

  wireLivePreview();
  wireInlineValidation();
  form.addEventListener("submit", onSubmit);

  function wireLivePreview() {
    for (const name of ["title", "artist", "year", "medium"]) {
      form.elements[name]?.addEventListener("input", () => wall.update(readValues(form)));
    }
    const urlInput = form.elements.imageUrl;
    urlInput?.addEventListener("input", () => {
      imageLive = false;
      clearFieldError(urlInput);
      wall.setImage(urlInput.value, {
        onResult: ({ empty, live }) => {
          imageLive = live;
          // only nag once the user has moved on, never mid-type
          if (!empty && !live && form.ownerDocument.activeElement !== urlInput) {
            setFieldError(urlInput, IMAGE_UNREACHABLE);
          }
        },
      });
    });
  }

  function wireInlineValidation() {
    for (const name of FIELDS) {
      const input = form.elements[name];
      if (!input) continue;
      input.addEventListener("input", () => clearFieldError(input));
      input.addEventListener("blur", () => {
        if (!input.value) return; // don't nag a field merely tabbed through
        const message = validateArtworkForm(readValues(form))[name];
        if (message) setFieldError(input, message);
        else clearFieldError(input);
      });
    }
  }

  async function onSubmit(event) {
    event.preventDefault();
    const values = readValues(form);
    const clean = showFieldErrors(form, validateArtworkForm(values));
    if (!clean) return; // showFieldErrors focused the first invalid field

    // If an image URL is given, it must reach a live image before we save.
    if (values.imageUrl && !imageLive) {
      setStatus(status, { state: "busy", message: "reaching the image…" });
      const { live } = await wall.probeNow(values.imageUrl);
      imageLive = live;
      if (!live) {
        setStatus(status, { state: "idle", message: "" });
        setFieldError(form.elements.imageUrl, IMAGE_UNREACHABLE);
        form.elements.imageUrl.focus();
        return;
      }
    }

    if (relog) relog.style.display = "none";
    if (submitBtn) submitBtn.disabled = true;
    setStatus(status, {
      state: "busy",
      message: mode === "edit" ? "rewriting the label…" : "hanging…",
    });
    try {
      const result = await submit(buildPayload(values));
      const { message, actions } = onSuccess(result);
      renderFormSuccess(form, { message, actions });
    } catch (error) {
      handleFailure(error);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  function handleFailure(error) {
    if (error?.status === 401) {
      setStatus(status, { state: "error", message: AUTH_MESSAGE });
      if (relog) relog.style.display = "inline-flex";
      return;
    }
    if (error?.status === 400) {
      const mapped = mapFieldErrors(error);
      setStatus(
        status,
        mapped ? { state: "idle", message: "" } : { state: "error", message: validationMessage }
      );
      return;
    }
    const result = errorToMessage(error, { fallback: NETWORK_MESSAGE });
    if (!result.ignore) {
      setStatus(status, { state: "error", message: result.message || NETWORK_MESSAGE });
    }
  }

  // Map the API's errors[].path onto the matching fields; returns true if any landed.
  function mapFieldErrors(error) {
    const details = Array.isArray(error?.details) ? error.details : [];
    let firstInput = null;
    for (const detail of details) {
      const path = Array.isArray(detail?.path) ? detail.path[0] : detail?.path;
      const name = path === "image" ? "imageUrl" : path;
      const input = name && form.elements[name];
      if (input) {
        setFieldError(input, detail.message || "Check this field and try again.");
        if (!firstInput) firstInput = input;
      }
    }
    if (firstInput) firstInput.focus();
    return firstInput !== null;
  }
}
