#!/bin/bash
# HQ Worker Bootstrap Script
# Registers worker with core-api and establishes WebSocket connection
#
# Required environment variables:
#   HQ_API_URL - Base URL of the HQ API (e.g., http://api:3000)
#   HQ_API_KEY - API key for authentication
#   WORKER_ID - Unique identifier for this worker
#
# Optional environment variables:
#   WORKER_TYPE - Type of worker (default: generic)
#   WORKER_NAME - Human-readable name (default: Worker-$WORKER_ID)
#   CONTAINER_ID - Container ID (default: auto-detected from hostname)
#   HEARTBEAT_INTERVAL - Seconds between heartbeats (default: 30)
#   REGISTRATION_RETRIES - Number of registration attempts (default: 5)
#   REGISTRATION_RETRY_DELAY - Seconds between retries (default: 5)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration with defaults
WORKER_TYPE="${WORKER_TYPE:-generic}"
WORKER_NAME="${WORKER_NAME:-Worker-${WORKER_ID}}"
CONTAINER_ID="${CONTAINER_ID:-$(hostname)}"
HEARTBEAT_INTERVAL="${HEARTBEAT_INTERVAL:-30}"
REGISTRATION_RETRIES="${REGISTRATION_RETRIES:-5}"
REGISTRATION_RETRY_DELAY="${REGISTRATION_RETRY_DELAY:-5}"

# State
REGISTERED=false
WS_PID=""
HEARTBEAT_PID=""

# Logging functions
log_info() {
    echo -e "${GREEN}[BOOTSTRAP]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[BOOTSTRAP]${NC} $1"
}

log_error() {
    echo -e "${RED}[BOOTSTRAP]${NC} $1"
}

log_debug() {
    if [ "${DEBUG:-}" = "true" ]; then
        echo -e "${BLUE}[BOOTSTRAP]${NC} $1"
    fi
}

# Cleanup function for graceful shutdown
cleanup() {
    log_info "Shutting down bootstrap..."

    # Stop heartbeat loop
    if [ -n "$HEARTBEAT_PID" ] && kill -0 "$HEARTBEAT_PID" 2>/dev/null; then
        log_debug "Stopping heartbeat loop (PID: $HEARTBEAT_PID)"
        kill "$HEARTBEAT_PID" 2>/dev/null || true
    fi

    # Close WebSocket connection (if running as background process)
    if [ -n "$WS_PID" ] && kill -0 "$WS_PID" 2>/dev/null; then
        log_debug "Closing WebSocket connection (PID: $WS_PID)"
        kill "$WS_PID" 2>/dev/null || true
    fi

    # Update worker status to offline if registered
    if [ "$REGISTERED" = true ] && [ -n "$HQ_API_URL" ] && [ -n "$WORKER_ID" ]; then
        log_info "Updating worker status to offline..."
        curl -s -X PATCH \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer ${HQ_API_KEY}" \
            -d '{"status": "completed"}' \
            "${HQ_API_URL}/api/workers/${WORKER_ID}" > /dev/null 2>&1 || true
    fi

    log_info "Bootstrap shutdown complete"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM SIGQUIT

# Validate required environment variables
validate_env() {
    local missing=0

    if [ -z "$HQ_API_URL" ]; then
        log_error "HQ_API_URL is required"
        missing=1
    fi

    if [ -z "$HQ_API_KEY" ]; then
        log_error "HQ_API_KEY is required"
        missing=1
    fi

    if [ -z "$WORKER_ID" ]; then
        log_error "WORKER_ID is required"
        missing=1
    fi

    if [ $missing -eq 1 ]; then
        log_error "Missing required environment variables"
        return 1
    fi

    log_info "Environment validated"
    log_debug "  HQ_API_URL: $HQ_API_URL"
    log_debug "  WORKER_ID: $WORKER_ID"
    log_debug "  WORKER_TYPE: $WORKER_TYPE"
    log_debug "  CONTAINER_ID: $CONTAINER_ID"

    return 0
}

# Get worker capabilities based on worker type
get_capabilities() {
    local caps=""

    case "$WORKER_TYPE" in
        dev|dev-team|code)
            caps='["code", "git", "test", "build"]'
            ;;
        content|content-brand|content-sales)
            caps='["content", "writing", "social"]'
            ;;
        analyst|research)
            caps='["analysis", "research", "report"]'
            ;;
        ops|cfo)
            caps='["ops", "automation", "report"]'
            ;;
        *)
            caps='["generic"]'
            ;;
    esac

    echo "$caps"
}

