#!/usr/bin/env bash
# Apply patches to globally installed npm packages.
# Usage: ./companies/ghq/data/patches/apply-patches.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
QMD_DIR="$(npm root -g)/@tobilu/qmd"

if [[ ! -d "$QMD_DIR" ]]; then
  echo "qmd not found at $QMD_DIR — skipping"
  exit 0
fi

echo "Applying @tobilu/qmd patch..."
cd "$QMD_DIR"
patch -p1 --forward --silent < "$SCRIPT_DIR/@tobilu+qmd+1.0.7.patch" 2>/dev/null && echo "  ✓ applied" || echo "  ✓ already applied"
