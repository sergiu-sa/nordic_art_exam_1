// The "take it down" flow — the inline, focus-managed confirm (no modal) and the DELETE call, shared by the edit page's studio and the detail page's owner tools.
// What happens on success differs per page, so the caller passes onDeleted.
// Both pages provide the same confirm markup ids.
import { setStatus, errorToMessage } from "./ui.js";

const AUTH_MESSAGE = "Your session has expired — please log in again.";
const NETWORK_MESSAGE = "Couldn't reach the archive. Check your connection and try again.";

export function initDelete({ id, title, deleteVerb, onDeleted }) {
  const del = document.getElementById("del");
  const confirmBox = document.getElementById("confirm");
  const yes = document.getElementById("del-yes");
  const keep = document.getElementById("del-keep");
  const status = document.getElementById("del-status");
  const relog = document.getElementById("del-relog");
  const titleEl = document.getElementById("confirm-title");
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
