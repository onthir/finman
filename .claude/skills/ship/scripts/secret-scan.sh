#!/usr/bin/env bash
# secret-scan.sh — hard gate run before any commit is pushed.
#
#   secret-scan.sh              scan staged changes  (pre-commit)
#   secret-scan.sh origin/main..HEAD   scan a commit range (pre-push)
#
# Exit 0 = clean. Exit 1 = leak/blocker found. Exit 2 = could not run.
# Never prints a secret value — only the variable name that leaked.

set -uo pipefail

R=$'\033[31m'; G=$'\033[32m'; Y=$'\033[33m'; Z=$'\033[0m'
fail=0
bad()  { printf '%sBLOCK%s %s\n' "$R" "$Z" "$*"; fail=1; }
ok()   { printf '%sok   %s %s\n' "$G" "$Z" "$*"; }
warn() { printf '%swarn %s %s\n' "$Y" "$Z" "$*"; }

root=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "not a git repo"; exit 2; }
cd "$root" || exit 2

range="${1:-}"
if [ -n "$range" ]; then
  content=$(git diff "$range" 2>/dev/null) || { echo "bad range: $range"; exit 2; }
  files=$(git diff --name-only --diff-filter=d "$range" 2>/dev/null)
  label="range $range"
else
  content=$(git diff --cached)
  files=$(git diff --cached --name-only --diff-filter=d)
  label="staged changes"
fi

if [ -z "${files//[[:space:]]/}" ]; then
  echo "nothing to scan in $label"
  exit 0
fi

echo "── secret scan: $label ──"
echo "$files" | sed 's/^/     /'
echo

# ── 1. no env file may be committed (except .env.example) ────────────────
env_staged=$(echo "$files" | grep -E '(^|/)\.env' | grep -v '\.example$' || true)
if [ -n "$env_staged" ]; then
  bad "env file(s) in the commit:"
  echo "$env_staged" | sed 's/^/        /'
else
  ok "no .env files being committed"
fi

# ── 2. .gitignore must still cover env files ─────────────────────────────
ig_ok=1
for f in .env .env.local .env.development.local .env.production.local; do
  [ -e "$f" ] || continue
  git check-ignore -q "$f" || { bad ".gitignore no longer covers $f"; ig_ok=0; }
done
[ "$ig_ok" = 1 ] && ok ".gitignore still covers local env files"

# ── 3. literal values from real env files must not appear in the diff ────
# This is the check that actually matters: it compares against YOUR secrets,
# not against a guess at what a secret looks like.
skip_re='^(true|false|sandbox|development|production|localhost|http://localhost:[0-9]+|onboarding@resend\.dev)$'
found_any=0
checked=0
for ef in .env .env.local .env.development .env.production .env.development.local .env.production.local; do
  [ -f "$ef" ] || continue
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|'#'*) continue;; esac
    case "$line" in *=*) ;; *) continue;; esac
    key=${line%%=*}
    val=${line#*=}
    key=$(printf '%s' "$key" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^export[[:space:]]*//')
    val=$(printf '%s' "$val" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' \
                                   -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'\$//")
    [ ${#val} -lt 8 ] && continue
    printf '%s' "$val" | grep -qE "$skip_re" && continue
    checked=$((checked+1))
    if printf '%s' "$content" | grep -Fq -- "$val"; then
      bad "value of \$$key (from $ef) appears in the diff"
      found_any=1
    fi
  done < "$ef"
done
if [ "$checked" = 0 ]; then
  warn "no local env values available to compare against"
elif [ "$found_any" = 0 ]; then
  ok "none of the $checked local env values appear in the diff"
fi

# ── 4. provider key formats, in case a secret came from outside .env ─────
pat='sk-ant-[A-Za-z0-9_-]{16,}|re_[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|eyJhbGciOi[A-Za-z0-9_-]{20,}'
hits=$(printf '%s' "$content" | grep -nE "^\+" | grep -oE "$pat" | sort -u || true)
if [ -n "$hits" ]; then
  bad "credential-shaped strings added:"
  printf '%s\n' "$hits" | sed -E 's/(.{12}).*/        \1…(redacted)/'
else
  ok "no provider key formats in added lines"
fi

# ── 5. db URLs with a real embedded password ─────────────────────────────
dburl=$(printf '%s' "$content" | grep -nE '^\+' \
        | grep -oE '(postgres(ql)?|mysql|mongodb(\+srv)?)://[^:/@[:space:]]+:[^@[:space:]]+@[^[:space:]"'"'"'`]+' \
        | grep -vE '://(postgres:postgres|user:pass(word)?|root:root|\$\{)' || true)
if [ -n "$dburl" ]; then
  bad "database URL with embedded credentials added:"
  printf '%s\n' "$dburl" | sed -E 's|(://[^:]*:).*|\1…(redacted)|' | sed 's/^/        /'
else
  ok "no live database URLs in added lines"
fi

# ── 6. oversized / binary files ──────────────────────────────────────────
big=0
while IFS= read -r f; do
  [ -f "$f" ] || continue
  sz=$(wc -c < "$f" 2>/dev/null | tr -d ' ')
  [ -z "$sz" ] && continue
  if [ "$sz" -gt 5242880 ]; then
    bad "$f is $((sz/1048576))MB — too large for git"
    big=1
  fi
  case "$f" in *.exe|*.dll|*.so|*.dylib|*.zip|*.pem|*.key|*.p12|*.pfx)
    bad "$f is a binary/credential file type"; big=1;;
  esac
done <<< "$files"
[ "$big" = 0 ] && ok "no oversized or binary files"

echo
if [ "$fail" = 0 ]; then
  printf '%sPASS%s  safe to push\n' "$G" "$Z"
else
  printf '%sBLOCKED%s  fix the above before pushing — do NOT use --no-verify\n' "$R" "$Z"
fi
exit "$fail"
