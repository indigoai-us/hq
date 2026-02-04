#!/bin/bash
# =============================================================================
# HQ macOS Installer Build Script
# Creates a .pkg installer using pkgbuild and productbuild
# =============================================================================

set -e

# Configuration
PRODUCT_NAME="hq"
PRODUCT_VERSION="1.0.0"
PRODUCT_ID="com.hq.installer"
INSTALL_LOCATION="/usr/local/hq"
USER_INSTALL_LOCATION="$HOME/hq"

# Paths
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"
PAYLOAD_DIR="$BUILD_DIR/payload"
SCRIPTS_DIR="$SCRIPT_DIR/scripts"
RESOURCES_DIR="$SCRIPT_DIR/resources"
TEMPLATE_DIR="$SCRIPT_DIR/../../template"
SHARED_SCRIPTS_DIR="$SCRIPT_DIR/../shared/scripts"

# Output
PKG_NAME="${PRODUCT_NAME}-${PRODUCT_VERSION}.pkg"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================"
echo " HQ macOS Installer Builder"
echo " Version: $PRODUCT_VERSION"
echo "========================================"
echo ""

# Check prerequisites
check_prerequisites() {
    echo -e "${YELLOW}Checking prerequisites...${NC}"

    # Check for pkgbuild
    if ! command -v pkgbuild &> /dev/null; then
        echo -e "${RED}Error: pkgbuild not found. Please install Xcode Command Line Tools:${NC}"
        echo "  xcode-select --install"
        exit 1
    fi

    # Check for productbuild
    if ! command -v productbuild &> /dev/null; then
        echo -e "${RED}Error: productbuild not found. Please install Xcode Command Line Tools:${NC}"
        echo "  xcode-select --install"
        exit 1
    fi

    echo -e "${GREEN}Prerequisites OK${NC}"
    echo ""
}

# Clean previous build
clean_build() {
    echo -e "${YELLOW}Cleaning previous build...${NC}"
    rm -rf "$BUILD_DIR"
    mkdir -p "$BUILD_DIR"
    mkdir -p "$PAYLOAD_DIR"
    echo -e "${GREEN}Clean complete${NC}"
    echo ""
}

# Download template from GitHub if needed
download_template() {
    local url="https://github.com/indigoai-us/hq/releases/latest/download/hq-starter.zip"
    local dest="$BUILD_DIR/hq-starter.zip"

    echo -e "${YELLOW}Downloading template from GitHub...${NC}"

    if curl -fsSL "$url" -o "$dest" 2>/dev/null; then
        echo "  Extracting template..."
        unzip -q "$dest" -d "$PAYLOAD_DIR/hq/" 2>/dev/null || true
        rm -f "$dest"
        return 0
    else
        echo "  Download failed, will create minimal structure"
        return 1
    fi
}

# Prepare payload
prepare_payload() {
    echo -e "${YELLOW}Preparing payload...${NC}"

    # Create hq directory structure
    mkdir -p "$PAYLOAD_DIR/hq"
    mkdir -p "$PAYLOAD_DIR/hq/.claude/commands"
    mkdir -p "$PAYLOAD_DIR/hq/.claude/assets"
    mkdir -p "$PAYLOAD_DIR/hq/workers"
    mkdir -p "$PAYLOAD_DIR/hq/projects"
    mkdir -p "$PAYLOAD_DIR/hq/workspace/checkpoints"
    mkdir -p "$PAYLOAD_DIR/hq/workspace/threads"
    mkdir -p "$PAYLOAD_DIR/hq/workspace/orchestrator"
    mkdir -p "$PAYLOAD_DIR/hq/knowledge"
    mkdir -p "$PAYLOAD_DIR/hq/social-content/drafts/x"
    mkdir -p "$PAYLOAD_DIR/hq/social-content/drafts/linkedin"

    # Copy template files if they exist
    if [ -d "$TEMPLATE_DIR" ]; then
        echo "  Copying template files from $TEMPLATE_DIR..."
        cp -R "$TEMPLATE_DIR/"* "$PAYLOAD_DIR/hq/" 2>/dev/null || true
    elif [ "$DOWNLOAD_TEMPLATE" = "true" ]; then
        download_template || create_minimal_files
    else
        echo "  No template directory found, creating minimal structure..."
        create_minimal_files
    fi

    # Copy shared scripts (setup wizard, update checker, etc.)
    if [ -d "$SHARED_SCRIPTS_DIR" ]; then
        echo "  Copying shared scripts..."
        cp "$SHARED_SCRIPTS_DIR/setup-wizard.sh" "$PAYLOAD_DIR/hq/" 2>/dev/null || true
        cp "$SHARED_SCRIPTS_DIR/check-updates.sh" "$PAYLOAD_DIR/hq/" 2>/dev/null || true
        chmod +x "$PAYLOAD_DIR/hq/setup-wizard.sh" 2>/dev/null || true
        chmod +x "$PAYLOAD_DIR/hq/check-updates.sh" 2>/dev/null || true
    fi

    echo -e "${GREEN}Payload prepared${NC}"
    echo ""
}

