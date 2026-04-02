#!/bin/bash
# PreCompact hook: fires at 60% context. Compaction cannot be blocked,
# so this hook forces an immediate handoff to preserve session state.

cat <<'EOF'
╔══════════════════════════════════════════════════════════════╗
║  MANDATORY HANDOFF — context at 60%, compaction imminent    ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  STOP. Do not continue your current task.                    ║
║                                                              ║
║  1. If mid-edit, save the file — do NOT leave partial edits  ║
║  2. Run /handoff RIGHT NOW                                   ║
║  3. Do NOT start any new work                                ║
║  4. Do NOT try to "finish quickly" — hand off immediately    ║
║                                                              ║
║  Compaction will destroy context. Handoff preserves it.      ║
║  The next session picks up exactly where you left off.       ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
EOF
