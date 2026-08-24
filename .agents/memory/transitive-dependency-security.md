---
name: Transitive dependency security
description: How to handle advisories when a direct tool upgrade does not refresh vulnerable transitive packages.
---

When a direct dependency upgrade still resolves an audited transitive package below its patched version, verify the actual lockfile resolution rather than trusting the parent package version. Use the workspace package manager's narrowly scoped overrides to pin the first patched release, then re-run the audit and frozen-lockfile install.

**Why:** Some published tool packages retain exact transitive versions or ranges that leave the lockfile vulnerable even after the tool itself is upgraded.

**How to apply:** Prefer upgrading the direct parent first; add exact patched overrides only for the affected transitive packages, and remove any older duplicate override entries so the workspace config remains valid.