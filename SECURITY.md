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

## Review cadence and current review

Review overrides whenever a direct dependency is upgraded, before each
deployment, and at least once per quarter. The review must include a frozen
install, `pnpm why` checks for every retained override, and
`pnpm run audit:high`.

On August 25, 2026, the review removed the overrides for `fast-uri`,
`brace-expansion`, `body-parser`, `markdown-it`, `qs`, `@babel/core`, `postcss`,
`fast-xml-parser`, and `linkify-it`; current parent ranges resolve patched
versions without them. The retained security overrides are `js-yaml`,
`js-cookie`, and `uuid`, whose parents still resolve older vulnerable versions
without the overrides. Platform-specific optional-binary pruning and the
`@esbuild-kit/esm-loader`/`esbuild` compatibility overrides remain intentional
for this Linux/Drizzle build.