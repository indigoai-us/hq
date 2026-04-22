#!/usr/bin/env bash
# gstack-bridge.sh — Link gstack skills into HQ with g- prefix
#
# Usage:
#   scripts/gstack-bridge.sh install   # Create g-* symlinks in .claude/skills/
#   scripts/gstack-bridge.sh remove    # Remove g-* symlinks
#   scripts/gstack-bridge.sh status    # Show bridge state
#   scripts/gstack-bridge.sh update    # git pull gstack + re-install

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HQ_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
GSTACK_DIR="${HQ_ROOT}/repos/public/gstack"
HQ_SKILLS_DIR="${HQ_ROOT}/.claude/skills"

# Directories in gstack that are NOT skills (no SKILL.md)
INFRA_DIRS=("agents" "bin" "docs" "scripts" "supabase" "test")

# Skills to explicitly skip even though they have SKILL.md
SKIP_SKILLS=("browse")  # 58MB Playwright binary; HQ has agent-browser

usage() {
  cat <<'EOF'
gstack-bridge — Link gstack skills into HQ with g- prefix

Usage:
  scripts/gstack-bridge.sh install   Create g-* symlinks in .claude/skills/
  scripts/gstack-bridge.sh remove    Remove g-* symlinks
  scripts/gstack-bridge.sh status    Show bridge state
  scripts/gstack-bridge.sh update    git pull gstack + re-install
EOF
}

is_skipped() {
  local name="$1"
  for skip in "${SKIP_SKILLS[@]}"; do
    [[ "$name" == "$skip" ]] && return 0
  done
  for infra in "${INFRA_DIRS[@]}"; do
    [[ "$name" == "$infra" ]] && return 0
  done
  return 1
}

install_bridge() {
  if [[ ! -d "${GSTACK_DIR}" ]]; then
    echo "ERROR: gstack not cloned. Run:" >&2
    echo "  git clone https://github.com/garrytan/gstack repos/public/gstack" >&2
    exit 1
  fi

  local installed=0 skipped=0 already=0

  for skill_dir in "${GSTACK_DIR}"/*/; do
    [[ -d "${skill_dir}" ]] || continue
    local name
    name="$(basename "${skill_dir}")"

    # Skip non-skill directories
    if is_skipped "${name}"; then
      ((skipped++)) || true
      continue
    fi

    # Skip dirs without SKILL.md
    if [[ ! -f "${skill_dir}SKILL.md" ]]; then
      ((skipped++)) || true
      continue
    fi

    local target="${HQ_SKILLS_DIR}/g-${name}"
    local source="${skill_dir%/}"

    # Already linked correctly
    if [[ -L "${target}" ]]; then
      local current
      current="$(readlink "${target}")"
      if [[ "${current}" == "${source}" ]]; then
        ((already++)) || true
        continue
      else
        # Wrong target — remove and re-link
        rm "${target}"
      fi
    fi

    # Blocked by non-symlink
    if [[ -e "${target}" ]]; then
      echo "BLOCKED  g-${name}: target exists and is not a symlink" >&2
      exit 1
    fi

    ln -s "${source}" "${target}"
    echo "LINKED  g-${name}"
    ((installed++)) || true
  done

  echo ""
  echo "Done: ${installed} new, ${already} already linked, ${skipped} skipped"
}

remove_bridge() {
  local removed=0
  for link in "${HQ_SKILLS_DIR}"/g-*/; do
    [[ -L "${link%/}" ]] || continue
    local target
    target="$(readlink "${link%/}" 2>/dev/null || true)"
    if [[ "${target}" == *"repos/public/gstack"* ]]; then
      rm "${link%/}"
      echo "REMOVED  $(basename "${link%/}")"
      ((removed++)) || true
    fi
  done
  echo "${removed} links removed"
}

status_bridge() {
  local count=0
  echo "gstack skills in .claude/skills/:"
  echo ""
  for link in "${HQ_SKILLS_DIR}"/g-*/; do
    [[ -L "${link%/}" ]] || continue
    local target
    target="$(readlink "${link%/}")"
    if [[ "${target}" == *"repos/public/gstack"* ]]; then
      local name
      name="$(basename "${link%/}")"
      local valid="OK"
      [[ -f "${target}/SKILL.md" ]] || valid="BROKEN"
      printf "  %-30s %s\n" "${name}" "${valid}"
      ((count++)) || true
    fi
  done
  echo ""
  echo "Total: ${count} linked"
  echo "Skipped: browse (use /agent-browser)"
  echo ""
  echo "gstack version: $(cat "${GSTACK_DIR}/VERSION" 2>/dev/null || echo "unknown")"
}

update_bridge() {
  if [[ ! -d "${GSTACK_DIR}" ]]; then
    echo "ERROR: gstack not cloned. Run install first." >&2
    exit 1
  fi

  echo "Pulling gstack..."
  (cd "${GSTACK_DIR}" && git pull)
  echo ""
  echo "Re-linking..."
  install_bridge
}

case "${1:-}" in
  install) install_bridge ;;
  remove)  remove_bridge ;;
  status)  status_bridge ;;
  update)  update_bridge ;;
  *)       usage; exit 1 ;;
esac
