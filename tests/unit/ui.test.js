// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { errorToMessage } from "../../js/ui.js";

describe("errorToMessage", () => {
  it("ignores aborted requests", () => {
    expect(errorToMessage({ isAbort: true })).toEqual({ ignore: true });
  });

  it("maps network errors to connection copy", () => {
    const result = errorToMessage({ isNetwork: true });
    expect(result.message).toMatch(/reach the archive/i);
    expect(result.sub).toMatch(/connection/i);
  });

  it("maps 401 to a re-login message", () => {
    expect(errorToMessage({ status: 401 })).toEqual({ message: "Please log in again." });
  });

  it("maps 404 to a not-found message", () => {
    expect(errorToMessage({ status: 404 })).toEqual({
      message: "This work isn't in the archive.",
    });
  });

  it("uses the error's own message when present", () => {
    expect(errorToMessage({ message: "Title is required." })).toEqual({
      message: "Title is required.",
    });
  });

  it("falls back when there is no usable message", () => {
    expect(errorToMessage({})).toEqual({ message: "Something went wrong." });
    expect(errorToMessage({}, { fallback: "Custom." })).toEqual({ message: "Custom." });
  });

  it("falls back when the error message is an empty string", () => {
    expect(errorToMessage({ message: "" })).toEqual({ message: "Something went wrong." });
  });

  it("falls back when the error is null or undefined", () => {
    expect(errorToMessage(null)).toEqual({ message: "Something went wrong." });
    expect(errorToMessage(undefined)).toEqual({ message: "Something went wrong." });
  });
});

import {
  setFieldError,
  clearFieldError,
  clearFieldErrors,
  showFieldErrors,
  setStatus,
  renderFormSuccess,
} from "../../js/ui.js";

function makeForm() {
  document.body.innerHTML = `
    <form>
      <span class="fbox"><input id="title" name="title" aria-describedby="title-err" /></span>
      <p class="ferr" id="title-err"></p>
      <span class="fbox"><input id="artist" name="artist" aria-describedby="artist-err" /></span>
      <p class="ferr" id="artist-err"></p>
      <p class="status" id="status" role="status" aria-live="polite">
        <span class="msg"></span><span class="lbar" aria-hidden="true"><i></i></span>
      </p>
    </form>`;
  return document.querySelector("form");
}

describe("field errors", () => {
  it("setFieldError marks the input and shows the message", () => {
    const form = makeForm();
    const input = form.elements.title;
    setFieldError(input, "Title is required.");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const err = document.getElementById("title-err");
    expect(err.textContent).toBe("Title is required.");
    expect(err.classList.contains("on")).toBe(true);
  });

  it("clearFieldError reverses it", () => {
    const form = makeForm();
    const input = form.elements.title;
    setFieldError(input, "Title is required.");
    clearFieldError(input);
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    const err = document.getElementById("title-err");
    expect(err.textContent).toBe("");
    expect(err.classList.contains("on")).toBe(false);
  });

  it("clearFieldErrors clears every invalid field", () => {
    const form = makeForm();
    setFieldError(form.elements.title, "a");
    setFieldError(form.elements.artist, "b");
    clearFieldErrors(form);
    expect(form.querySelectorAll("[aria-invalid='true']").length).toBe(0);
  });
});

describe("showFieldErrors", () => {
  it("applies messages, focuses the first invalid, returns false", () => {
    const form = makeForm();
    const valid = showFieldErrors(form, { title: "Title is required.", artist: null });
    expect(valid).toBe(false);
    expect(document.activeElement).toBe(form.elements.title);
    expect(document.getElementById("artist-err").classList.contains("on")).toBe(false);
  });

  it("returns true and clears when all fields pass", () => {
    const form = makeForm();
    setFieldError(form.elements.title, "old");
    const valid = showFieldErrors(form, { title: null, artist: null });
    expect(valid).toBe(true);
    expect(document.getElementById("title-err").classList.contains("on")).toBe(false);
  });

  it("ignores unknown field names without throwing", () => {
    const form = makeForm();
    const valid = showFieldErrors(form, { nonexistent: "x", title: null, artist: null });
    expect(valid).toBe(true);
  });
});