# Create minimal files if template not available
create_minimal_files() {
    # Create agents.md
    cat > "$PAYLOAD_DIR/hq/agents.md" << 'AGENTS_EOF'
# Agent Profile

Your personal AI profile. Customize this file to help Claude understand your preferences.

## Personal Information

**Name:** [Your Name]
**Role:** [Your Role]

## Goals

- [Goal 1]
- [Goal 2]

## Preferences

Run `/setup` to configure this file interactively.
AGENTS_EOF

    # Create CLAUDE.md
    cat > "$PAYLOAD_DIR/hq/.claude/CLAUDE.md" << 'CLAUDE_EOF'
# HQ

Personal AI operating system for orchestrating workers, projects, and content.

## Quick Start

1. Run `/setup` to configure your profile
2. Use `/nexttask` to find work
3. Use `/prd` to plan projects
4. Use `/run` to execute workers

## Core Commands

| Command | Purpose |
|---------|---------|
| `/setup` | Interactive setup wizard |
| `/nexttask` | Find next task |
| `/prd` | Plan a new project |
| `/run` | Execute a worker |
| `/checkpoint` | Save current state |

See USER-GUIDE.md for full documentation.
CLAUDE_EOF

    # Create USER-GUIDE.md
    cat > "$PAYLOAD_DIR/hq/USER-GUIDE.md" << 'GUIDE_EOF'
# HQ User Guide

Complete reference for using HQ.

## Getting Started

1. Run `/setup` to configure your profile
2. Explore with `/help` to see commands
3. Use `/nexttask` to find work

## Commands

### Session Management
- `/checkpoint` - Save state
- `/handoff` - Prepare for fresh session
- `/nexttask` - Find next task

### Projects
- `/prd` - Generate a PRD
- `/run-project` - Execute project

### Workers
- `/run` - Execute workers
- `/newworker` - Create new worker

### System
- `/search` - Search HQ
- `/setup` - Re-run setup

## Support

Run `/help` in Claude for more information.
GUIDE_EOF

    # Create README.md
    cat > "$PAYLOAD_DIR/hq/README.md" << 'README_EOF'
# HQ

Your personal AI operating system.

## Quick Start

1. Open Terminal in this directory
2. Run `claude`
3. Type `/setup` to configure

See USER-GUIDE.md for documentation.
README_EOF

    # Create setup command
    cat > "$PAYLOAD_DIR/hq/.claude/commands/setup.md" << 'SETUP_EOF'
# Setup Wizard

Interactive setup for HQ.

## Prompt

Help me set up HQ by asking about my profile and preferences.
Update agents.md with my information and guide me through initial configuration.
SETUP_EOF
}

# Build component package
build_component_pkg() {
    echo -e "${YELLOW}Building component package...${NC}"

    # Install to /usr/local so payload lands at /usr/local/hq
    # The postinstall script will symlink or copy to user's home directory
    pkgbuild \
        --root "$PAYLOAD_DIR" \
        --identifier "$PRODUCT_ID" \
        --version "$PRODUCT_VERSION" \
        --scripts "$SCRIPTS_DIR" \
        --install-location "/usr/local" \
        "$BUILD_DIR/hq-component.pkg"

    echo -e "${GREEN}Component package built${NC}"
    echo ""
}

