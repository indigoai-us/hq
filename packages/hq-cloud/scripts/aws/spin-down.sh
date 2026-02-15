#!/usr/bin/env bash
# spin-down.sh — Stop all running tasks (preserve infrastructure)
#
# Keeps S3, ECR, ECS cluster — just stops running Fargate tasks.
# Usage: ./spin-down.sh [--profile hq-cloud]

set -euo pipefail

CLUSTER="hq-cloud-dev"

echo "=== HQ Cloud Spin Down ==="
echo "Cluster: $CLUSTER"
echo ""

# List running tasks
TASK_ARNS=$(aws ecs list-tasks --cluster "$CLUSTER" --desired-status RUNNING \
  --query 'taskArns[]' --output text 2>/dev/null || echo "")

if [ -z "$TASK_ARNS" ] || [ "$TASK_ARNS" = "None" ]; then
  echo "No running tasks found. Nothing to stop."
  echo ""
  echo "=== Spin Down Complete ==="
  exit 0
fi

# Count tasks
TASK_COUNT=$(echo "$TASK_ARNS" | wc -w)
echo "Found $TASK_COUNT running task(s)."
echo ""

# Stop each task
for TASK in $TASK_ARNS; do
  TASK_SHORT=$(echo "$TASK" | rev | cut -d'/' -f1 | rev)
  echo "Stopping: $TASK_SHORT"
  aws ecs stop-task --cluster "$CLUSTER" --task "$TASK" --reason "spin-down" >/dev/null 2>&1 || true
done

# Wait and verify
echo ""
echo "Waiting for tasks to stop..."
sleep 5

REMAINING=$(aws ecs list-tasks --cluster "$CLUSTER" --desired-status RUNNING \
  --query 'taskArns | length(@)' --output text 2>/dev/null || echo "0")

if [ "$REMAINING" = "0" ] || [ "$REMAINING" = "None" ]; then
  echo "All tasks stopped."
else
  echo "Warning: $REMAINING task(s) still running (may take a moment to stop)."
fi

echo ""
echo "Infrastructure preserved. Run spin-up.sh to resume."
echo "Run teardown.sh to destroy all infrastructure."
echo ""
echo "=== Spin Down Complete ==="
