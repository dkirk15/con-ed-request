---
name: Clerk API auth — Bearer token required
description: In Replit's proxied dev environment, Clerk session cookies are NOT reliably sent to the API server. Always use explicit Bearer tokens via setAuthTokenGetter.
---

## Rule
Never rely on Clerk session cookies to authenticate API requests from the con-ed frontend.
Always register Clerk's `getToken()` as the auth token getter so every fetch gets an explicit `Authorization: Bearer <token>` header.

## How it's wired
`ClerkTokenSync` component in `App.tsx`, mounted inside `<ClerkProvider>`:
```tsx
function ClerkTokenSync() {
  const { getToken } = useAuth();
  useEffect(() => {
    setAuthTokenGetter(() => getToken());
    return () => setAuthTokenGetter(null);
  }, [getToken]);
  return null;
}
```
`setAuthTokenGetter` is exported from `@workspace/api-client-react`.
The API server's `@clerk/express` `getAuth(req)` reads the Authorization header automatically.

**Why:** Replit path-based proxy routes `/con-ed/*` and `/api/*` through the same domain, but Clerk's `__session` cookie was not reliably forwarded to the API server after session expiry + re-login. Switching to explicit Bearer headers made auth robust.

**How to apply:** Any new frontend artifact that calls the API server must also mount `ClerkTokenSync` (or equivalent) inside its `ClerkProvider`.