# Build product archive (distribution pkg)
build_product_pkg() {
    echo -e "${YELLOW}Building product package...${NC}"

    # Create distribution.xml
    cat > "$BUILD_DIR/distribution.xml" << 'DIST_EOF'
<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="1">
    <title>HQ</title>
    <organization>com.hq</organization>
    <domains enable_localSystem="true" enable_currentUserHome="true"/>
    <options customize="never" require-scripts="true" rootVolumeOnly="false" hostArchitectures="x86_64,arm64"/>

    <!-- Background image for the installer (optional) -->
    <background file="background.png" alignment="bottomleft" scaling="proportional"/>

    <!-- Welcome, License, Readme, Conclusion -->
    <welcome file="welcome.html"/>
    <license file="license.html"/>
    <readme file="readme.html"/>
    <conclusion file="conclusion.html"/>

    <!-- Installation check scripts -->
    <installation-check script="installation_check();"/>
    <script>
function installation_check() {
    // Check macOS version (require 10.15+)
    if (system.compareVersions(system.version.ProductVersion, '10.15.0') &lt; 0) {
        my.result.message = 'HQ requires macOS 10.15 Catalina or later.';
        my.result.type = 'Fatal';
        return false;
    }
    return true;
}
    </script>

    <!-- Choices -->
    <choices-outline>
        <line choice="default">
            <line choice="hq-core"/>
        </line>
    </choices-outline>

    <choice id="default"/>
    <choice id="hq-core" visible="false" title="HQ Core Files">
        <pkg-ref id="com.hq.installer"/>
    </choice>

    <pkg-ref id="com.hq.installer">
        hq-component.pkg
    </pkg-ref>
</installer-gui-script>
DIST_EOF

    # Build the final product package
    productbuild \
        --distribution "$BUILD_DIR/distribution.xml" \
        --resources "$RESOURCES_DIR" \
        --package-path "$BUILD_DIR" \
        "$BUILD_DIR/$PKG_NAME"

    echo -e "${GREEN}Product package built: $BUILD_DIR/$PKG_NAME${NC}"
    echo ""
}

# Sign the package (optional)
sign_package() {
    local SIGNING_IDENTITY="$1"

    if [ -z "$SIGNING_IDENTITY" ]; then
        echo -e "${YELLOW}No signing identity provided, skipping signing${NC}"
        echo "To sign, run: $0 sign \"Developer ID Installer: Your Name\""
        echo ""
        return
    fi

    echo -e "${YELLOW}Signing package...${NC}"

    local SIGNED_PKG="$BUILD_DIR/${PRODUCT_NAME}-${PRODUCT_VERSION}-signed.pkg"

    productsign \
        --sign "$SIGNING_IDENTITY" \
        "$BUILD_DIR/$PKG_NAME" \
        "$SIGNED_PKG"

    # Replace unsigned with signed
    mv "$SIGNED_PKG" "$BUILD_DIR/$PKG_NAME"

    echo -e "${GREEN}Package signed${NC}"
    echo ""
}

# Main build process
main() {
    check_prerequisites
    clean_build
    prepare_payload
    build_component_pkg
    build_product_pkg

    # Sign if identity provided
    if [ -n "$1" ]; then
        sign_package "$1"
    fi

    echo "========================================"
    echo -e "${GREEN}Build complete!${NC}"
    echo ""
    echo "Output: $BUILD_DIR/$PKG_NAME"
    echo ""
    echo "To install (for testing):"
    echo "  sudo installer -pkg $BUILD_DIR/$PKG_NAME -target /"
    echo ""
    echo "To notarize for distribution:"
    echo "  xcrun notarytool submit $BUILD_DIR/$PKG_NAME --apple-id YOUR_APPLE_ID --team-id YOUR_TEAM_ID --password YOUR_APP_PASSWORD"
    echo "========================================"
}

# Run main with optional signing identity
main "$@"
