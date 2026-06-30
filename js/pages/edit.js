// Edit page: just the auth guard for now, carrying the artwork id so a guarded owner resumes to this exact work after login.
import { requireAuth } from "../auth.js";

const id = new URLSearchParams(location.search).get("id") || undefined;

if (requireAuth({ from: "edit", id })) {
  document.querySelector(".guarded")?.classList.remove("guarded");
}
