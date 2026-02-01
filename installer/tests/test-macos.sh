#!/bin/bash
# my-hq Installer Test Script for macOS
# Run this AFTER installation to verify everything works
#
# Usage:
#   chmod +x test-macos.sh
#   ./test-macos.sh
#   CI=true ./test-macos.sh  # Run in CI mode (no GUI, skip OAuth)
#
# Environment variables:
#   CI=true              - Enable CI mode
#   GITHUB_ACTIONS=true  - Enable CI mode (GitHub Actions detection)
#
# Exit codes:
#   0 - All tests passed
#   1 - One or more tests failed

# Configuration
HQ_PATH="${HQ_PATH:-$HOME/my-hq}"
VERBOSE="${VERBOSE:-false}"
MIN_NODE_VERSION="18.0.0"
MIN_NPM_VERSION="8.0.0"

# CI Detection
IS_CI="${CI:-false}"
if [[ "$GITHUB_ACTIONS" == "true" ]] || [[ "$JENKINS_URL" != "" ]] || [[ "$TRAVIS" == "true" ]] || [[ "$CIRCLECI" == "true" ]]; then
    IS_CI="true"
fi

# Colors (disabled in CI for cleaner logs)
if [[ "$IS_CI" == "true" ]]; then
    RED=''
    GREEN=''
    YELLOW=''
    CYAN=''
    WHITE=''
    GRAY=''
    MAGENTA=''
    NC=''
else
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    CYAN='\033[0;36m'
    WHITE='\033[1;37m'
    GRAY='\033[0;90m'
    MAGENTA='\033[0;35m'
    NC='\033[0m' # No Color
fi

# Counters
PASSED=0
FAILED=0
WARNINGS=0
INFO=0
SKIPPED=0

# Results array
declare -a FAILED_TESTS
declare -a TEMP_FILES

# Cleanup function
cleanup() {
    for file in "${TEMP_FILES[@]}"; do
        rm -f "$file" 2>/dev/null || true
    done
}

# Register cleanup on exit and signals
trap cleanup EXIT
trap 'echo "[ERROR] Script interrupted"; cleanup; exit 1' INT TERM

# Function to register temp files for cleanup
register_temp_file() {
    TEMP_FILES+=("$1")
}

print_result() {
    local status="$1"
    local message="$2"

    case "$status" in
        PASS) echo -e "${GREEN}[PASS]${NC} $message" && ((PASSED++)) ;;
        FAIL) echo -e "${RED}[FAIL]${NC} $message" && ((FAILED++)) && FAILED_TESTS+=("$message") ;;
        WARN) echo -e "${YELLOW}[WARN]${NC} $message" && ((WARNINGS++)) ;;
        INFO) echo -e "${CYAN}[INFO]${NC} $message" && ((INFO++)) ;;
        SKIP) echo -e "${MAGENTA}[SKIP]${NC} $message" && ((SKIPPED++)) ;;
    esac
}

