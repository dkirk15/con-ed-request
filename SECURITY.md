# Dependency security checks

Dependency vulnerabilities are checked before deployment with:

```sh
pnpm run audit:high
```

The command fails when pnpm reports a high or critical vulnerability, including
vulnerabilities in transitive dependencies. It runs as a repository validation
workflow and in GitHub Actions CI.

## Reviewing dependency overrides

Overrides in `pnpm-workspace.yaml` are exceptions for dependencies that cannot
yet be refreshed through their direct parent. For each override:

1. Prefer upgrading the direct dependency that introduces the vulnerable
   package.
2. If that does not resolve the advisory, use the narrowest exact patched
   version and record why the parent cannot be upgraded.
3. Confirm the resolved package version with `pnpm why <package>` and rerun
   `pnpm run audit:high`.
4. Recheck the upstream dependency tree when dependencies are upgraded.
5. Remove the override as soon as the parent package resolves a patched
   version without it, then run `pnpm install --frozen-lockfile` and the audit
   again.

An override is not an approved permanent exception: keeping one after it is no
longer needed can hide future dependency changes.