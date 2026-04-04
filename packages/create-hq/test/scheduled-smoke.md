# Scheduled Smoke Test — create-hq Container Validation

Run the containerized smoke tests for create-hq, write reports, and alert on failure.

## Context

This prompt is designed to be executed by a scheduled agent (via CronCreate or external scheduler). It is self-contained — all instructions are here.

## Steps

### 1. Run the smoke test orchestrator

```bash
# Ensure PATH includes user tools (Homebrew, nvm, Docker)
source ~/.zshrc 2>/dev/null || source ~/.bash_profile 2>/dev/null || true

cd ~/hq/repos/public/hq
bash packages/create-hq/test/run-smoke-tests.sh 2>&1
```

Capture the exit code. The orchestrator:
- Builds both Docker images (blank-slate, pre-deps)
- Packs the local create-hq build
- Runs smoke-test.sh in each container
- Writes `packages/create-hq/test/results/latest.json`

### 2. Copy report to workspace

```bash
DATE=$(date +%Y-%m-%d)
REPORT_DIR=~/hq/workspace/reports/create-hq-smoke
cp packages/create-hq/test/results/latest.json "$REPORT_DIR/${DATE}.json"
```

### 3. Update latest-status.json

Read the report and write a status summary:

```bash
PASSED=$(python3 -c "import json; r=json.load(open('packages/create-hq/test/results/latest.json')); print('true' if r['passed'] else 'false')")
IMAGES_TESTED=$(python3 -c "import json; r=json.load(open('packages/create-hq/test/results/latest.json')); print(len(r['images']))")

cat > "$REPORT_DIR/latest-status.json" <<STATUSEOF
{
  "status": "$([ "$PASSED" = "true" ] && echo "pass" || echo "fail")",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "images_tested": $IMAGES_TESTED,
  "report": "${DATE}.json"
}
STATUSEOF
```

### 4. Prune old reports (keep last 30)

```bash
ls -t "$REPORT_DIR"/????-??-??.json 2>/dev/null | tail -n +31 | xargs rm -f 2>/dev/null || true
```

### 5. On failure: Slack alert

If the smoke tests failed (`PASSED` is `false`):

Use the `/slack` skill to post to **#project-hq** in the **Indigo** workspace:

> **create-hq smoke test FAILED** (DATE)
>
> Report: `workspace/reports/create-hq-smoke/DATE.json`
>
> Failed images: (list which images failed and which assertions failed, extracted from the JSON report)
>
> Investigating — triage session spawning.

### 6. On failure: spawn cmux triage session

If failed, use the `/cmux` skill to launch a triage session:

```
/cmux launch --name smoke-triage-DATE --cwd ~/hq -- "Smoke test failure for create-hq on DATE. Report at workspace/reports/create-hq-smoke/DATE.json. Investigate which assertions failed and why. Check: 1) Did Docker images build? 2) Did npm install succeed inside containers? 3) Did template structure change? 4) Check git log for recent changes to template/ or packages/create-hq/. Fix and re-run: bash packages/create-hq/test/run-smoke-tests.sh"
```

### 7. On all-pass: silent success

If all passed, no Slack notification needed. The `latest-status.json` file is updated — that's sufficient.

## Scheduling

Register this prompt as a daily scheduled task. Recommended: run at ~6:07 AM local time daily.

```
CronCreate: cron="7 6 * * *" prompt="Read and execute ~/hq/repos/public/hq/packages/create-hq/test/scheduled-smoke.md"
```

Note: CronCreate jobs are session-only (max 7 days). For persistent scheduling, use an external cron job or launchd plist that invokes:

```bash
claude -p "Read and execute ~/hq/repos/public/hq/packages/create-hq/test/scheduled-smoke.md"
```

## PATH Requirements

The smoke test orchestrator requires `npm`, `node`, and `docker` in PATH. When running from cron or a scheduled agent, these may not be available because the user's shell profile (~/.zshrc) is not sourced.

The orchestrator script now includes automatic PATH detection, but if tools are still not found:

1. **For cron jobs**: Use a login shell wrapper:
   ```bash
   7 6 * * * /bin/zsh -l -c "cd ~/hq/repos/public/hq && bash packages/create-hq/test/run-smoke-tests.sh"
   ```

2. **For Claude Code scheduled agents**: The agent should source the profile before running (see Step 1 above).

3. **For launchd plists**: Set the PATH environment key in the plist to include `/opt/homebrew/bin:/usr/local/bin`.

## Expected Artifacts

- `workspace/reports/create-hq-smoke/{date}.json` — daily report
- `workspace/reports/create-hq-smoke/latest-status.json` — current status
- Slack #project-hq message on failure
- cmux triage session on failure
