// Create page: just the auth guard for now.
// base.css hides <main> until requireAuth confirms the session, so a logged-out hit never flashes content.
import { requireAuth } from "../auth.js";

if (requireAuth({ from: "create" })) {
  document.querySelector(".guarded")?.classList.remove("guarded");
}
