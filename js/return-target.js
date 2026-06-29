// Resolves where login sends an owner after auth, from the parsed ?from / ?id. Pure (no DOM,
// no location) so it stays unit-testable. Only built guarded pages auto-resume (create, and
// edit with an id); anything else falls to the welcome default, so login never navigates to a
// page that isn't there, like the unbuilt profile. The `from` whitelist is closed and the
// edit id is encoded onto a fixed path, so a crafted ?from / ?id can't redirect off-site.

const RETURN_TARGETS = {
  create: { href: "../artwork/create.html", label: "add artwork" },
};

const DEFAULT_RETURN = { href: "../index.html", label: "into the archive" };

export function resolveReturn({ from, id } = {}) {
  if (from === "edit" && id) {
    return {
      href: `../artwork/edit.html?id=${encodeURIComponent(id)}`,
      label: "edit",
      resume: true,
    };
  }
  if (from && Object.prototype.hasOwnProperty.call(RETURN_TARGETS, from)) {
    return { ...RETURN_TARGETS[from], resume: true };
  }
  return { ...DEFAULT_RETURN, resume: false };
}
