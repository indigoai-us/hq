#!/usr/bin/env bash
set -euo pipefail

# new-company.sh — scaffold a new company in GHQ
#
# Usage:
#   ./scripts/new-company.sh <slug> --name "Company Name" [options]
#
# Required:
#   <slug>              Lowercase, hyphens only (positional, first arg)
#   --name <name>       Human-readable company name
#
# Optional:
#   --skills <ids>      Comma-separated skill slugs (default: none)
#   --no-qmd            Skip qmd collection creation
#   --no-bd             Skip bd init
#   --dry-run           Print what would happen without doing it

GHQ_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GHQ_DATA="$HOME/Documents/GHQ/companies"
MANIFEST="$GHQ_ROOT/companies/manifest.yaml"

# Defaults
SLUG=""
NAME=""
SKILLS=""
QMD=true
BD=true
DRY_RUN=false

# ── Parse args ──────────────────────────────────────────────
usage() {
  sed -n '3,/^$/p' "$0" | sed 's/^# \?//'
  exit 1
}

[[ $# -eq 0 ]] && usage

SLUG="$1"; shift
while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)     NAME="$2"; shift 2 ;;
    --skills)   SKILLS="$2"; shift 2 ;;
    --no-qmd)   QMD=false; shift ;;
    --no-bd)    BD=false; shift ;;
    --dry-run)  DRY_RUN=true; shift ;;
    -h|--help)  usage ;;
    *)          echo "Unknown option: $1"; usage ;;
  esac
done

# ── Validate ────────────────────────────────────────────────
if [[ -z "$NAME" ]]; then
  echo "Error: --name is required"
  exit 1
fi

if ! [[ "$SLUG" =~ ^[a-z][a-z0-9-]*$ ]]; then
  echo "Error: slug must be lowercase, hyphens only, start with a letter"
  exit 1
fi

if grep -q "^${SLUG}:" "$MANIFEST" 2>/dev/null; then
  echo "Error: '$SLUG' already exists in manifest.yaml"
  exit 1
fi

if [[ -d "$GHQ_DATA/$SLUG" ]]; then
  echo "Error: directory already exists at $GHQ_DATA/$SLUG"
  exit 1
fi

# ── Build arrays for manifest ──────────────────────────────
skills_yaml="[]"
if [[ -n "$SKILLS" ]]; then
  skills_yaml=""
  IFS=',' read -ra SKILL_ARR <<< "$SKILLS"
  for s in "${SKILL_ARR[@]}"; do
    skills_yaml+=$'\n'"    - $(echo "$s" | xargs)"
  done
fi

# ── Dry run ─────────────────────────────────────────────────
if $DRY_RUN; then
  cat <<EOF
[dry-run] Would create:
  Directory:  $GHQ_DATA/$SLUG/{settings,knowledge,policies,projects}
  Symlink:    $GHQ_ROOT/companies/$SLUG -> $GHQ_DATA/$SLUG
  Beads:      $(if $BD; then echo "bd init -p $SLUG -q + cleanup"; else echo "skipped"; fi)
  Manifest:   append $SLUG to $MANIFEST
  qmd:        $(if $QMD; then echo "collection '$SLUG'"; else echo "skipped"; fi)
  README:     $GHQ_DATA/$SLUG/README.md
  Knowledge:  $GHQ_DATA/$SLUG/knowledge/README.md
EOF
  exit 0
fi

# ── Scaffold directories ───────────────────────────────────
echo "Creating $SLUG..."

mkdir -p "$GHQ_DATA/$SLUG"/{settings,knowledge,policies,projects}
ln -s "$GHQ_DATA/$SLUG" "$GHQ_ROOT/companies/$SLUG"

echo "  ✓ Directory + symlink"

# ── bd init ─────────────────────────────────────────────────
if $BD; then
  (
    cd "$GHQ_ROOT/companies/$SLUG"
    bd init -p "$SLUG" -q
    rm -rf .git AGENTS.md
  )
  echo "  ✓ bd init (cleaned .git + AGENTS.md)"
fi

# ── knowledge/README.md ────────────────────────────────────
cat > "$GHQ_DATA/$SLUG/knowledge/README.md" <<EOF
# $NAME Knowledge Index

Knowledge files scoped to $NAME.

## Files

| File | Description |
|------|-------------|
| README.md | This file — navigable map of $NAME knowledge |

## Notes

- Add files here as $NAME knowledge grows.
- Never mix $NAME knowledge into other company-scoped outputs.
EOF

echo "  ✓ knowledge/README.md"

# ── Company README.md ───────────────────────────────────────
skills_md="None assigned."
if [[ -n "$SKILLS" ]]; then
  skills_md=""
  IFS=',' read -ra SKILL_ARR <<< "$SKILLS"
  for s in "${SKILL_ARR[@]}"; do
    skills_md+="- $(echo "$s" | xargs)"$'\n'
  done
fi

cat > "$GHQ_DATA/$SLUG/README.md" <<EOF
# $NAME

## Projects

None yet. Use \`/new-project\` to add one.

## Skills

$skills_md
## Knowledge

Located at \`companies/$SLUG/knowledge/\`.

## Settings

Credentials and config at \`companies/$SLUG/settings/\` (excluded from version control via .claudeignore).

## Policies

Company-scoped rules at \`companies/$SLUG/policies/\`.
EOF

echo "  ✓ README.md"

# ── Update manifest.yaml ───────────────────────────────────
cat >> "$MANIFEST" <<EOF

$SLUG:
  symlink: $SLUG
  projects: {}
  settings: companies/$SLUG/settings/
  skills: $skills_yaml
  knowledge: companies/$SLUG/knowledge/
  deploy: []
  vercel_projects: []
  qmd_collections:
    - $SLUG
EOF

echo "  ✓ manifest.yaml"

# ── qmd collection ──────────────────────────────────────────
if $QMD; then
  if command -v qmd &>/dev/null; then
    qmd collection add "$GHQ_ROOT/companies/$SLUG" --name "$SLUG" \
      --mask "**/*.{ts,tsx,js,jsx,md,json,yaml,yml,sql,css,prisma}" 2>/dev/null || true
    qmd update 2>/dev/null || true
    echo "  ✓ qmd collection '$SLUG'"
  else
    echo "  ⚠ qmd not found, skipping collection"
  fi
fi

# ── Report ──────────────────────────────────────────────────
echo ""
echo "Company $SLUG scaffolded:"
echo "  Directory:  companies/$SLUG/"
echo "  Beads:      companies/$SLUG/.beads/ $(if $BD; then echo '(bd init)'; else echo '(skipped)'; fi)"
echo "  Knowledge:  companies/$SLUG/knowledge/README.md"
echo "  Policies:   companies/$SLUG/policies/"
echo "  Projects:   companies/$SLUG/projects/"
echo "  Settings:   companies/$SLUG/settings/"
echo "  Manifest:   updated"
echo "  qmd:        collection '$SLUG' $(if $QMD; then echo 'created'; else echo 'skipped'; fi)"
