// The "take it down" flow — the inline, focus-managed confirm (no modal) and the DELETE call, shared by the edit page's studio, the detail page's owner tools, and the profile room's per-card tools.
// What happens on success differs per page, so the caller passes onDeleted.
// The legacy pages (edit, detail) provide the confirm markup by ids; a scoped root instance resolves the same parts by class instead.
import { setStatus, errorToMessage } from "./ui.js";

const AUTH_MESSAGE = "Your session has expired — please log in again.";
const NETWORK_MESSAGE = "Couldn't reach the archive. Check your connection and try again.";

function resolveElements(root) {
  if (root) {
    return {
      del: root.querySelector(".del"),
      confirmBox: root.querySelector(".confirm"),
      yes: root.querySelector(".del-yes"),
      keep: root.querySelector(".del-keep"),
      status: root.querySelector(".del-status"),
      relog: root.querySelector(".del-relog"),
      titleEl: root.querySelector(".confirm-title"),
    };
  }
  return {
    del: document.getElementById("del"),
    confirmBox: document.getElementById("confirm"),
    yes: document.getElementById("del-yes"),
    keep: document.getElementById("del-keep"),
    status: document.getElementById("del-status"),
    relog: document.getElementById("del-relog"),
    titleEl: document.getElementById("confirm-title"),
  };
}

export function initDelete({ id, title, deleteVerb, onDeleted, root }) {
  const { del, confirmBox, yes, keep, status, relog, titleEl } = resolveElements(root);
  if (!del || !confirmBox || !yes || !keep) return;

  if (titleEl && title) titleEl.textContent = title;

  function closeConfirm() {
    confirmBox.hidden = true;
    setStatus(status, { state: "idle", message: "" });
    del.focus();
  }

  del.addEventListener("click", () => {
    confirmBox.hidden = false;
    if (relog) relog.style.display = "none";
    confirmBox.focus(); // tabindex=-1 — moves focus to the question region
  });

  keep.addEventListener("click", closeConfirm);

  confirmBox.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeConfirm();
  });

  yes.addEventListener("click", async () => {
    yes.disabled = true;
    keep.disabled = true;
    if (relog) relog.style.display = "none";
    setStatus(status, { state: "busy", message: "taking it down…" });
    try {
      await deleteVerb(id);
      onDeleted();
    } catch (error) {
      handleFailure(error);
    } finally {
      yes.disabled = false;
      keep.disabled = false;
    }
  });

  function handleFailure(error) {
    if (error?.status === 401) {
      setStatus(status, { state: "error", message: AUTH_MESSAGE });
      if (relog) relog.style.display = "inline-flex";
      return;
    }
    const result = errorToMessage(error, { fallback: NETWORK_MESSAGE });
    if (!result.ignore) {
      setStatus(status, { state: "error", message: result.message || NETWORK_MESSAGE });
    }
  }
}
