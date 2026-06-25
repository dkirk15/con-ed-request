---
name: Clerk dev-instance login friction in Replit preview
description: Why needs_client_trust / "too many requests" appear at login in the dev preview, and what actually fixes it (vs. what makes it worse)
---

# Clerk dev-instance login friction in the Replit preview

Login symptoms in the **dev preview** (a cross-origin iframe), especially from a
browser that has never visited the Clerk dev instance:

- `needs_client_trust not supported yet`
- `Too many requests. Please try again in a bit.` at the password step

## What these actually are (NOT code bugs)

- **needs_client_trust**: Clerk dev instances run a one-time new-browser trust
  handshake that cannot complete inside the cross-origin preview iframe. Completing it
  in a **real browser tab** establishes trust; the iframe then proceeds.
- **Too many requests**: the Clerk **dev** instance has strict rate limits. Repeated
  retries — and any auto-reload loop — exhaust them. Transient; resets after a wait.

## What makes it worse — do not do this

Custom error-interception / overlay-suppression plus a `storage`-event reload loop.
The reload loop hammers FAPI and is what triggers the rate limit. **Why:** keep the
canonical entry files; brittle workarounds amplify the very rate limit they fight.

## SDK major does not matter here

Both Core 2 (`@clerk/clerk-react` v5) and Core 3 (`@clerk/react` v6) load clerk-js from
the CDN at the latest of their major (no pinned dep), so swapping SDK major does not
change the runtime clerk-js and won't fix needs_client_trust. **Why:** don't attempt a
Core2→Core3 migration as a login fix — and note Core 3 drops `SignedIn`/`SignedOut`/
`RedirectToSignIn` (use `<Show when="...">`), so the swap is non-trivial.

## Actual fix path

1. Remove custom reload/overlay workarounds (back to canonical).
2. Rate limit is transient — wait, then retry.
3. New-browser handshake: open the preview in a **full browser tab**, not the iframe.
4. Real fix for end users: **publish**. Prod uses a separate Clerk PROD instance
   (pk_live + proxy) with none of the dev rate limits or new-browser friction.
