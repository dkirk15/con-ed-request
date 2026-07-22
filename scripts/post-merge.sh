#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push

# Re-run codegen if the OpenAPI spec changed anywhere in the merged range.
# ORIG_HEAD is set by git to the pre-merge tip, giving the full merged range.
# Fall back to HEAD~1 when ORIG_HEAD is unavailable (e.g. initial run).
if git rev-parse --verify ORIG_HEAD >/dev/null 2>&1; then
  BASE="ORIG_HEAD"
else
  BASE="HEAD~1"
fi

if git diff --quiet "$BASE" HEAD -- lib/api-spec/openapi.yaml 2>/dev/null; then
  echo "openapi.yaml unchanged since $BASE — skipping codegen"
else
  echo "openapi.yaml changed since $BASE — running codegen"
  pnpm --filter @workspace/api-spec run codegen

  # Commit generated files if anything changed
  if ! git diff --quiet -- lib/api-client-react/src/generated lib/api-zod/src/generated; then
    git add lib/api-client-react/src/generated lib/api-zod/src/generated
    git commit -m "chore: regenerate api client and zod schemas after spec update"
    echo "Committed regenerated files"
  else
    echo "Generated files already up to date — no commit needed"
  fi
fi
