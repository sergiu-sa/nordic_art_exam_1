// Shared feedback: loading / success / empty / error states and form-kit feedback. Stateless helpers, callers pass their elements.

const DEFAULT_FALLBACK = "Something went wrong.";

// `ignore: true` signals a cancelled (aborted) request — render nothing.
export function errorToMessage(error, { fallback = DEFAULT_FALLBACK } = {}) {
  if (error?.isAbort) return { ignore: true };
  if (error?.isNetwork) {
    return {
      message: "Couldn't reach the archive.",
      sub: "Check your connection and try again.",
    };
  }
  if (error?.status === 401) return { message: "Please log in again." };
  if (error?.status === 404) return { message: "This work isn't in the archive." };
  return { message: error?.message || fallback };
}

// ---- form feedback (login, register, create, edit) ----

function fieldErrorNode(input) {
  const doc = input.ownerDocument;
  const ids = (input.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
  for (const id of ids) {
    const node = doc.getElementById(id);
    if (node?.classList.contains("ferr")) return node;
  }
  return null;
}

export function setFieldError(input, message) {
  input.setAttribute("aria-invalid", "true");
  const node = fieldErrorNode(input);
  if (node) {
    node.textContent = message;
    node.classList.add("on");
  }
}

export function clearFieldError(input) {
  input.removeAttribute("aria-invalid");
  const node = fieldErrorNode(input);
  if (node) {
    node.textContent = "";
    node.classList.remove("on");
  }
}

export function clearFieldErrors(form) {
  form.querySelectorAll("[aria-invalid='true']").forEach((input) => clearFieldError(input));
}

// errors: { fieldName: message|null } — validation.js's shape.
export function showFieldErrors(form, errors) {
  let firstInvalid = null;
  for (const [name, message] of Object.entries(errors)) {
    const input = form.elements[name];
    if (!input) continue;
    if (message) {
      setFieldError(input, message);
      if (!firstInvalid) firstInvalid = input;
    } else {
      clearFieldError(input);
    }
  }
  if (firstInvalid) firstInvalid.focus();
  return firstInvalid === null;
}

function ensureChild(parent, selector, className, prepend = false) {
  let node = parent.querySelector(selector);
  if (!node) {
    node = parent.ownerDocument.createElement("span");
    node.className = className;
    if (prepend) parent.prepend(node);
    else parent.appendChild(node);
  }
  return node;
}

export function setStatus(statusEl, { state = "idle", message = "" } = {}) {
  const msg = ensureChild(statusEl, ".msg", "msg", true);
  let lbar = statusEl.querySelector(".lbar");
  if (!lbar) {
    const doc = statusEl.ownerDocument;
    lbar = doc.createElement("span");
    lbar.className = "lbar";
    lbar.setAttribute("aria-hidden", "true");
    lbar.appendChild(doc.createElement("i"));
    statusEl.appendChild(lbar);
  }
  msg.textContent = message;
  statusEl.classList.toggle("busy", state === "busy");
  statusEl.classList.toggle("err", state === "error");
  if (!statusEl.hasAttribute("role")) statusEl.setAttribute("role", "status");
  if (!statusEl.hasAttribute("aria-live")) statusEl.setAttribute("aria-live", "polite");
}

// Side effects (redirect, emptying the studio wall) stay in the page.
export function renderFormSuccess(form, { message, actions = [] }) {
  const doc = form.ownerDocument;
  const block = doc.createElement("div");
  block.className = "formdone";

  const heading = doc.createElement("h2");
  heading.className = "formdone__msg";
  heading.setAttribute("tabindex", "-1");
  heading.textContent = message;
  block.appendChild(heading);

  for (const action of actions) {
    const link = doc.createElement("a");
    link.className = "formdone__link";
    link.href = action.href;
    link.textContent = action.label;
    block.appendChild(link);
  }

  form.hidden = true;
  form.after(block);
  heading.focus();
  return block;
}

// ---- region / data feedback (feed, detail, collection) ----

const DEFAULT_SKELETON_COUNT = 12;
const DEFAULT_SKELETON_HEIGHT = 240;

export function renderSkeletonGrid(
  container,
  { count = DEFAULT_SKELETON_COUNT, tileHeight = DEFAULT_SKELETON_HEIGHT } = {}
) {
  const doc = container.ownerDocument;
  const fragment = doc.createDocumentFragment();
  for (let i = 0; i < count; i += 1) {
    const fig = doc.createElement("figure");
    fig.className = "skfig";
    fig.setAttribute("aria-hidden", "true");
    const tile = doc.createElement("div");
    tile.className = "skeleton";
    tile.style.height = `${tileHeight}px`;
    const barTitle = doc.createElement("div");
    barTitle.className = "skbar t";
    const barMeta = doc.createElement("div");
    barMeta.className = "skbar a";
    fig.append(tile, barTitle, barMeta);
    fragment.appendChild(fig);
  }
  container.replaceChildren(fragment);
  return container;
}

function stateBlock(doc, className, { message, sub }) {
  const block = doc.createElement("div");
  block.className = className;
  const msg = doc.createElement("p");
  msg.className = "emsg";
  msg.textContent = message;
  block.appendChild(msg);
  if (sub) {
    const subEl = doc.createElement("p");
    subEl.className = "esub";
    subEl.textContent = sub;
    block.appendChild(subEl);
  }
  return block;
}

export function renderError(
  container,
  { message, sub = "", onRetry, retryLabel = "try again" } = {}
) {
  const doc = container.ownerDocument;
  const block = stateBlock(doc, "statefail", { message, sub });
  block.setAttribute("role", "alert");
  if (typeof onRetry === "function") {
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.className = "ebtn";
    btn.textContent = retryLabel;
    btn.addEventListener("click", onRetry);
    block.appendChild(btn);
  }
  container.replaceChildren(block);
  return block;
}

export function renderEmpty(container, { message, sub = "", action } = {}) {
  const doc = container.ownerDocument;
  const block = stateBlock(doc, "stateempty", { message, sub });
  if (action) {
    let node;
    if (action.href) {
      node = doc.createElement("a");
      node.href = action.href;
    } else {
      node = doc.createElement("button");
      node.type = "button";
      if (typeof action.onClick === "function") {
        node.addEventListener("click", action.onClick);
      }
    }
    node.className = "ebtn";
    node.textContent = action.label;
    block.appendChild(node);
  }
  container.replaceChildren(block);
  return block;
}

// Swap a broken image for a titled paper plate, never a broken-image icon.
export function guardImage(img, { title = "" } = {}) {
  img.addEventListener(
    "error",
    () => {
      const plate = img.ownerDocument.createElement("div");
      plate.className = "deadimg";
      plate.textContent = title || "image unavailable";
      img.replaceWith(plate);
    },
    { once: true }
  );
  return img;
}
