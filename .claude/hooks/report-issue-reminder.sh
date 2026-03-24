#!/usr/bin/env bash
# PostToolUseFailure hook: remind agent to report blocking failures
echo "If this failure is blocking, report it: ./companies/ghq/tools/report_issue.sh \"<title>\" -d \"<description>\" -p <1|2|3>. Do NOT retry the same failing call."
