#!/bin/bash
# =============================================================================
# HQ Update Checker for macOS
# Checks GitHub releases for new versions and offers to download/install
# =============================================================================

# Configuration
GITHUB_REPO="indigoai-us/hq"
RELEASES_API="https://api.github.com/repos/$GITHUB_REPO/releases/latest"
HQ_DIR="${HQ_DIR:-$HOME/hq}"
VERSION_FILE="$HQ_DIR/.hq-version"
UPDATE_CHECK_FILE="$HQ_DIR/.last-update-check"

# Parse arguments
SILENT=false
AUTO_INSTALL=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --silent)
            SILENT=true
            shift
            ;;
        --auto-install)
            AUTO_INSTALL=true
            shift
            ;;
        --hq-dir)
            HQ_DIR="$2"
            VERSION_FILE="$HQ_DIR/.hq-version"
            UPDATE_CHECK_FILE="$HQ_DIR/.last-update-check"
            shift 2
            ;;
        *)
            shift
            ;;
    esac
done

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

success() { echo -e "${GREEN}$1${NC}"; }
warning() { echo -e "${YELLOW}$1${NC}"; }
error() { echo -e "${RED}$1${NC}"; }
info() { echo -e "${CYAN}$1${NC}"; }

# =============================================================================
# Get current installed version
# =============================================================================
get_current_version() {
    if [ -f "$VERSION_FILE" ]; then
        cat "$VERSION_FILE" | tr -d '\n'
        return
    fi

    # Try to get from pkg receipts
    local pkg_version
    pkg_version=$(pkgutil --pkg-info com.hq.installer 2>/dev/null | grep version | awk '{print $2}')
    if [ -n "$pkg_version" ]; then
        echo "$pkg_version"
        return
    fi

    # Default version if not found
    echo "1.0.0"
}

# =============================================================================
# Save current version
# =============================================================================
save_current_version() {
    local version="$1"
    echo -n "$version" > "$VERSION_FILE"
}

# =============================================================================
# Check if we should skip update check (rate limiting)
# =============================================================================
should_skip_check() {
    if [ ! -f "$UPDATE_CHECK_FILE" ]; then
        return 1  # false, don't skip
    fi

    local last_check
    last_check=$(cat "$UPDATE_CHECK_FILE" | tr -d '\n')
    local today
    today=$(date +%Y-%m-%d)

    # Only check once per day
    if [ "$last_check" = "$today" ]; then
        return 0  # true, skip
    fi

    return 1  # false, don't skip
}

# =============================================================================
# Record update check time
# =============================================================================
record_check_time() {
    date +%Y-%m-%d > "$UPDATE_CHECK_FILE"
}

# =============================================================================
# Compare versions (returns: -1 if v1 < v2, 0 if equal, 1 if v1 > v2)
# =============================================================================
compare_versions() {
    local v1="$1"
    local v2="$2"

    # Remove 'v' prefix if present
    v1="${v1#v}"
    v2="${v2#v}"

    # Split into parts
    IFS='.' read -ra V1_PARTS <<< "$v1"
    IFS='.' read -ra V2_PARTS <<< "$v2"

    # Compare each part
    for i in 0 1 2; do
        local p1="${V1_PARTS[$i]:-0}"
        local p2="${V2_PARTS[$i]:-0}"

        if [ "$p1" -lt "$p2" ] 2>/dev/null; then
            echo "-1"
            return
        elif [ "$p1" -gt "$p2" ] 2>/dev/null; then
            echo "1"
            return
        fi
    done

    echo "0"
}

# =============================================================================
# Fetch latest release info from GitHub
# =============================================================================
get_latest_release() {
    local response
    response=$(curl -sSL \
        -H "Accept: application/vnd.github.v3+json" \
        -H "User-Agent: hq-updater" \
        "$RELEASES_API" 2>/dev/null)

    if [ -z "$response" ] || echo "$response" | grep -q '"message"'; then
        if [ "$SILENT" = false ]; then
            warning "Could not check for updates."
        fi
        return 1
    fi

    echo "$response"
}

# =============================================================================
# Extract field from JSON (simple parser)
# =============================================================================
json_field() {
    local json="$1"
    local field="$2"

    echo "$json" | grep -o "\"$field\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | sed 's/.*":.*"\(.*\)"/\1/'
}

# =============================================================================
# Find the macOS installer asset URL
# =============================================================================
get_macos_installer_url() {
    local json="$1"

    # Look for .pkg file
    local pkg_url
    pkg_url=$(echo "$json" | grep -o '"browser_download_url"[[:space:]]*:[[:space:]]*"[^"]*\.pkg"' | head -1 | sed 's/.*"\(http[^"]*\)"/\1/')

    if [ -n "$pkg_url" ]; then
        echo "$pkg_url"
        return 0
    fi

    # Look for .dmg file as fallback
    local dmg_url
    dmg_url=$(echo "$json" | grep -o '"browser_download_url"[[:space:]]*:[[:space:]]*"[^"]*\.dmg"' | head -1 | sed 's/.*"\(http[^"]*\)"/\1/')

    if [ -n "$dmg_url" ]; then
        echo "$dmg_url"
        return 0
    fi

    return 1
}

