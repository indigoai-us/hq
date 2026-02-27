#!/bin/bash
# PreCompact hook: fires when auto-compaction triggers (context window full).
# Nudges Claude to run /handoff before context is lost.

cat <<'EOF'
CONTEXT WINDOW FULL — auto-compaction triggered.

IMMEDIATELY after this compaction completes:
1. Finish your current atomic action (don't leave files half-edited)
2. Run /handoff to preserve session state
3. Do NOT start new tasks — hand off first

This is automatic. The user will be notified.
EOF