version_compare() {
    # Returns 0 if $1 >= $2, 1 otherwise
    local IFS=.
    local i ver1=($1) ver2=($2)

    for ((i=${#ver1[@]}; i<${#ver2[@]}; i++)); do
        ver1[i]=0
    done
    for ((i=0; i<${#ver1[@]}; i++)); do
        if [[ -z ${ver2[i]} ]]; then
            ver2[i]=0
        fi
        if ((10#${ver1[i]} > 10#${ver2[i]})); then
            return 0
        fi
        if ((10#${ver1[i]} < 10#${ver2[i]})); then
            return 1
        fi
    done
    return 0
}

test_command() {
    local cmd="$1"
    local description="$2"
    local min_version="$3"

    if output=$($cmd 2>&1); then
        # Check minimum version if specified
        if [[ -n "$min_version" ]]; then
            actual_version=$(echo "$output" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
            if [[ -n "$actual_version" ]]; then
                if version_compare "$actual_version" "$min_version"; then
                    print_result "PASS" "$description (v$actual_version)"
                else
                    print_result "FAIL" "$description - Version $actual_version < required $min_version"
                fi
            else
                print_result "PASS" "$description"
            fi
        else
            print_result "PASS" "$description"
        fi
        [[ "$VERBOSE" == "true" ]] && echo -e "${GRAY}       Output: $output${NC}"
        return 0
    else
        print_result "FAIL" "$description"
        return 1
    fi
}

test_path() {
    local path="$1"
    local description="$2"

    if [[ -e "$path" ]]; then
        print_result "PASS" "$description"
        return 0
    else
        print_result "FAIL" "$description"
        return 1
    fi
}

# ===== HEADER =====
echo ""
echo -e "${CYAN}============================================${NC}"
if [[ "$IS_CI" == "true" ]]; then
    echo -e "${CYAN}   my-hq Installer Verification Tests (CI Mode)${NC}"
else
    echo -e "${CYAN}   my-hq Installer Verification Tests${NC}"
fi
echo -e "${CYAN}============================================${NC}"
echo ""
echo -e "${GRAY}Testing installation at: $HQ_PATH${NC}"
echo -e "${GRAY}Date: $(date '+%Y-%m-%d %H:%M:%S')${NC}"
if [[ "$IS_CI" == "true" ]]; then
    echo -e "${GRAY}Mode: CI (skipping OAuth and GUI-dependent tests)${NC}"
fi
echo ""

# System Info
# sw_vers may not exist in all CI environments
if command -v sw_vers &>/dev/null; then
    print_result "INFO" "macOS Version: $(sw_vers -productVersion)"
else
    print_result "INFO" "macOS Version: $(uname -r)"
fi
print_result "INFO" "Architecture: $(uname -m)"
echo ""

# ===== CORE DEPENDENCIES =====
echo -e "${WHITE}--- Core Dependencies ---${NC}"

test_command "node --version" "Node.js installed" "$MIN_NODE_VERSION" || true
test_command "npm --version" "npm installed" "$MIN_NPM_VERSION" || true

# Claude CLI - in CI, not being installed is OK (network restrictions)
CLAUDE_INSTALLED=false
if command -v claude &>/dev/null; then
    CLAUDE_INSTALLED=true
    test_command "which claude" "Claude CLI in PATH" || true
    test_command "claude --version" "Claude CLI runs" || true
else
    if [[ "$IS_CI" == "true" ]]; then
        print_result "INFO" "Claude CLI not installed (expected in CI - npm network access may be restricted)"
    else
        print_result "FAIL" "Claude CLI not installed"
    fi
fi

echo ""

# ===== MY-HQ DIRECTORY =====
echo -e "${WHITE}--- my-hq Directory Structure ---${NC}"

test_path "$HQ_PATH" "my-hq directory exists" || true

# Required files
for file in ".claude/CLAUDE.md" "agents.md" "USER-GUIDE.md"; do
    test_path "$HQ_PATH/$file" "File: $file" || true
done

# Required directories
for dir in "workers" "projects" "workspace"; do
    test_path "$HQ_PATH/$dir" "Directory: $dir" || true
done

echo ""

# ===== SHORTCUTS AND LAUNCHERS =====
echo -e "${WHITE}--- Shortcuts and Launchers ---${NC}"

# In CI, GUI launchers don't exist
if [[ "$IS_CI" == "true" ]]; then
    print_result "SKIP" "Desktop launcher (skipped in CI - no GUI environment)"
    print_result "SKIP" "Setup Wizard app (skipped in CI - no GUI environment)"
else
    if [[ -d "$HOME/Desktop/my-hq.app" ]]; then
        print_result "PASS" "Desktop launcher (my-hq.app) exists"
    else
        print_result "WARN" "Desktop launcher not found"
    fi

    if [[ -d "$HOME/Desktop/Setup Wizard.app" ]]; then
        print_result "PASS" "Setup Wizard app exists"
    else
        print_result "INFO" "Setup Wizard app not found (may be inline in installer)"
    fi
fi

# Check for authentication helper
if [[ -f "$HQ_PATH/authenticate-claude.sh" ]]; then
    print_result "PASS" "Authentication helper script exists"
    if [[ -x "$HQ_PATH/authenticate-claude.sh" ]]; then
        print_result "PASS" "Authentication helper is executable"
    else
        print_result "WARN" "Authentication helper not executable"
    fi
else
    print_result "INFO" "Authentication helper not found"
fi

echo ""

# ===== FUNCTIONALITY TESTS =====
echo -e "${WHITE}--- Functionality Tests ---${NC}"

# Test Claude in my-hq directory (only if Claude is installed)
if [[ "$CLAUDE_INSTALLED" == "true" ]]; then
    cd "$HQ_PATH" 2>/dev/null || true
    if help_output=$(claude --help 2>&1); then
        if echo "$help_output" | grep -qiE "claude|usage"; then
            print_result "PASS" "Claude CLI works in my-hq directory"
        else
            print_result "WARN" "Claude CLI runs but output unexpected"
        fi
    else
        print_result "FAIL" "Claude CLI error in my-hq directory"
    fi
    cd - >/dev/null 2>&1 || true
else
    if [[ "$IS_CI" == "true" ]]; then
        print_result "SKIP" "Claude CLI in my-hq (Claude not installed in CI)"
    else
        print_result "FAIL" "Claude CLI in my-hq (Claude not installed)"
    fi
fi

# Skip OAuth verification in CI (requires browser)
if [[ "$IS_CI" == "true" ]]; then
    print_result "SKIP" "OAuth authentication (skipped in CI - requires browser)"
fi

# Check PATH
if echo "$PATH" | grep -qE "npm|node|/usr/local/bin|/opt/homebrew/bin"; then
    print_result "PASS" "PATH includes expected directories"
else
    print_result "WARN" "PATH may not include all expected directories"
fi

echo ""

# ===== HQ FUNCTIONALITY VERIFICATION =====
echo -e "${WHITE}--- HQ Functionality Verification ---${NC}"

# Verify .claude/commands directory exists with slash commands
COMMANDS_PATH="$HQ_PATH/.claude/commands"
if [[ -d "$COMMANDS_PATH" ]]; then
    COMMAND_COUNT=$(find "$COMMANDS_PATH" -maxdepth 1 -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
    if [[ "$COMMAND_COUNT" -gt 0 ]]; then
        print_result "PASS" "Slash commands directory exists with $COMMAND_COUNT commands"

        # Check for essential commands
        MISSING_COMMANDS=""
        for cmd in "setup.md" "checkpoint.md" "handoff.md" "run.md"; do
            if [[ ! -f "$COMMANDS_PATH/$cmd" ]]; then
                MISSING_COMMANDS="$MISSING_COMMANDS $cmd"
            fi
        done
        if [[ -z "$MISSING_COMMANDS" ]]; then
            print_result "PASS" "Essential slash commands present (setup, checkpoint, handoff, run)"
        else
            print_result "WARN" "Missing essential commands:$MISSING_COMMANDS"
        fi
    else
        print_result "FAIL" "Slash commands directory empty"
    fi
else
    print_result "FAIL" "Slash commands directory not found"
fi

# Verify CLAUDE.md contains expected HQ content
CLAUDE_MD_PATH="$HQ_PATH/.claude/CLAUDE.md"
if [[ -f "$CLAUDE_MD_PATH" ]]; then
    CLAUDE_MD_CONTENT=$(cat "$CLAUDE_MD_PATH" 2>/dev/null)
    if [[ -n "$CLAUDE_MD_CONTENT" ]]; then
        # Check for essential HQ markers in CLAUDE.md
        FOUND_MARKERS=0
        TOTAL_MARKERS=4
        grep -q "HQ" "$CLAUDE_MD_PATH" 2>/dev/null && ((FOUND_MARKERS++))
        grep -q "workers" "$CLAUDE_MD_PATH" 2>/dev/null && ((FOUND_MARKERS++))
        grep -q "projects" "$CLAUDE_MD_PATH" 2>/dev/null && ((FOUND_MARKERS++))
        grep -q "/run" "$CLAUDE_MD_PATH" 2>/dev/null && ((FOUND_MARKERS++))

        if [[ "$FOUND_MARKERS" -eq "$TOTAL_MARKERS" ]]; then
            print_result "PASS" "CLAUDE.md contains valid HQ configuration ($FOUND_MARKERS/$TOTAL_MARKERS markers)"
        elif [[ "$FOUND_MARKERS" -gt 0 ]]; then
            print_result "WARN" "CLAUDE.md partially configured ($FOUND_MARKERS/$TOTAL_MARKERS markers)"
        else
            print_result "FAIL" "CLAUDE.md does not contain expected HQ configuration"
        fi
    else
        print_result "FAIL" "CLAUDE.md is empty or unreadable"
    fi
else
    print_result "FAIL" "CLAUDE.md not found for content verification"
fi

# Verify workers directory has worker definitions
WORKERS_PATH="$HQ_PATH/workers"
if [[ -d "$WORKERS_PATH" ]]; then
    WORKER_YAML_COUNT=$(find "$WORKERS_PATH" -name "*.yaml" 2>/dev/null | wc -l | tr -d ' ')
    WORKER_MD_COUNT=$(find "$WORKERS_PATH" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
    TOTAL_WORKER_FILES=$((WORKER_YAML_COUNT + WORKER_MD_COUNT))
    if [[ "$TOTAL_WORKER_FILES" -gt 0 ]]; then
        print_result "PASS" "Workers directory contains $TOTAL_WORKER_FILES worker definition files"
    else
        print_result "WARN" "Workers directory exists but no worker definitions found"
    fi
else
    print_result "FAIL" "Workers directory not found"
fi

# Test HQ is ready for Claude (comprehensive readiness check)
HQ_READY=true
HQ_ISSUES=""

# Check all critical components
[[ ! -f "$HQ_PATH/.claude/CLAUDE.md" ]] && HQ_READY=false && HQ_ISSUES="$HQ_ISSUES Missing CLAUDE.md;"
[[ ! -f "$HQ_PATH/agents.md" ]] && HQ_READY=false && HQ_ISSUES="$HQ_ISSUES Missing agents.md;"
[[ ! -d "$HQ_PATH/.claude/commands" ]] && HQ_READY=false && HQ_ISSUES="$HQ_ISSUES Missing commands directory;"
[[ ! -d "$HQ_PATH/workers" ]] && HQ_READY=false && HQ_ISSUES="$HQ_ISSUES Missing workers directory;"
[[ ! -d "$HQ_PATH/workspace" ]] && HQ_READY=false && HQ_ISSUES="$HQ_ISSUES Missing workspace directory;"

if [[ "$HQ_READY" == "true" ]]; then
    print_result "PASS" "HQ is fully configured and ready for Claude operations"
else
    print_result "FAIL" "HQ is not ready:$HQ_ISSUES"
fi

echo ""

# ===== SHELL CONFIGURATION =====
echo -e "${WHITE}--- Shell Configuration ---${NC}"

# Check zshrc
if [[ -f "$HOME/.zshrc" ]]; then
    if grep -q "my-hq\|npm\|node" "$HOME/.zshrc" 2>/dev/null; then
        print_result "PASS" ".zshrc contains relevant PATH entries"
    else
        print_result "INFO" ".zshrc exists but no my-hq entries found"
    fi
else
    print_result "INFO" ".zshrc not found (may use different shell)"
fi

# Check bash_profile
if [[ -f "$HOME/.bash_profile" ]]; then
    if grep -q "my-hq\|npm\|node" "$HOME/.bash_profile" 2>/dev/null; then
        print_result "PASS" ".bash_profile contains relevant PATH entries"
    else
        print_result "INFO" ".bash_profile exists but no my-hq entries found"
    fi
else
    print_result "INFO" ".bash_profile not found"
fi

# Check /etc/paths.d
if [[ -f "/etc/paths.d/my-hq" ]]; then
    print_result "PASS" "/etc/paths.d/my-hq exists"
else
    print_result "INFO" "/etc/paths.d/my-hq not found (may use shell config instead)"
fi

echo ""

# ===== OPTIONAL COMPONENTS =====
echo -e "${WHITE}--- Optional Components ---${NC}"

# Setup wizard
if [[ -f "$HQ_PATH/setup-wizard.sh" ]]; then
    print_result "PASS" "Setup wizard script exists"
    if [[ -x "$HQ_PATH/setup-wizard.sh" ]]; then
        print_result "PASS" "Setup wizard is executable"
    else
        print_result "WARN" "Setup wizard not executable"
    fi
else
    print_result "INFO" "Setup wizard script not in my-hq directory"
fi

# Update checker
if [[ -f "$HQ_PATH/check-updates.sh" ]]; then
    print_result "PASS" "Update checker script exists"
else
    print_result "INFO" "Update checker script not found"
fi

# Version file
if [[ -f "$HQ_PATH/.hq-version" ]]; then
    version=$(cat "$HQ_PATH/.hq-version")
    print_result "PASS" "Version file exists: $version"
else
    print_result "INFO" "Version file not found"
fi

# Installation log
if [[ -f "/tmp/my-hq-installer.log" ]]; then
    print_result "PASS" "Installation log exists at /tmp/my-hq-installer.log"
else
    print_result "INFO" "Installation log not found"
fi

echo ""

# ===== SUMMARY =====
TOTAL=$((PASSED + FAILED + WARNINGS + INFO + SKIPPED))

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}   Test Summary${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""
echo -e "${WHITE}Total Tests: $TOTAL${NC}"
echo -e "${GREEN}Passed:      $PASSED${NC}"
if [[ $FAILED -gt 0 ]]; then
    echo -e "${RED}Failed:      $FAILED${NC}"
else
    echo -e "${GRAY}Failed:      $FAILED${NC}"
fi
if [[ $WARNINGS -gt 0 ]]; then
    echo -e "${YELLOW}Warnings:    $WARNINGS${NC}"
else
    echo -e "${GRAY}Warnings:    $WARNINGS${NC}"
fi
echo -e "${CYAN}Info:        $INFO${NC}"
echo -e "${MAGENTA}Skipped:     $SKIPPED${NC}"

echo ""

# Determine overall result
OVERALL_RESULT="pass"
OVERALL_MESSAGE="All tests passed"
if [[ $FAILED -gt 0 ]]; then
    OVERALL_RESULT="fail"
    OVERALL_MESSAGE="One or more tests failed"
elif [[ $WARNINGS -gt 0 ]]; then
    OVERALL_RESULT="pass_with_warnings"
    OVERALL_MESSAGE="Tests passed with warnings"
fi

# Build failed tests JSON array
FAILED_TESTS_JSON="[]"
if [[ ${#FAILED_TESTS[@]} -gt 0 ]]; then
    FAILED_TESTS_JSON="["
    first=true
    for test in "${FAILED_TESTS[@]}"; do
        if [[ "$first" == "true" ]]; then
            first=false
        else
            FAILED_TESTS_JSON+=","
        fi
        # Escape special characters for JSON
        escaped_test=$(echo "$test" | sed 's/\\/\\\\/g; s/"/\\"/g')
        FAILED_TESTS_JSON+="{\"name\":\"$escaped_test\"}"
    done
    FAILED_TESTS_JSON+="]"
fi

# Get OS version for JSON
OS_VERSION="unknown"
if command -v sw_vers &>/dev/null; then
    OS_VERSION=$(sw_vers -productVersion)
else
    OS_VERSION=$(uname -r)
fi

# Output structured JSON summary for CI parsing
echo ""
echo "--- JSON Summary ---"
cat <<EOF
{
  "timestamp": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
  "environment": {
    "os": "macos",
    "ci": $IS_CI,
    "hq_path": "$HQ_PATH",
    "macos_version": "$OS_VERSION",
    "architecture": "$(uname -m)"
  },
  "results": {
    "total": $TOTAL,
    "passed": $PASSED,
    "failed": $FAILED,
    "warnings": $WARNINGS,
    "info": $INFO,
    "skipped": $SKIPPED
  },
  "overall": {
    "result": "$OVERALL_RESULT",
    "message": "$OVERALL_MESSAGE",
    "exit_code": $( [[ $FAILED -gt 0 ]] && echo "1" || echo "0" )
  },
  "failed_tests": $FAILED_TESTS_JSON
}
EOF
echo ""

if [[ $FAILED -gt 0 ]]; then
    echo -e "${RED}============================================${NC}"
    echo -e "${RED}   INSTALLATION HAS ISSUES${NC}"
    echo -e "${RED}============================================${NC}"
    echo ""
    echo -e "${RED}Failed tests:${NC}"
    for test in "${FAILED_TESTS[@]}"; do
        echo -e "${RED}  - $test${NC}"
    done
    echo ""

    # Diagnostic info on failure (helpful in CI)
    if [[ "$IS_CI" == "true" ]]; then
        echo "--- Diagnostic Info ---"
        echo "PATH: $PATH"
        echo "HQ_PATH exists: $( [[ -d "$HQ_PATH" ]] && echo "yes" || echo "no" )"
        if [[ -d "$HQ_PATH" ]]; then
            echo "HQ_PATH contents:"
            ls -la "$HQ_PATH" 2>/dev/null | head -20 || true
        fi
        echo "Node location: $(which node 2>/dev/null || echo "not found")"
        echo "npm location: $(which npm 2>/dev/null || echo "not found")"
        echo "Claude location: $(which claude 2>/dev/null || echo "not found")"
    fi

    exit 1
elif [[ $WARNINGS -gt 0 ]]; then
    echo -e "${YELLOW}============================================${NC}"
    echo -e "${YELLOW}   INSTALLATION OK WITH WARNINGS${NC}"
    echo -e "${YELLOW}============================================${NC}"
    echo ""
    exit 0
else
    echo -e "${GREEN}============================================${NC}"
    echo -e "${GREEN}   INSTALLATION VERIFIED SUCCESSFULLY${NC}"
    echo -e "${GREEN}============================================${NC}"
    echo ""
    exit 0
fi
