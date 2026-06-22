---
name: Clerk + wouter base-path routing
description: Why Clerk SignIn/SignUp must use full base-prefixed paths and a wired router, or sign-up reload-loops
---

# Clerk path routing under a base path (con-ed and any artifact served under a sub-path)

Artifacts are served under a base path (`import.meta.env.BASE_URL`, set from
`BASE_PATH` in vite.config). Clerk's `<SignIn>`/`<SignUp>` with `routing="path"`
read `window.location.pathname` **directly**, so their `path`/`signInUrl`/
`signUpUrl`/`forceRedirectUrl` props must be **full** paths including the base
prefix (`` `${basePath}/sign-in` ``), even though wouter's `<Route>` paths are
base-relative.

**Why:** A bare `path="/"` on `<SignIn>`, plus routing `/sign-up` back to the
SignIn component (no `<SignUp>` at all), plus a `ClerkProvider` with no
`routerPush`/`routerReplace`, caused an infinite **reload loop** on sign-up:
Clerk's path mismatch triggered navigations that fell back to full-page
`window.location` reloads instead of client-side routing.

**How to apply:** Mount `<ClerkProvider>` *inside* `<WouterRouter>` and wire
`routerPush={(to)=>setLocation(stripBase(to))}` / `routerReplace` (Clerk hands
full base-prefixed paths; wouter's setLocation re-adds the base, so strip it
first). Give it a real `<SignUp>` page. Use route patterns exactly
`path="/sign-in/*?"` and `path="/sign-up/*?"` (the `/*?` optional wildcard also
matches Clerk OAuth sub-paths like sso-callback/factor-one). Authoritative
details live in the `clerk-auth` skill's setup-and-customization reference.

**Prod (published) wiring — required or auth breaks once deployed:** resolve the
key with `publishableKey={publishableKeyFromHost(window.location.hostname,
import.meta.env.VITE_CLERK_PUBLISHABLE_KEY)}` (one build serves multiple Clerk
domains; the env var is only the fallback — never `publishableKeyFromHost(...) ||
env`), and pass `proxyUrl={import.meta.env.VITE_CLERK_PROXY_URL}`
**unconditionally** (empty in dev, auto-set in prod; gating it on PROD/NODE_ENV
breaks the prod proxy). In con-ed the declared dep is `@clerk/react@6`, so import
the helper from `@clerk/react/internal` (the rendered `ClerkProvider` still comes
from `@clerk/clerk-react`; the helper just returns a key string, so mixing is
safe). On older `@clerk/clerk-react@5` the same helper lives in `@clerk/shared/keys`.
