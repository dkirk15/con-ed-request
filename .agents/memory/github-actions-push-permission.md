---
name: GitHub Actions push permission
description: GitHub workflow file pushes can be blocked despite a healthy Replit GitHub connection.
---

The connected GitHub OAuth grant needs GitHub's separate `workflow` permission to create or update `.github/workflows/*`; repository access alone is not enough.

**Why:** GitHub rejects the complete ref update when its commit range creates or changes a workflow file. Reauthorizing the Replit GitHub connection may not add this permission if its authorization flow does not request it.

**How to apply:** Before syncing a branch that adds or edits GitHub Actions workflows, confirm the effective OAuth permissions include `workflow`. If they do not, arrange for the workflow file to be created or updated through a GitHub-authenticated path with that permission before retrying the branch push.