# Register worker with the core-api
register_worker() {
    local attempt=1
    local capabilities
    capabilities=$(get_capabilities)

    log_info "Registering worker with core-api..."
    log_debug "  Name: $WORKER_NAME"
    log_debug "  Type: $WORKER_TYPE"
    log_debug "  Container: $CONTAINER_ID"
    log_debug "  Capabilities: $capabilities"

    while [ $attempt -le "$REGISTRATION_RETRIES" ]; do
        log_info "Registration attempt $attempt of $REGISTRATION_RETRIES"

        # Build the request body
        local body
        body=$(cat <<EOF
{
    "id": "${WORKER_ID}",
    "name": "${WORKER_NAME}",
    "status": "pending",
    "containerId": "${CONTAINER_ID}",
    "metadata": {
        "type": "${WORKER_TYPE}",
        "capabilities": ${capabilities},
        "containerHost": "$(hostname -f 2>/dev/null || hostname)",
        "startedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    }
}
EOF
)

        # Make the registration request
        local response
        local http_code

        response=$(curl -s -w "\n%{http_code}" \
            -X POST \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer ${HQ_API_KEY}" \
            -d "$body" \
            "${HQ_API_URL}/api/workers" 2>&1)

        http_code=$(echo "$response" | tail -n1)
        response=$(echo "$response" | sed '$d')

        log_debug "HTTP response code: $http_code"
        log_debug "Response body: $response"

        case "$http_code" in
            201)
                log_info "Worker registered successfully"
                REGISTERED=true
                return 0
                ;;
            409)
                # Worker already exists, update it instead
                log_warn "Worker already registered, updating..."

                local update_body
                update_body=$(cat <<EOF
{
    "status": "pending",
    "containerId": "${CONTAINER_ID}",
    "metadata": {
        "type": "${WORKER_TYPE}",
        "capabilities": ${capabilities},
        "containerHost": "$(hostname -f 2>/dev/null || hostname)",
        "restartedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    }
}
EOF
)

                local update_response
                update_response=$(curl -s -w "\n%{http_code}" \
                    -X PATCH \
                    -H "Content-Type: application/json" \
                    -H "Authorization: Bearer ${HQ_API_KEY}" \
                    -d "$update_body" \
                    "${HQ_API_URL}/api/workers/${WORKER_ID}" 2>&1)

                local update_code
                update_code=$(echo "$update_response" | tail -n1)

                if [ "$update_code" = "200" ]; then
                    log_info "Worker updated successfully"
                    REGISTERED=true
                    return 0
                else
                    log_warn "Failed to update worker (HTTP $update_code)"
                fi
                ;;
            000)
                log_warn "Could not connect to API (network error)"
                ;;
            401|403)
                log_error "Authentication failed (HTTP $http_code)"
                log_error "Please check your HQ_API_KEY"
                return 1
                ;;
            *)
                log_warn "Registration failed (HTTP $http_code): $response"
                ;;
        esac

        if [ $attempt -lt "$REGISTRATION_RETRIES" ]; then
            log_info "Retrying in ${REGISTRATION_RETRY_DELAY} seconds..."
            sleep "$REGISTRATION_RETRY_DELAY"
        fi

        attempt=$((attempt + 1))
    done

    log_error "Failed to register worker after $REGISTRATION_RETRIES attempts"
    return 1
}

# Send heartbeat to the API
send_heartbeat() {
    local response
    local http_code

    response=$(curl -s -w "\n%{http_code}" \
        -X POST \
        -H "Authorization: Bearer ${HQ_API_KEY}" \
        "${HQ_API_URL}/api/workers/${WORKER_ID}/heartbeat" 2>&1)

    http_code=$(echo "$response" | tail -n1)

    if [ "$http_code" = "200" ]; then
        log_debug "Heartbeat sent successfully"
        return 0
    else
        log_warn "Heartbeat failed (HTTP $http_code)"
        return 1
    fi
}

# Start the heartbeat loop
start_heartbeat_loop() {
    log_info "Starting heartbeat loop (interval: ${HEARTBEAT_INTERVAL}s)"

    while true; do
        sleep "$HEARTBEAT_INTERVAL"
        send_heartbeat || true
    done &

    HEARTBEAT_PID=$!
    log_debug "Heartbeat loop started (PID: $HEARTBEAT_PID)"
}

