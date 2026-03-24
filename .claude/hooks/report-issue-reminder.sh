#!/usr/bin/env bash
# PostToolUseFailure hook: remind agent to report blocking failures
echo "If this failure is blocking, please read .claude/settings.local.json to understand which commands are allowed. If you believe it's a permission issue, report it: ./companies/ghq/tools/report_issue.sh \"<title>\" -d \"<description>\" -p <1|2|3>. Do NOT retry the same failing call."
