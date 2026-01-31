#!/bin/bash
# =============================================================================
# my-hq macOS Installer Build Script
# Creates a .pkg installer using pkgbuild and productbuild
# =============================================================================

set -e

# Configuration
PRODUCT_NAME="my-hq"
PRODUCT_VERSION="1.0.0"
PRODUCT_ID="com.my-hq.installer"
INSTALL_LOCATION="/usr/local/my-hq"
USER_INSTALL_LOCATION="$HOME/my-hq"

# Paths
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"
PAYLOAD_DIR="$BUILD_DIR/payload"
SCRIPTS_DIR="$SCRIPT_DIR/scripts"
RESOURCES_DIR="$SCRIPT_DIR/resources"
TEMPLATE_DIR="$SCRIPT_DIR/../../template"

# Output
PKG_NAME="${PRODUCT_NAME}-${PRODUCT_VERSION}.pkg"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================"
echo " my-hq macOS Installer Builder"
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

# Prepare payload
prepare_payload() {
    echo -e "${YELLOW}Preparing payload...${NC}"

    # Create my-hq directory structure
    mkdir -p "$PAYLOAD_DIR/my-hq"
    mkdir -p "$PAYLOAD_DIR/my-hq/.claude/commands"
    mkdir -p "$PAYLOAD_DIR/my-hq/workers"
    mkdir -p "$PAYLOAD_DIR/my-hq/projects"
    mkdir -p "$PAYLOAD_DIR/my-hq/workspace/checkpoints"
    mkdir -p "$PAYLOAD_DIR/my-hq/workspace/threads"
    mkdir -p "$PAYLOAD_DIR/my-hq/workspace/orchestrator"
    mkdir -p "$PAYLOAD_DIR/my-hq/knowledge"

    # Copy template files if they exist
    if [ -d "$TEMPLATE_DIR" ]; then
        echo "  Copying template files from $TEMPLATE_DIR..."
        cp -R "$TEMPLATE_DIR/"* "$PAYLOAD_DIR/my-hq/" 2>/dev/null || true
    else
        echo "  No template directory found, creating minimal structure..."
        # Create minimal required files
        cat > "$PAYLOAD_DIR/my-hq/agents.md" << 'AGENTS_EOF'
# Agent Profile

Configure your personal profile here. Run `/setup` after installation to complete setup.

## Name
[Your Name]

## Role
[Your Role]

## Goals
- [Your goals here]
AGENTS_EOF

        cat > "$PAYLOAD_DIR/my-hq/.claude/CLAUDE.md" << 'CLAUDE_EOF'
# my-hq

Welcome to my-hq! This is your personal AI operating system.

Run `/setup` to configure your instance.

See USER-GUIDE.md for full documentation.
CLAUDE_EOF
    fi

    echo -e "${GREEN}Payload prepared${NC}"
    echo ""
}

# Build component package
build_component_pkg() {
    echo -e "${YELLOW}Building component package...${NC}"

    pkgbuild \
        --root "$PAYLOAD_DIR" \
        --identifier "$PRODUCT_ID" \
        --version "$PRODUCT_VERSION" \
        --scripts "$SCRIPTS_DIR" \
        --install-location "/" \
        "$BUILD_DIR/my-hq-component.pkg"

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
    <title>my-hq</title>
    <organization>com.my-hq</organization>
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
        my.result.message = 'my-hq requires macOS 10.15 Catalina or later.';
        my.result.type = 'Fatal';
        return false;
    }
    return true;
}
    </script>

    <!-- Choices -->
    <choices-outline>
        <line choice="default">
            <line choice="my-hq-core"/>
        </line>
    </choices-outline>

    <choice id="default"/>
    <choice id="my-hq-core" visible="false" title="my-hq Core Files">
        <pkg-ref id="com.my-hq.installer"/>
    </choice>

    <pkg-ref id="com.my-hq.installer">
        my-hq-component.pkg
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
