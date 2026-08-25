---
name: ship
description: Ship the current changes as a pull request — create a branch, run a secret-leak scan, commit, push to GitHub, and open a PR against main. Use whenever work is ready to go up: "ship this", "open a PR", "push these changes", "make a PR for this". Never commit directly to a base branch; this skill is the only sanctioned path from working tree to GitHub.
---

# Ship changes as a PR

Working tree → new branch → secret scan → commit → push → PR into `main`.

**Non-negotiable:** the secret scan in step 4 is a gate, not a report. If it exits
non-zero you stop and fix the cause. Never pass `--no-verify`, never `git add -f` a
blocked file, never weaken the scan to make it pass.

## 1. Preflight

```bash
gh auth status                              # must show a logged-in account
git rev-parse --abbrev-ref HEAD             # current branch
git status --short                          # what is actually changing
git ls-remote --heads origin main           # does the base branch exist?
```

Resolve these before going further:

- **Not authenticated** → tell the user to run `gh auth login` in their own terminal.
  It is interactive; do not attempt it through a tool call.
- **`main` missing on the remote** → do not silently retarget. Tell the user and offer:
  ```bash
  git branch main origin/development        # seed main from current default
  git push -u origin main
  gh repo edit --default-branch main
  ```
  Only proceed once they choose. If they'd rather target a different base, use that
  branch everywhere `main` appears below.
- **Already on `main`** → you must branch before committing (step 2 handles it).

## 2. Create the branch

Never commit onto `main` or another base branch. Branch first, always.

```bash
git switch -c <type>/<slug>
```

`<type>` is one of `feat`, `fix`, `chore`, `refactor`, `docs`. `<slug>` is 2–4
kebab-case words describing the change (`feat/budget-api`, `fix/webhook-retry`).

If the current branch is already a purpose-made feature branch with the user's work on
it, stay on it rather than nesting another.

## 3. Stage deliberately

```bash
git add -A
git status --short
```

Review the staged list before scanning. Anything that is build output, a downloaded
binary, a scratch file, or a local tool does not belong in the commit — add it to
`.gitignore` and `git rm --cached` it rather than committing it.

## 4. Secret scan — the gate

```bash
bash .claude/skills/ship/scripts/secret-scan.sh
```

Six checks, all against the staged diff:

1. No `.env*` file is being committed (`.env.example` is allowed)
2. `.gitignore` still covers the local env files
3. **The literal values in your `.env` / `.env.local` do not appear anywhere in the diff** —
   this compares against your real secrets rather than guessing at secret shapes
4. No provider key formats in added lines (`sk-ant-`, `re_`, `ghp_`, `AKIA`, `xox*`, PEM blocks, JWTs)
5. No database URL with a real embedded password
6. No file over 5MB and no `.exe`/`.dll`/`.pem`/`.key`/`.zip`/etc.

Exit 0 → continue. Exit 1 → **stop**, report what tripped, fix the underlying cause,
re-stage, re-run. The script never prints a secret value, only the variable name.

If a secret is genuinely in the diff, it is not enough to unstage it — treat the value
as compromised and tell the user to rotate it at the provider.

## 5. Commit

```bash
git commit -m "$(cat <<'EOF'
<type>: <imperative summary under 72 chars>

<why the change exists, if not obvious from the summary>

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

## 6. Push

```bash
git push -u origin HEAD
```

## 7. Open the PR

Re-scan the full branch against the base first — this catches anything that slipped in
via an earlier commit on the branch, not just the last one:

```bash
git fetch origin main
bash .claude/skills/ship/scripts/secret-scan.sh origin/main..HEAD
```

Then:

```bash
gh pr create --base main --head "$(git rev-parse --abbrev-ref HEAD)" \
  --title "<type>: <summary>" \
  --body "$(cat <<'EOF'
## What
<what changed, in a few bullets>

## Why
<the motivation>

## Testing
<what you ran, or "not yet tested" — be honest>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Report the PR URL back to the user.

## Repo-specific notes

`onthir/finman` is a **public** repository — a leaked secret is public the instant it is
pushed, and rewriting history does not un-publish it. The scan matters more here than it
would on a private repo.

Secrets live in `.env.local` (gitignored). `.env.example` is the tracked template and
must keep every value empty. Real secrets in play: `DATABASE_URL`, `ENCRYPTION_KEY`,
`AUTH_SECRET`, `RESEND_API_KEY`, `PLAID_CLIENT_ID`, `PLAID_SECRET`, `ANTHROPIC_API_KEY`,
`INNGEST_*`.

`ngrok.exe` (31MB) sits in the repo root for Plaid webhook tunnelling and must stay
untracked.
