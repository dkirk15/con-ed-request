import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Clerk dev-mode "needs_client_trust" recovery
//
// On a browser that has never visited this Clerk dev instance, FAPI returns
// needs_client_trust.  The fix is to visit Clerk's dev-browser handshake URL
// so it can set a dev-browser token, then come back.
//
// Problem: Clerk's accounts.dev domain has frame restrictions, so navigating
// the iframe there just gives a blank page.  Instead we:
//   1. Suppress the Vite runtime-error overlay (preventDefault).
//   2. Show a one-button overlay in the page.
//   3. The button opens the handshake in a NEW TAB (no frame restrictions).
//      Clerk redirects the new tab back to the app URL with ?__clerk_db_jwt=…
//      The new tab stores the token in localStorage for this origin.
//   4. A `storage` listener in the iframe detects the token and auto-reloads,
//      at which point Clerk finds the token and sign-in proceeds normally.
//
// Only active for pk_test_ keys (dev instances).

const rawKey = (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string) ?? "";
if (rawKey.startsWith("pk_test_")) {
  let fapiUrl = "";
  try {
    const decoded = atob(rawKey.replace("pk_test_", "")).replace(/\$$/, "");
    if (decoded) fapiUrl = `https://${decoded}`;
  } catch {
    // malformed key — skip
  }

  if (fapiUrl) {
    let overlayShown = false;

    const maybeHandle = (reason: unknown) => {
      const msg =
        reason instanceof Error ? reason.message : String(reason ?? "");
      if (!msg.includes("needs_client_trust")) return;
      if (overlayShown) return;
      overlayShown = true;

      const redirectUrl = encodeURIComponent(window.location.href);
      const handshakeUrl = `${fapiUrl}/v1/dev_browser?redirect_url=${redirectUrl}`;

      // Overlay sits on top of whatever React has rendered.
      const overlay = document.createElement("div");
      overlay.id = "clerk-trust-overlay";
      overlay.style.cssText = [
        "position:fixed",
        "inset:0",
        "z-index:99999",
        "display:flex",
        "flex-direction:column",
        "align-items:center",
        "justify-content:center",
        "gap:16px",
        "background:#f9fafb",
        "font-family:system-ui,sans-serif",
        "padding:24px",
        "text-align:center",
      ].join(";");

      overlay.innerHTML = `
        <h2 style="margin:0;font-size:20px;font-weight:600;color:#111">
          One-time browser setup
        </h2>
        <p style="margin:0;color:#555;max-width:380px;line-height:1.5">
          You're signing in from a new browser. Click below to complete a
          quick one-time setup. The page will reload automatically once
          it's done.
        </p>
        <a
          href="${handshakeUrl}"
          target="_blank"
          rel="noopener noreferrer"
          style="background:#1d4ed8;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:500;font-size:15px"
        >
          Complete setup (opens new tab)
        </a>
        <p style="margin:0;font-size:13px;color:#888">
          After the setup tab closes or redirects, this page reloads on its own.
        </p>
      `;

      document.body.appendChild(overlay);

      // Auto-reload when the new tab stores the Clerk dev-browser token.
      window.addEventListener("storage", (e) => {
        const key = e.key ?? "";
        if (key.includes("clerk") || key.includes("__dev_browser")) {
          window.location.reload();
        }
      });
    };

    window.addEventListener("error", (e) => maybeHandle(e.error));
    window.addEventListener("unhandledrejection", (e) => {
      e.preventDefault(); // suppress Vite runtime-error overlay
      maybeHandle(e.reason);
    });
  }
}

createRoot(document.getElementById("root")!).render(<App />);
