# First Edit - project rules

## What this is
A benchmark and CLI that measures whether LLM-generated UI components
survive realistic content and viewport changes. The full design is in
docs/SPEC.md. Read it before any non-trivial change.

## Working rules
- Never run `git push`, never add a remote, never open a pull request.
  The owner pushes.
- The `origin` remote was added by the owner. Leave it alone and never push.
- Commit locally in small, logical commits using Conventional Commits
  (feat, fix, chore, docs, test). A message is a subject and an optional
  body. No trailers.
- Do only what the current step asks. If something outside the step looks
  wrong or missing, list it in the STEP REPORT instead of fixing it.
- Do not install global tools or change anything outside this repository
  unless the step says so.
- Never commit secrets. API keys live in .env, which is git-ignored.
  .env.example lists the variable names.
- Platform: Windows 10, Node 26, Python 3.13. Use `python`, not `python3`.
  npm scripts must be cross-platform, with no bash-only syntax.
- Prefer plain, readable code. Every check and every mutation gets a unit
  test.
- Determinism: no randomness without a seed, and no network access during
  render or checks.

## STEP REPORT
End every step with a block titled STEP REPORT containing:
- what was built, one line per item
- commands run to verify, with pass or fail and key numbers
- `git log --oneline` for the commits made in this step
- deviations from the step, and why
- open questions or risks
