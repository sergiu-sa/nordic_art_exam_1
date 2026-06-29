// Login page
// Chrome from nav.js, the door entrance + peek from account.js, and the form wiring below
// (validate → login() → welcome swap honouring ?from= / field + form errors).

import { initNav, syncAuthState } from "../nav.js";
import { initDoor } from "../account.js";
import { login, isLoggedIn } from "../auth.js";
import { validateLogin } from "../validation.js";
import {
  showFieldErrors,
  setFieldError,
  clearFieldError,
  setStatus,
  renderFormSuccess,
  errorToMessage,
} from "../ui.js";

initNav();
initDoor();

const FIELDS = ["email", "password"];
const BAD_CREDENTIALS = "That key doesn't fit. Check your email or password.";
const GENERIC_ERROR = "Could not log you in. Please try again.";

// Where the welcome link sends an owner back to.
// The guard passes only a page name, not the artwork id, so edit returns to "my works".
const RETURN_TARGETS = {
  create: { href: "../artwork/create.html", label: "add artwork" },
  edit: { href: "../profile.html", label: "my works" },
  profile: { href: "../profile.html", label: "my works" },
};
const DEFAULT_RETURN = { href: "../index.html", label: "into the archive" };

// The card's one line, set by where the visitor came from.
const LANDING_MESSAGES = {
  create: "Log in first — then hang your work.",
  edit: "Log in first — then tend your work.",
  profile: "Log in first — this room is yours.",
};

const form = document.getElementById("login-form");
const status = document.getElementById("status");
const submit = document.getElementById("go");
const hello = document.getElementById("hello");

if (isLoggedIn()) {
  // an already-signed-in owner isn't asked to log in again
  showWelcome();
} else {
  applyLandingMessage();
  if (form) {
    wireInlineValidation();
    form.addEventListener("submit", onSubmit);
  }
}

// trim email (callers trim before validating); never trim the password
function readValues() {
  return {
    email: form.elements.email.value.trim(),
    password: form.elements.password.value,
  };
}

function wireInlineValidation() {
  for (const name of FIELDS) {
    const input = form.elements[name];
    input.addEventListener("input", () => clearFieldError(input));
    input.addEventListener("blur", () => {
      if (!input.value) return; // don't nag a field the user only passed through
      const message = validateLogin(readValues())[name];
      if (message) setFieldError(input, message);
      else clearFieldError(input);
    });
  }
}

async function onSubmit(event) {
  event.preventDefault();
  const values = readValues();
  const clean = showFieldErrors(form, validateLogin(values));
  if (!clean) return; // showFieldErrors has focused the first invalid field

  submit.disabled = true;
  setStatus(status, { state: "busy", message: "unlocking…" });
  try {
    await login(values);
    showWelcome();
  } catch (error) {
    handleFailure(error);
  } finally {
    submit.disabled = false;
  }
}

// Success: flip the chrome to authed in place, then swap the form for the serif welcome.
function showWelcome() {
  if (!form) return;
  syncAuthState();
  setStatus(status, { state: "idle", message: "" });
  renderFormSuccess(form, {
    message: "Welcome back.",
    actions: [returnAction()],
  });
}

function returnAction() {
  const from = new URLSearchParams(location.search).get("from");
  return RETURN_TARGETS[from] ?? DEFAULT_RETURN;
}

function applyLandingMessage() {
  if (!hello) return;
  const params = new URLSearchParams(location.search);
  if (params.get("registered") === "1") {
    hello.textContent = "Your account's ready — log in to step inside.";
    return;
  }
  const message = LANDING_MESSAGES[params.get("from")];
  if (message) hello.textContent = message;
}

// 401 is the one expected failure (bad email-or-password) — a form-level message in the archive's voice.
// A 400 is a field-shape error (a missing/invalid field with a path);
// after client validation it's nearly unreachable, but handle it on the field defensively.
// Everything else (network/abort/bootstrap anomaly) goes through errorToMessage.
function handleFailure(error) {
  if (error?.status === 401) {
    setStatus(status, { state: "error", message: BAD_CREDENTIALS });
    return;
  }
  if (error?.status === 400) {
    const field = fieldFromError(error);
    setStatus(status, { state: "idle", message: "" });
    setFieldError(form.elements[field], error.message || "Check this field and try again.");
    form.elements[field].focus();
    return;
  }
  const result = errorToMessage(error, { fallback: GENERIC_ERROR });
  if (!result.ignore) {
    setStatus(status, {
      state: "error",
      message: result.message || GENERIC_ERROR,
    });
  }
}

function fieldFromError(error) {
  const path = error?.details?.[0]?.path;
  const field = Array.isArray(path) ? path[0] : path;
  return FIELDS.includes(field) ? field : "email";
}
