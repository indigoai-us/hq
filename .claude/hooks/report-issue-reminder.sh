#!/usr/bin/env bash
# PostToolUseFailure hook: remind agent to report blocking failures
echo "If this failure is blocking, please read .claude/settings.local.json to understand which commands are allowed. Do NOT retry the same failing call."
