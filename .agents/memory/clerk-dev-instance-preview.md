---
name: Clerk "needs_client_trust not supported yet" in the preview
description: Root cause is a stale clerk-js v5 (deprecated @clerk/clerk-react); the fix is migrating to @clerk/react v6. Also covers dev rate limits.
---

# Clerk `needs_client_trust not supported yet`

Login error seen in the dev preview (and in a full browser tab), often surfaced via
the Vite runtime-error overlay:

```
ClerkJS: Response: needs_client_trust not supported yet.
  at .../npm/@clerk/clerk-js@5.127.0/dist/...
```

## Root cause — stale clerk-js major (PRIMARY)

The loaded **clerk-js is too old** to handle the `client_trust` handshake Clerk's FAPI
now requires. The SDK major **determines** which clerk-js major loads from the CDN:

- `@clerk/clerk-react` (Core 2, **deprecated, frozen at v5**) → loads **clerk-js@5**,
  which throws `needs_client_trust not supported yet`.
- `@clerk/react` (Core 3, **v6**, the canonical package) → loads **clerk-js@6**, which
  supports the handshake.

**Correction:** an earlier note here wrongly said "SDK major doesn't change runtime
clerk-js." That is false — verified by the CDN URL: v5 SDK pulls clerk-js@5, v6 SDK
pulls clerk-js@6. **Why it matters:** don't dismiss this error as mere iframe/rate-limit
friction; if the app still imports from `@clerk/clerk-react`, the SDK migration is the fix.

## The fix — migrate to `@clerk/react` (Core 3)

Swap every `@clerk/clerk-react` import to `@clerk/react`. The hooks/components
`ClerkProvider`, `useAuth`, `useClerk`, `useUser`, `SignIn`, `SignUp` are unchanged.
Core 3 **removed** the control components `SignedIn` / `SignedOut` / `RedirectToSignIn`:

- `<SignedIn>` → `<Show when="signed-in">`
- `<SignedOut>` → `<Show when="signed-out">`
- `<RedirectToSignIn />` → wouter `<Redirect to="/sign-in" />` (base-relative inside
  `<WouterRouter base={basePath}>`; resolves to `${basePath}/sign-in`)

`Show` is imported from `@clerk/react`. After migrating, remove the now-dead
`@clerk/clerk-react` dependency so two clerk-js majors can't both be resolvable.

## Secondary friction (real, but not the root cause)

- **"Too many requests"**: the Clerk **dev** instance has strict rate limits; transient,
  resets after a wait. Do NOT add custom error-interception / overlay-suppression or a
  `storage`-event reload loop — the loop hammers FAPI and triggers the rate limit.
- **New-browser trust** in the cross-origin preview iframe: open the app in a full
  browser tab to complete the one-time handshake. (With clerk-js@6 this is handled
  properly; it was the stale v5 that hard-failed.)
- For end users, **publish** — prod uses a separate Clerk PROD instance with none of
  the dev rate limits.
