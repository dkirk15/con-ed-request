import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Clerk dev-mode "needs_client_trust" recovery
//
// On a browser that has never visited this Clerk dev instance, FAPI returns
// needs_client_trust.  We intercept this in two places:
//   1. index.html — a MutationObserver + capture-phase listener that runs
//      before Vite's HMR client injection, preventing the runtime-error
//      overlay from appearing at all.
//   2. Here — shows a user-friendly "Complete setup" overlay and opens the
//      Clerk dev-browser handshake in a new tab (avoids iframe frame
//      restrictions on clerk.accounts.dev).  localStorage is shared between
//      this iframe and any new tab on the same origin, so when the new tab
//      stores the Clerk dev-browser token, a `storage` listener here
//      auto-reloads the iframe and Clerk proceeds normally.
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
      // localStorage is shared across all contexts on the same origin.
      window.addEventListener("storage", (e) => {
        const key = e.key ?? "";
        if (key.includes("clerk") || key.includes("__dev_browser")) {
          window.location.reload();
        }
      });
    };

    // Use capture phase so our listener fires before Vite's bubble-phase listener.
    // stopImmediatePropagation prevents the runtime-error overlay from seeing it.
    window.addEventListener(
      "error",
      (e) => {
        if (
          (e.error instanceof Error
            ? e.error.message
            : String(e.error ?? "")
          ).includes("needs_client_trust")
        ) {
          e.preventDefault();
          e.stopImmediatePropagation();
          maybeHandle(e.error);
        }
      },
      true,
    );
    window.addEventListener(
      "unhandledrejection",
      (e) => {
        const msg =
          e.reason instanceof Error
            ? e.reason.message
            : String(e.reason ?? "");
        if (msg.includes("needs_client_trust")) {
          e.preventDefault();
          e.stopImmediatePropagation();
          maybeHandle(e.reason);
        }
      },
      true,
    );
  }
}

createRoot(document.getElementById("root")!).render(<App />);
