#!/bin/bash
# HQ Worker Runtime Entrypoint
# Initializes the worker environment, bootstraps API connection, and starts the worker process

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[ENTRYPOINT]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[ENTRYPOINT]${NC} $1"
}

log_error() {
    echo -e "${RED}[ENTRYPOINT]${NC} $1"
}

log_debug() {
    if [ "${DEBUG:-}" = "true" ]; then
        echo -e "${BLUE}[ENTRYPOINT]${NC} $1"
    fi
}

# Validate required environment variables
validate_env() {
    local missing=0

    if [ -z "$HQ_API_URL" ]; then
        log_warn "HQ_API_URL is not set"
    fi

    if [ -z "$HQ_API_KEY" ]; then
        log_warn "HQ_API_KEY is not set"
    fi

    if [ -z "$WORKER_ID" ]; then
        log_warn "WORKER_ID is not set"
    fi

    return $missing
}

# Initialize worker environment
init_worker() {
    log_info "Initializing HQ Worker Runtime"
    log_info "Worker ID: ${WORKER_ID:-not set}"
    log_info "HQ API URL: ${HQ_API_URL:-not set}"
    log_info "Node.js version: $(node --version)"
    log_info "HQ Root: ${HQ_ROOT:-/hq}"

    # Verify HQ directory structure
    if [ -d "/hq" ]; then
        log_info "HQ directory structure verified"
    else
        log_error "HQ directory not found"
        exit 1
    fi

    # Verify Claude CLI is available
    if command -v claude &> /dev/null; then
        log_info "Claude CLI available: $(claude version 2>/dev/null | head -1)"
    else
        log_error "Claude CLI not found"
        exit 1
    fi
}

# Run the bootstrap script to register with API
run_bootstrap() {
    local bootstrap_script="/usr/local/bin/bootstrap.sh"

    if [ ! -f "$bootstrap_script" ]; then
        log_warn "Bootstrap script not found at $bootstrap_script"
        return 1
    fi

    # Only run bootstrap in worker mode and if API is configured
    if [ -n "$HQ_API_URL" ] && [ -n "$HQ_API_KEY" ] && [ -n "$WORKER_ID" ]; then
        log_info "Running bootstrap to register with core-api..."

        # Source the bootstrap script so we get its functions
        # shellcheck source=bootstrap.sh
        source "$bootstrap_script"

        # Run the main bootstrap function
        if main; then
            log_info "Bootstrap completed successfully"
            return 0
        else
            log_error "Bootstrap failed"
            return 1
        fi
    else
        log_warn "Skipping bootstrap - missing required environment variables"
        log_warn "Set HQ_API_URL, HQ_API_KEY, and WORKER_ID for API registration"
        return 0
    fi
}

# Start the worker process
start_worker() {
    log_info "Starting worker process..."

    # If a specific command is provided, execute it
    if [ "$1" = "worker" ]; then
        log_info "Worker mode: waiting for tasks..."

        # Run bootstrap to register with API and start heartbeat
        if ! run_bootstrap; then
            log_error "Failed to bootstrap worker"
            # Continue anyway in degraded mode
            log_warn "Running in degraded mode without API registration"
        fi

        # Keep the container running and wait for tasks
        # The heartbeat loop runs in the background from bootstrap
        log_info "Worker ready and listening for tasks..."

        # Wait forever, handling signals properly
        while true; do
            sleep 86400 &
            WORKER_PID=$!
            wait $WORKER_PID || true
            # If shutdown is in progress, break out of the loop
            if [ "$SHUTDOWN_IN_PROGRESS" = true ]; then
                break
            fi
        done
    elif [ "$1" = "shell" ]; then
        log_info "Starting interactive shell..."
        exec /bin/bash
    elif [ "$1" = "bootstrap-only" ]; then
        # Just run bootstrap and exit (useful for testing)
        log_info "Running bootstrap only..."
        run_bootstrap
        exit $?
    else
        # Execute any other command passed
        log_info "Executing: $*"

        # Run bootstrap first if in production mode
        if [ "${SKIP_BOOTSTRAP:-}" != "true" ]; then
            run_bootstrap || log_warn "Bootstrap failed, continuing with command"
        fi

        exec "$@"
    fi
}

