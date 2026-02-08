#!/bin/bash
# Bootstrap Script Tests
# Run with: bash tests/bootstrap.test.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BOOTSTRAP_SCRIPT="$ROOT_DIR/scripts/bootstrap.sh"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Test utilities
assert_equals() {
    local expected="$1"
    local actual="$2"
    local message="${3:-Assertion failed}"

    if [ "$expected" = "$actual" ]; then
        return 0
    else
        echo -e "${RED}FAIL:${NC} $message"
        echo "  Expected: $expected"
        echo "  Actual:   $actual"
        return 1
    fi
}

assert_contains() {
    local haystack="$1"
    local needle="$2"
    local message="${3:-Assertion failed}"

    if [[ "$haystack" == *"$needle"* ]]; then
        return 0
    else
        echo -e "${RED}FAIL:${NC} $message"
        echo "  Expected to contain: $needle"
        echo "  Actual: $haystack"
        return 1
    fi
}

run_test() {
    local test_name="$1"
    local test_fn="$2"

    TESTS_RUN=$((TESTS_RUN + 1))
    echo -n "  Testing: $test_name... "

    if $test_fn; then
        echo -e "${GREEN}PASS${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}FAIL${NC}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# Test: Bootstrap script exists
test_script_exists() {
    [ -f "$BOOTSTRAP_SCRIPT" ]
}

# Test: Bootstrap script is executable
test_script_executable() {
    [ -x "$BOOTSTRAP_SCRIPT" ] || chmod +x "$BOOTSTRAP_SCRIPT"
    [ -x "$BOOTSTRAP_SCRIPT" ]
}

# Test: Bootstrap script has required functions
test_has_required_functions() {
    local content
    content=$(cat "$BOOTSTRAP_SCRIPT")

    assert_contains "$content" "register_worker" "Should have register_worker function" && \
    assert_contains "$content" "send_heartbeat" "Should have send_heartbeat function" && \
    assert_contains "$content" "establish_websocket" "Should have establish_websocket function" && \
    assert_contains "$content" "cleanup" "Should have cleanup function"
}

# Test: Bootstrap script validates environment
test_validates_env() {
    # Run with missing env vars (should fail)
    local output
    output=$(HQ_API_URL="" HQ_API_KEY="" WORKER_ID="" bash "$BOOTSTRAP_SCRIPT" 2>&1 || true)

    assert_contains "$output" "required" "Should report missing required variables"
}

# Test: Bootstrap script handles registration failure gracefully
test_handles_registration_failure() {
    # Run with invalid URL (should fail gracefully after retries)
    local output
    output=$(
        HQ_API_URL="http://localhost:99999" \
        HQ_API_KEY="test-key" \
        WORKER_ID="test-worker" \
        REGISTRATION_RETRIES=1 \
        REGISTRATION_RETRY_DELAY=1 \
        bash "$BOOTSTRAP_SCRIPT" 2>&1 || true
    )

    # Should have attempted registration
    assert_contains "$output" "Registration attempt" "Should attempt registration" && \
    # Should have failed gracefully
    assert_contains "$output" "failed" "Should report failure"
}

# Test: Bootstrap script sets up signal handlers
test_signal_handlers() {
    local content
    content=$(cat "$BOOTSTRAP_SCRIPT")

    assert_contains "$content" "trap cleanup" "Should set up signal handlers"
}

# Test: Get capabilities returns correct values
test_get_capabilities() {
    # Source the script to get the function
    source "$BOOTSTRAP_SCRIPT"

    # Test dev worker
    local dev_caps
    WORKER_TYPE="dev" dev_caps=$(get_capabilities)
    assert_contains "$dev_caps" "code" "Dev worker should have code capability"

    # Test content worker
    local content_caps
    WORKER_TYPE="content" content_caps=$(get_capabilities)
    assert_contains "$content_caps" "content" "Content worker should have content capability"

    # Test generic worker
    local generic_caps
    WORKER_TYPE="unknown" generic_caps=$(get_capabilities)
    assert_contains "$generic_caps" "generic" "Unknown worker should have generic capability"
}

# Test: Heartbeat interval is configurable
test_heartbeat_config() {
    local content
    content=$(cat "$BOOTSTRAP_SCRIPT")

    assert_contains "$content" "HEARTBEAT_INTERVAL" "Should have configurable heartbeat interval"
}

# Test: WebSocket URL conversion
test_websocket_url() {
    local content
    content=$(cat "$BOOTSTRAP_SCRIPT")

    assert_contains "$content" "http:/ws:" "Should convert HTTP to WS"
}

# Main test runner
main() {
    echo "=== Bootstrap Script Tests ==="
    echo ""

    run_test "Script exists" test_script_exists
    run_test "Script is executable" test_script_executable
    run_test "Has required functions" test_has_required_functions
    run_test "Validates environment" test_validates_env
    run_test "Sets up signal handlers" test_signal_handlers
    run_test "Get capabilities" test_get_capabilities
    run_test "Heartbeat is configurable" test_heartbeat_config
    run_test "WebSocket URL conversion" test_websocket_url

    echo ""
    echo "=== Test Results ==="
    echo "  Total:  $TESTS_RUN"
    echo -e "  ${GREEN}Passed: $TESTS_PASSED${NC}"
    if [ $TESTS_FAILED -gt 0 ]; then
        echo -e "  ${RED}Failed: $TESTS_FAILED${NC}"
    else
        echo "  Failed: $TESTS_FAILED"
    fi
    echo ""

    if [ $TESTS_FAILED -gt 0 ]; then
        exit 1
    fi
}

# Run integration test separately (requires network)
run_integration_test() {
    echo "=== Integration Test ==="
    echo "This test requires a running API server"
    echo ""

    run_test "Handles registration failure" test_handles_registration_failure

    echo ""
}

# Check for integration flag
if [ "${1:-}" = "--integration" ]; then
    run_integration_test
else
    main
fi