# Establish WebSocket connection
# Note: This is a simplified implementation using curl for HTTP long-poll
# In production, consider using websocat or a proper WebSocket client
establish_websocket() {
    local ws_url

    # Convert HTTP URL to WebSocket URL
    ws_url="${HQ_API_URL/http:/ws:}"
    ws_url="${ws_url/https:/wss:}"
    ws_url="${ws_url}/ws?deviceId=${WORKER_ID}"

    log_info "WebSocket URL: $ws_url"

    # Check if websocat is available
    if command -v websocat &> /dev/null; then
        log_info "Using websocat for WebSocket connection"

        # Create a named pipe for bidirectional communication
        local ws_pipe="/tmp/ws_${WORKER_ID}"
        rm -f "$ws_pipe" "$ws_pipe.in"
        mkfifo "$ws_pipe" "$ws_pipe.in"

        # Start websocat in background
        (
            websocat -t "$ws_url" < "$ws_pipe.in" > "$ws_pipe" 2>&1
        ) &
        WS_PID=$!

        log_info "WebSocket connection established (PID: $WS_PID)"

        # Send subscribe message
        echo '{"type":"subscribe","payload":{"workerIds":[]}}' > "$ws_pipe.in"

        # Read messages in background
        (
            while read -r line; do
                log_debug "WS received: $line"
                handle_ws_message "$line"
            done < "$ws_pipe"
        ) &

    else
        log_warn "websocat not available, WebSocket features limited"
        log_info "For full WebSocket support, install websocat"

        # Fallback: Just log that WebSocket is not available
        # The heartbeat loop will maintain connectivity with the API
        return 0
    fi
}

# Handle incoming WebSocket messages
handle_ws_message() {
    local message="$1"
    local msg_type

    msg_type=$(echo "$message" | jq -r '.type' 2>/dev/null || echo "unknown")

    case "$msg_type" in
        connected)
            log_info "WebSocket connected, server acknowledged"
            ;;
        subscribed)
            log_info "Subscribed to worker updates"
            ;;
        pong)
            log_debug "Received pong"
            ;;
        worker_status)
            log_debug "Worker status update received"
            ;;
        question_answered)
            log_info "Question answered, processing..."
            # Handle the answer - this would trigger the Claude CLI
            ;;
        error)
            local error_msg
            error_msg=$(echo "$message" | jq -r '.payload.message' 2>/dev/null || echo "unknown error")
            log_error "WebSocket error: $error_msg"
            ;;
        *)
            log_debug "Unknown message type: $msg_type"
            ;;
    esac
}

# Update worker status
update_status() {
    local status="$1"
    local current_task="${2:-}"

    local body
    if [ -n "$current_task" ]; then
        body="{\"status\": \"${status}\", \"currentTask\": \"${current_task}\"}"
    else
        body="{\"status\": \"${status}\"}"
    fi

    local response
    response=$(curl -s -w "\n%{http_code}" \
        -X PATCH \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${HQ_API_KEY}" \
        -d "$body" \
        "${HQ_API_URL}/api/workers/${WORKER_ID}" 2>&1)

    local http_code
    http_code=$(echo "$response" | tail -n1)

    if [ "$http_code" = "200" ]; then
        log_info "Worker status updated to: $status"
        return 0
    else
        log_warn "Failed to update status (HTTP $http_code)"
        return 1
    fi
}

# Export functions for use by entrypoint
export -f update_status
export -f send_heartbeat
export -f log_info
export -f log_warn
export -f log_error
export -f log_debug

# Main bootstrap function
main() {
    log_info "=== HQ Worker Bootstrap ==="
    log_info "Version: 1.0.0"
    log_info "Worker ID: ${WORKER_ID:-not set}"
    log_info "Worker Type: ${WORKER_TYPE}"

    # Validate environment
    if ! validate_env; then
        log_error "Environment validation failed"
        exit 1
    fi

    # Register with the API
    if ! register_worker; then
        log_error "Worker registration failed"
        exit 1
    fi

    # Start heartbeat loop
    start_heartbeat_loop

    # Establish WebSocket connection
    establish_websocket

    # Update status to running
    update_status "running"

    log_info "=== Bootstrap complete ==="
    log_info "Worker is ready to receive tasks"

    # Return success - let entrypoint continue
    return 0
}

# Run if executed directly (not sourced)
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    main "$@"
fi
