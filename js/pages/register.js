// Register page entry
// Chrome behaviour from nav.js, the door's entrance + peek from account.js, and the form wiring below (validate → register() → success swap / error).

import { initNav } from "../nav.js";
import { initDoor } from "../account.js";
import { register } from "../auth.js";
import { validateRegistration } from "../validation.js";
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

const FIELDS = ["name", "email", "password"];
const SUCCESS_MESSAGE = "Welcome to the archive.";
const GENERIC_ERROR = "Could not create your account. Please try again.";

const form = document.getElementById("register-form");
const status = document.getElementById("status");
const submit = document.getElementById("go");

if (form) {
  wireInlineValidation();
  form.addEventListener("submit", onSubmit);
}

// trim name + email (callers trim before validating); never trim the password
function readValues() {
  return {
    name: form.elements.name.value.trim(),
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
      const message = validateRegistration(readValues())[name];
      if (message) setFieldError(input, message);
      else clearFieldError(input);
    });
  }
}

async function onSubmit(event) {
  event.preventDefault();
  const values = readValues();
  const clean = showFieldErrors(form, validateRegistration(values));
  if (!clean) return; // showFieldErrors has focused the first invalid field

  submit.disabled = true;
  setStatus(status, { state: "busy", message: "making room…" });
  try {
    await register(values);
    renderFormSuccess(form, {
      message: SUCCESS_MESSAGE,
      actions: [{ href: "login.html?registered=1", label: "log in" }],
    });
  } catch (error) {
    handleFailure(error);
  } finally {
    submit.disabled = false;
  }
}

// After client validation a 400 is almost always a duplicate/invalid email, so put it on the field;
// everything else (network/500/...) is a form-level status message.
function handleFailure(error) {
  if (error?.status === 400) {
    const field = fieldFromError(error);
    setStatus(status, { state: "idle", message: "" });
    setFieldError(form.elements[field], error.message || "Check this field and try again.");
    form.elements[field].focus();
    return;
  }
  const result = errorToMessage(error, { fallback: GENERIC_ERROR });
  if (!result.ignore) {
    setStatus(status, { state: "error", message: result.message || GENERIC_ERROR });
  }
}

function fieldFromError(error) {
  const path = error?.details?.[0]?.path;
  const field = Array.isArray(path) ? path[0] : path;
  return FIELDS.includes(field) ? field : "email";
}
