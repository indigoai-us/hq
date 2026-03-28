#!/bin/bash
# Fires on PreCompact — nudges Claude to capture learnings before context is lost.

cat <<'EOF'
CAPTURE LEARNINGS — context is about to be lost.

Before proceeding:
1. Finish your current atomic action (don't leave files half-edited)
2. Run /learn to distill session insights into the knowledge base
3. Do NOT start new tasks — capture learnings first
EOF