# =============================================================================
# Download update installer
# =============================================================================
download_update() {
    local url="$1"
    local filename
    filename=$(basename "$url")
    local download_path="/tmp/$filename"

    info "Downloading update..."
    echo "  From: $url"
    echo "  To: $download_path"
    echo ""

    if curl -fsSL -o "$download_path" "$url"; then
        if [ -f "$download_path" ]; then
            success "Download complete!"
            echo "$download_path"
            return 0
        fi
    fi

    error "Download failed."
    return 1
}

# =============================================================================
# Install the update
# =============================================================================
install_update() {
    local installer_path="$1"
    local filename
    filename=$(basename "$installer_path")

    info "Starting update installer..."
    warning "The installer will guide you through the update process."
    warning "Your data will be preserved."
    echo ""

    if [[ "$filename" == *.pkg ]]; then
        # Open the pkg installer
        open "$installer_path"
    elif [[ "$filename" == *.dmg ]]; then
        # Mount and open the dmg
        hdiutil attach "$installer_path" -nobrowse
        open /Volumes/*/
    fi

    echo "The installer has been opened."
    echo "Follow the on-screen instructions to complete the update."
}

# =============================================================================
# Main update check flow
# =============================================================================
check_for_updates() {
    if [ "$SILENT" = false ]; then
        echo ""
        echo "========================================"
        echo "  HQ Update Checker"
        echo "========================================"
        echo ""
    fi

    # Ensure HQ directory exists
    if [ ! -d "$HQ_DIR" ]; then
        error "HQ directory not found: $HQ_DIR"
        return 1
    fi

    # Get current version
    local current_version
    current_version=$(get_current_version)
    if [ "$SILENT" = false ]; then
        echo "Current version: $current_version"
    fi

    # Check if we should skip (already checked today)
    if should_skip_check && [ "$AUTO_INSTALL" = false ]; then
        if [ "$SILENT" = false ]; then
            echo "Already checked for updates today."
        fi
        return 0
    fi

    # Record check time
    record_check_time

    # Fetch latest release
    if [ "$SILENT" = false ]; then
        echo "Checking for updates..."
    fi

    local release_json
    release_json=$(get_latest_release)
    if [ $? -ne 0 ]; then
        return 1
    fi

    local latest_version
    latest_version=$(json_field "$release_json" "tag_name")
    latest_version="${latest_version#v}"  # Remove 'v' prefix

    if [ "$SILENT" = false ]; then
        echo "Latest version: $latest_version"
        echo ""
    fi

    # Compare versions
    local comparison
    comparison=$(compare_versions "$current_version" "$latest_version")

    if [ "$comparison" -ge 0 ]; then
        if [ "$SILENT" = false ]; then
            success "You're up to date!"
        fi
        return 0
    fi

    # Update available!
    echo ""
    success "Update available: $current_version -> $latest_version"
    echo ""

    local release_name
    release_name=$(json_field "$release_json" "name")
    if [ -n "$release_name" ]; then
        echo "Release: $release_name"
    fi

    local html_url
    html_url=$(json_field "$release_json" "html_url")

    # Find macOS installer
    local installer_url
    installer_url=$(get_macos_installer_url "$release_json")

    if [ -z "$installer_url" ]; then
        warning "No macOS installer found in release."
        echo "Please visit: $html_url"
        return 0
    fi

    local installer_name
    installer_name=$(basename "$installer_url")
    echo "Installer: $installer_name"
    echo ""

    # Ask user if they want to update
    local response
    if [ "$AUTO_INSTALL" = true ]; then
        response="y"
    else
        read -p "Would you like to download and install the update? (y/n): " response
    fi

    if [[ "$response" =~ ^[Yy] ]]; then
        local download_path
        download_path=$(download_update "$installer_url")

        if [ -n "$download_path" ] && [ -f "$download_path" ]; then
            echo ""
            read -p "Install now? (y/n): " install_now
            if [[ "$install_now" =~ ^[Yy] ]]; then
                install_update "$download_path"
            else
                echo ""
                info "Installer saved to: $download_path"
                echo "Run it manually when you're ready to update."
            fi
        fi
    else
        echo ""
        info "Update skipped. You can run this script anytime to check again."
        echo "Or download manually from: $html_url"
    fi

    return 0
}

# =============================================================================
# Entry point
# =============================================================================

check_for_updates

if [ "$SILENT" = false ]; then
    echo ""
    read -p "Press Enter to exit..."
fi

exit 0