describe("setStatus", () => {
  it("busy adds .busy and writes the message", () => {
    makeForm();
    const status = document.getElementById("status");
    setStatus(status, { state: "busy", message: "unlocking…" });
    expect(status.classList.contains("busy")).toBe(true);
    expect(status.querySelector(".msg").textContent).toBe("unlocking…");
  });

  it("error adds .err and not .busy", () => {
    makeForm();
    const status = document.getElementById("status");
    setStatus(status, { state: "error", message: "That key doesn't fit." });
    expect(status.classList.contains("err")).toBe(true);
    expect(status.classList.contains("busy")).toBe(false);
  });

  it("idle clears both state classes", () => {
    makeForm();
    const status = document.getElementById("status");
    setStatus(status, { state: "busy", message: "x" });
    setStatus(status, { state: "idle", message: "" });
    expect(status.classList.contains("busy")).toBe(false);
    expect(status.classList.contains("err")).toBe(false);
    expect(status.querySelector(".msg").textContent).toBe("");
  });

  it("creates .msg and .lbar defensively when markup omits them", () => {
    document.body.innerHTML = `<p class="status"></p>`;
    const status = document.querySelector(".status");
    setStatus(status, { state: "busy", message: "hi" });
    expect(status.querySelector(".msg").textContent).toBe("hi");
    expect(status.querySelector(".lbar i")).not.toBeNull();
    expect(status.getAttribute("role")).toBe("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
  });

  it("is idempotent when called twice with the same state", () => {
    makeForm();
    const status = document.getElementById("status");
    setStatus(status, { state: "busy", message: "x" });
    setStatus(status, { state: "busy", message: "y" });
    expect(status.classList.contains("busy")).toBe(true);
    expect(status.querySelectorAll(".lbar").length).toBe(1);
    expect(status.querySelectorAll(".msg").length).toBe(1);
    expect(status.querySelector(".msg").textContent).toBe("y");
  });
});

describe("renderFormSuccess", () => {
  it("hides the form, shows message + actions, moves focus", () => {
    const form = makeForm();
    const block = renderFormSuccess(form, {
      message: "It hangs. The archive grew by one.",
      actions: [
        { label: "view it", href: "/artwork/index.html?id=1" },
        { label: "add another", href: "/artwork/create.html" },
      ],
    });
    expect(form.hidden).toBe(true);
    expect(block.classList.contains("formdone")).toBe(true);
    expect(block.querySelector(".formdone__msg").textContent).toMatch(/It hangs/);
    const links = block.querySelectorAll(".formdone__link");
    expect(links.length).toBe(2);
    expect(links[0].getAttribute("href")).toBe("/artwork/index.html?id=1");
    expect(document.activeElement).toBe(block.querySelector(".formdone__msg"));
  });
});

import { renderSkeletonGrid, renderError, renderEmpty, guardImage } from "../../js/ui.js";

describe("renderSkeletonGrid", () => {
  it("builds N skeleton cards and hides them from SR", () => {
    document.body.innerHTML = `<div id="grid"></div>`;
    const grid = document.getElementById("grid");
    renderSkeletonGrid(grid, { count: 3, tileHeight: 200 });
    expect(grid.hasAttribute("aria-hidden")).toBe(false);
    grid.querySelectorAll(".skfig").forEach((fig) => {
      expect(fig.getAttribute("aria-hidden")).toBe("true");
    });
    expect(grid.querySelectorAll(".skfig").length).toBe(3);
    const tile = grid.querySelector(".skfig .skeleton");
    expect(tile.style.height).toBe("200px");
    expect(grid.querySelector(".skbar.t")).not.toBeNull();
    expect(grid.querySelector(".skbar.a")).not.toBeNull();
  });

  it("defaults to 12 cards", () => {
    document.body.innerHTML = `<div id="grid"></div>`;
    renderSkeletonGrid(document.getElementById("grid"), {});
    expect(document.querySelectorAll("#grid .skfig").length).toBe(12);
  });
});

describe("renderError", () => {
  it("renders message + sub and announces", () => {
    document.body.innerHTML = `<div id="region"></div>`;
    const region = document.getElementById("region");
    renderError(region, { message: "Couldn't load the feed.", sub: "Try again." });
    const block = region.querySelector(".statefail");
    expect(block.getAttribute("role")).toBe("alert");
    expect(block.querySelector(".emsg").textContent).toBe("Couldn't load the feed.");
    expect(block.querySelector(".esub").textContent).toBe("Try again.");
    expect(block.querySelector(".ebtn")).toBeNull();
  });

  it("wires a retry button only when onRetry is given", () => {
    document.body.innerHTML = `<div id="region"></div>`;
    const region = document.getElementById("region");
    const onRetry = vi.fn();
    renderError(region, { message: "x", onRetry, retryLabel: "reload" });
    const btn = region.querySelector(".ebtn");
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.classList.contains("tickbtn")).toBe(true);
    expect(btn.textContent).toMatch(/reload/);
    btn.click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("renders a link, not a button, for a navigation exit (retryHref)", () => {
    document.body.innerHTML = `<div id="region"></div>`;
    const region = document.getElementById("region");
    renderError(region, {
      message: "This work isn't in the archive.",
      retryHref: "../collection.html",
      retryLabel: "back to all artworks",
    });
    const action = region.querySelector(".ebtn");
    expect(action.tagName).toBe("A");
    expect(action.getAttribute("href")).toBe("../collection.html");
    expect(action.textContent).toMatch(/back to all artworks/);
  });

  it("prefers retryHref over onRetry when both are given", () => {
    document.body.innerHTML = `<div id="region"></div>`;
    const region = document.getElementById("region");
    renderError(region, { message: "x", retryHref: "/go", onRetry: vi.fn() });
    expect(region.querySelector(".ebtn").tagName).toBe("A");
  });

  it("replaces prior content", () => {
    document.body.innerHTML = `<div id="region"><p>old</p></div>`;
    const region = document.getElementById("region");
    renderError(region, { message: "new" });
    expect(region.textContent).not.toMatch(/old/);
  });
});

describe("renderEmpty", () => {
  it("renders an empty block with an action link", () => {
    document.body.innerHTML = `<div id="region"></div>`;
    const region = document.getElementById("region");
    renderEmpty(region, {
      message: "Nothing hangs here — yet.",
      action: { label: "browse all", href: "/index.html" },
    });
    const block = region.querySelector(".stateempty");
    expect(block.querySelector(".emsg").textContent).toMatch(/Nothing hangs/);
    const link = block.querySelector(".ebtn");
    expect(link.tagName).toBe("A");
    expect(link.classList.contains("tickbtn")).toBe(true);
    expect(link.getAttribute("href")).toBe("/index.html");
  });

  it("renders a button action with an onClick", () => {
    document.body.innerHTML = `<div id="region"></div>`;
    const onClick = vi.fn();
    renderEmpty(document.getElementById("region"), {
      message: "No matches.",
      action: { label: "clear filters", onClick },
    });
    const btn = document.querySelector(".stateempty .ebtn");
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.classList.contains("tickbtn")).toBe(true);
    btn.click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders no action button when action is omitted", () => {
    document.body.innerHTML = `<div id="region"></div>`;
    renderEmpty(document.getElementById("region"), { message: "Nothing here." });
    expect(document.querySelector(".stateempty .ebtn")).toBeNull();
  });
});

describe("guardImage", () => {
  it("swaps a dead image for a titled plate", () => {
    document.body.innerHTML = `<figure><img id="img" alt="" /></figure>`;
    const img = document.getElementById("img");
    guardImage(img, { title: "Starry Night" });
    img.dispatchEvent(new Event("error"));
    const plate = document.querySelector(".deadimg");
    expect(plate).not.toBeNull();
    expect(plate.textContent).toBe("Starry Night");
    expect(document.getElementById("img")).toBeNull();
  });

  it("falls back to a generic label when no title is given", () => {
    document.body.innerHTML = `<figure><img id="img" alt="" /></figure>`;
    const img = document.getElementById("img");
    guardImage(img, {});
    img.dispatchEvent(new Event("error"));
    expect(document.querySelector(".deadimg").textContent).toBe("image unavailable");
  });
});
