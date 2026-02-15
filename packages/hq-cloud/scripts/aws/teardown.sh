#!/usr/bin/env bash
# teardown.sh — Destroy all HQ Cloud infrastructure
#
# Stops running tasks, empties S3 bucket, destroys all CDK stacks.
# Usage: ./teardown.sh [--profile hq-cloud]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$SCRIPT_DIR/../../worker-runtime/infra"

echo "=== HQ Cloud Teardown ==="
echo ""

# Stop all running ECS tasks
echo "--- Stopping running tasks ---"
CLUSTER="hq-cloud-dev"
TASK_ARNS=$(aws ecs list-tasks --cluster "$CLUSTER" --query 'taskArns[]' --output text 2>/dev/null || echo "")
if [ -n "$TASK_ARNS" ] && [ "$TASK_ARNS" != "None" ]; then
  for TASK in $TASK_ARNS; do
    echo "Stopping task: $TASK"
    aws ecs stop-task --cluster "$CLUSTER" --task "$TASK" --reason "teardown" 2>/dev/null || true
  done
  echo "Waiting for tasks to stop..."
  sleep 10
else
  echo "No running tasks found."
fi

# Empty S3 bucket (CDK autoDeleteObjects handles this, but be safe)
echo ""
echo "--- Emptying S3 bucket ---"
BUCKET="hq-cloud-files-dev"
if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  aws s3 rm "s3://$BUCKET" --recursive 2>/dev/null || true
  # Delete all object versions for versioned bucket
  aws s3api list-object-versions --bucket "$BUCKET" --query 'Versions[].{Key:Key,VersionId:VersionId}' --output text 2>/dev/null | \
    while read -r KEY VERSION; do
      [ -n "$KEY" ] && [ "$KEY" != "None" ] && \
        aws s3api delete-object --bucket "$BUCKET" --key "$KEY" --version-id "$VERSION" 2>/dev/null || true
    done
  # Delete markers too
  aws s3api list-object-versions --bucket "$BUCKET" --query 'DeleteMarkers[].{Key:Key,VersionId:VersionId}' --output text 2>/dev/null | \
    while read -r KEY VERSION; do
      [ -n "$KEY" ] && [ "$KEY" != "None" ] && \
        aws s3api delete-object --bucket "$BUCKET" --key "$KEY" --version-id "$VERSION" 2>/dev/null || true
    done
  echo "Bucket emptied."
else
  echo "Bucket '$BUCKET' not found (may already be deleted)."
fi

# Destroy all CDK stacks
echo ""
echo "--- Destroying CDK stacks ---"
cd "$INFRA_DIR"
npx cdk destroy --all --force "$@"

# Verify cleanup
echo ""
echo "--- Verifying cleanup ---"
REMAINING=$(aws cloudformation list-stacks \
  --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
  --query "StackSummaries[?starts_with(StackName, 'HqCloud') || starts_with(StackName, 'HqWorkerRuntime')].StackName" \
  --output text 2>/dev/null || echo "")

if [ -n "$REMAINING" ] && [ "$REMAINING" != "None" ]; then
  echo "WARNING: Stacks still exist: $REMAINING"
  exit 1
else
  echo "All HQ Cloud stacks destroyed."
fi

# Clean up local files
rm -f "$SCRIPT_DIR/../../.env.deployed" "$SCRIPT_DIR/../../.env.deployed.json"

echo ""
echo "=== Teardown Complete ==="
