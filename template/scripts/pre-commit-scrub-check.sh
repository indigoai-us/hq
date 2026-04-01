#!/bin/bash
# pre-commit-scrub-check.sh
# Git pre-commit hook that blocks commits containing private/denylist terms.
# Install: cp scripts/pre-commit-scrub-check.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
# Or: ln -sf ../../scripts/pre-commit-scrub-check.sh .git/hooks/pre-commit
#
# Reads terms from .claude/scrub-denylist.yaml if present, otherwise uses
# a hardcoded fallback list. Checks only staged files.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
DENYLIST_FILE="$REPO_ROOT/.claude/scrub-denylist.yaml"

# Build the grep pattern from denylist or fallback
build_pattern() {
  if [ -f "$DENYLIST_FILE" ]; then
    # Extract keys from companies, persons, domains, repos sections
    # Uses grep+sed to avoid yq dependency
    local terms=""
    local in_section=0

    while IFS= read -r line; do
      # Detect section headers we care about
      if [[ "$line" =~ ^(companies|persons|domains|repos|products): ]]; then
        in_section=1
        continue
      fi
      # Detect other top-level keys (end of relevant section)
      if [[ "$line" =~ ^[a-z_]+: ]] && [[ ! "$line" =~ ^[[:space:]] ]]; then
        in_section=0
        continue
      fi
      # Extract key from "  key: value" lines (skip comments and blanks)
      if [ "$in_section" -eq 1 ] && [[ "$line" =~ ^[[:space:]]+([^#][^:]+): ]]; then
        local term="${BASH_REMATCH[1]}"
        term="$(echo "$term" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
        # Skip empty, comments, and very short terms (< 3 chars can false-positive)
        if [ -n "$term" ] && [ "${#term}" -ge 3 ]; then
          if [ -n "$terms" ]; then
            terms="$terms|$term"
          else
            terms="$term"
          fi
        fi
      fi
    done < "$DENYLIST_FILE"

    echo "$terms"
  else
    # No denylist found — user must create .claude/scrub-denylist.yaml with their own terms.
    # Without a denylist, skip the check (nothing to match against).
    echo ""
  fi
}

PATTERN="$(build_pattern)"

if [ -z "$PATTERN" ]; then
  echo "⚠ pre-commit-scrub-check: no denylist terms found. Skipping."
  exit 0
fi

# Get staged files (only added, copied, modified — skip deleted)
STAGED_FILES="$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null || true)"

if [ -z "$STAGED_FILES" ]; then
  exit 0
fi

# File extensions to check (skip binaries, locks, images)
INCLUDE_PATTERN='\.(md|yaml|yml|json|sh|ts|tsx|js|jsx|txt|html|css)$'

FOUND=0
while IFS= read -r file; do
  # Skip files that don't match our include pattern
  if ! echo "$file" | grep -qE "$INCLUDE_PATTERN"; then
    continue
  fi

  # Skip the denylist file itself, the hook script, changelog, and lock files (integrity hashes cause false positives)
  if [[ "$file" == *"scrub-denylist"* ]] || [[ "$file" == *"pre-commit-scrub-check"* ]] || [[ "$file" == "CHANGELOG.md" ]] || [[ "$file" == *"package-lock.json"* ]] || [[ "$file" == *"bun.lockb"* ]]; then
    continue
  fi

  # Check staged content (not working tree — use git show :file)
  MATCHES="$(git show ":$file" 2>/dev/null | grep -inE "$PATTERN" || true)"

  if [ -n "$MATCHES" ]; then
    if [ "$FOUND" -eq 0 ]; then
      echo ""
      echo "🚫 SCRUB CHECK FAILED — private terms found in staged files"
      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      echo ""
    fi
    FOUND=1
    echo "  $file:"
    echo "$MATCHES" | head -5 | while IFS= read -r match_line; do
      echo "    $match_line"
    done
    local_count="$(echo "$MATCHES" | wc -l | tr -d ' ')"
    if [ "$local_count" -gt 5 ]; then
      echo "    ... and $((local_count - 5)) more matches"
    fi
    echo ""
  fi
done <<< "$STAGED_FILES"

if [ "$FOUND" -eq 1 ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Fix: replace private terms with {company}, {your-repo}, etc."
  echo "Denylist: .claude/scrub-denylist.yaml"
  echo "Bypass (emergency only): git commit --no-verify"
  echo ""
  exit 1
fi

exit 0
