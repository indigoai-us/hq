#!/bin/bash
# =============================================================================
# Claude CLI Authentication Helper for macOS
# Opens browser for OAuth authentication
# =============================================================================

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo ""
echo "========================================"
echo "  Claude CLI Authentication"
echo "========================================"
echo ""

# Find Claude CLI
CLAUDE_BIN=""
for path in "/usr/local/bin/claude" "/opt/homebrew/bin/claude" "$HOME/.npm-global/bin/claude"; do
    if [ -x "$path" ]; then
        CLAUDE_BIN="$path"
        break
    fi
done

# Also check PATH
if [ -z "$CLAUDE_BIN" ]; then
    CLAUDE_BIN=$(which claude 2>/dev/null || true)
fi

if [ -z "$CLAUDE_BIN" ]; then
    echo -e "${RED}ERROR: Claude CLI not found.${NC}"
    echo ""
    echo "Please install Claude CLI first:"
    echo "  npm install -g @anthropic-ai/claude-code"
    echo ""
    exit 1
fi

echo -e "Found Claude CLI at: ${GREEN}$CLAUDE_BIN${NC}"
echo ""

# Check if already authenticated
echo "Checking authentication status..."
if $CLAUDE_BIN -p "echo test" &>/dev/null; then
    echo -e "${GREEN}Claude CLI is already authenticated!${NC}"
    echo ""
    echo "You're all set. Run 'cd ~/hq && claude' to start."
    exit 0
fi

echo -e "${YELLOW}Claude CLI needs authentication.${NC}"
echo ""
echo "This will open your browser to sign in to claude.ai"
echo ""
read -p "Press Enter to continue (or Ctrl+C to cancel)..."
echo ""

# Run setup-token for authentication
echo "Opening browser for authentication..."
echo ""

if $CLAUDE_BIN setup-token; then
    echo ""
    echo -e "${GREEN}Authentication successful!${NC}"
    echo ""
    echo "You're all set! Run the following to get started:"
    echo "  cd ~/hq && claude"
    echo ""
    echo "Then type /setup to run the setup wizard."
else
    echo ""
    echo -e "${YELLOW}Authentication may have failed or was cancelled.${NC}"
    echo ""
    echo "You can try again by running this script, or authenticate later:"
    echo "  1. Run: claude"
    echo "  2. Type: /login"
    echo ""
fi
