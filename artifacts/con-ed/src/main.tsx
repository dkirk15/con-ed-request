import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Clerk dev-mode "needs_client_trust" recovery
//
// On a browser that has never visited this Clerk dev instance before, Clerk's
// FAPI returns a `needs_client_trust` response before the React tree even
// mounts.  Clerk's own SignIn component would show a "Development mode" link
// to handle this, but the error surfaces as an unhandled rejection that Vite's
// runtime-error overlay catches first — making the link inert.
//
// We intercept the error here (before React renders), derive the FAPI host
// from the publishable key, and redirect the browser to Clerk's dev-browser
// handshake endpoint.  After the handshake Clerk redirects back to the app
// with a dev-browser token cookie set, and sign-in proceeds normally.
//
// Only active for pk_test_ keys (dev instances); production keys (pk_live_)
// use the proxy and don't need this workaround.
const rawKey = (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string) ?? "";
if (rawKey.startsWith("pk_test_")) {
  let fapiUrl = "";
  try {
    const decoded = atob(rawKey.replace("pk_test_", "")).replace(/\$$/, "");
    if (decoded) fapiUrl = `https://${decoded}`;
  } catch {
    // malformed key — skip the redirect logic
  }

  if (fapiUrl) {
    const maybeRedirect = (reason: unknown) => {
      const msg =
        reason instanceof Error ? reason.message : String(reason ?? "");
      if (msg.includes("needs_client_trust")) {
        const redirectUrl = encodeURIComponent(window.location.href);
        window.location.replace(
          `${fapiUrl}/v1/dev_browser?redirect_url=${redirectUrl}`,
        );
      }
    };

    window.addEventListener("error", (e) => maybeRedirect(e.error));
    window.addEventListener("unhandledrejection", (e) => {
      e.preventDefault();
      maybeRedirect(e.reason);
    });
  }
}

createRoot(document.getElementById("root")!).render(<App />);
