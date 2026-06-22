---
name: OSS Con-Ed Clerk package name
description: Which Clerk React package the design subagent generated code for
---

The design subagent consistently generates imports from `@clerk/clerk-react` (not `@clerk/react`).
Install `@clerk/clerk-react` in the frontend artifact, not `@clerk/react`.

**Why:** The Clerk skill references @clerk/react but the design subagent defaults to @clerk/clerk-react.
Both packages exist; using the wrong one causes Vite pre-transform errors.

**How to apply:** When installing Clerk on a frontend artifact after a design subagent run,
run `pnpm add @clerk/clerk-react` in the artifact directory, not `@clerk/react`.