# State tracking for shutdown
SHUTDOWN_IN_PROGRESS=false
WORKER_PID=""
SHUTDOWN_DRAIN_TIMEOUT=${SHUTDOWN_DRAIN_TIMEOUT:-25}

# Cleanup function for graceful shutdown
cleanup() {
    if [ "$SHUTDOWN_IN_PROGRESS" = true ]; then
        log_warn "Shutdown already in progress, ignoring duplicate signal"
        return
    fi
    SHUTDOWN_IN_PROGRESS=true

    local signal="${1:-UNKNOWN}"
    log_info "Received $signal signal, initiating graceful shutdown..."

    # Phase 1: Allow current operation to complete (with timeout)
    if [ -n "$WORKER_PID" ] && kill -0 "$WORKER_PID" 2>/dev/null; then
        log_info "Waiting for current operation to complete (timeout: ${SHUTDOWN_DRAIN_TIMEOUT}s)..."
        local waited=0
        while kill -0 "$WORKER_PID" 2>/dev/null && [ $waited -lt "$SHUTDOWN_DRAIN_TIMEOUT" ]; do
            sleep 1
            waited=$((waited + 1))
        done

        if kill -0 "$WORKER_PID" 2>/dev/null; then
            log_warn "Drain timeout reached after ${SHUTDOWN_DRAIN_TIMEOUT}s, terminating worker process..."
            kill -TERM "$WORKER_PID" 2>/dev/null || true
            sleep 2
            if kill -0 "$WORKER_PID" 2>/dev/null; then
                log_warn "Worker process still alive, force killing..."
                kill -9 "$WORKER_PID" 2>/dev/null || true
            fi
        else
            log_info "Worker process completed before timeout"
        fi
    fi

    # Phase 2: Send final status to API
    if [ "$REGISTERED" = true ] && [ -n "$HQ_API_URL" ] && [ -n "$WORKER_ID" ]; then
        log_info "Sending final status to API..."
        curl -s -X PATCH \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer ${HQ_API_KEY}" \
            -d "{\"status\": \"terminated\", \"metadata\": {\"reason\": \"$signal\", \"finalUpdate\": true, \"shutdownAt\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}}" \
            "${HQ_API_URL}/api/workers/${WORKER_ID}" > /dev/null 2>&1 || log_warn "Failed to send final status"
    fi

    # Phase 3: Write checkpoint if supported
    if [ -d "/hq/workspace/checkpoints" ] || mkdir -p "/hq/workspace/checkpoints" 2>/dev/null; then
        local checkpoint_file="/hq/workspace/checkpoints/checkpoint-${WORKER_ID:-unknown}-$(date +%s).json"
        log_info "Writing checkpoint: $checkpoint_file"
        cat > "$checkpoint_file" 2>/dev/null <<CHECKPOINT
{
  "workerId": "${WORKER_ID:-unknown}",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "reason": "$signal",
  "eventCount": 0
}
CHECKPOINT
        if [ $? -eq 0 ]; then
            log_info "Checkpoint written successfully"
        else
            log_warn "Failed to write checkpoint"
        fi
    fi

    # Phase 4: Bootstrap cleanup (heartbeat, websocket, etc.)
    if type cleanup_bootstrap &>/dev/null 2>&1; then
        cleanup_bootstrap
    fi

    log_info "Graceful shutdown complete"
    exit 0
}

# Set up signal handlers with signal name forwarding
trap 'cleanup SIGTERM' SIGTERM
trap 'cleanup SIGINT' SIGINT
trap 'cleanup SIGQUIT' SIGQUIT

# Main execution
main() {
    validate_env
    init_worker
    start_worker "$@"
}

main "$@"
