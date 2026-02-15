#!/usr/bin/env bash
# audit.sh — List all hq-cloud resources, show costs, check budget
#
# Usage: ./audit.sh [--profile hq-cloud]

set -euo pipefail

echo "=== HQ Cloud Resource Audit ==="
echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""

# --- CloudFormation Stacks ---
echo "--- CloudFormation Stacks ---"
aws cloudformation list-stacks \
  --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE UPDATE_ROLLBACK_COMPLETE \
  --query "StackSummaries[?starts_with(StackName, 'HqCloud') || starts_with(StackName, 'HqWorkerRuntime')].{Name:StackName,Status:StackStatus,Updated:LastUpdatedTime}" \
  --output table 2>/dev/null || echo "No stacks found."

# --- ECS ---
echo ""
echo "--- ECS Cluster ---"
aws ecs describe-clusters --clusters hq-cloud-dev \
  --query 'clusters[0].{Name:clusterName,Status:status,RunningTasks:runningTasksCount,ActiveServices:activeServicesCount}' \
  --output table 2>/dev/null || echo "Cluster not found."

echo ""
echo "--- Running Tasks ---"
TASK_ARNS=$(aws ecs list-tasks --cluster hq-cloud-dev --query 'taskArns[]' --output text 2>/dev/null || echo "")
if [ -n "$TASK_ARNS" ] && [ "$TASK_ARNS" != "None" ]; then
  aws ecs describe-tasks --cluster hq-cloud-dev --tasks $TASK_ARNS \
    --query 'tasks[].{TaskId:taskArn,Status:lastStatus,CPU:cpu,Memory:memory,StartedAt:startedAt}' \
    --output table
else
  echo "No running tasks."
fi

# --- S3 ---
echo ""
echo "--- S3 Bucket ---"
BUCKET="hq-cloud-files-dev"
if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  SIZE=$(aws s3 ls "s3://$BUCKET" --recursive --summarize 2>/dev/null | tail -1 || echo "0")
  OBJECTS=$(aws s3api list-objects-v2 --bucket "$BUCKET" --query 'KeyCount' --output text 2>/dev/null || echo "0")
  echo "Bucket: $BUCKET"
  echo "Objects: $OBJECTS"
  echo "$SIZE"
else
  echo "Bucket '$BUCKET' not found."
fi

# --- ECR ---
echo ""
echo "--- ECR Repository ---"
aws ecr describe-repositories --repository-names hq-cloud/worker-runtime \
  --query 'repositories[0].{Name:repositoryName,URI:repositoryUri,CreatedAt:createdAt}' \
  --output table 2>/dev/null || echo "Repository not found."

IMAGES=$(aws ecr list-images --repository-name hq-cloud/worker-runtime \
  --query 'imageIds | length(@)' --output text 2>/dev/null || echo "0")
echo "Images: $IMAGES"

# --- Budget ---
echo ""
echo "--- Budget Status ---"
aws budgets describe-budgets --account-id "${AWS_ACCOUNT_ID:-804849608251}" \
  --query "Budgets[?BudgetName=='hq-cloud-monthly'].{Name:BudgetName,Limit:BudgetLimit.Amount,Actual:CalculatedSpend.ActualSpend.Amount,Forecast:CalculatedSpend.ForecastedSpend.Amount}" \
  --output table 2>/dev/null || echo "Budget not found."

# --- Cost (current month) ---
echo ""
echo "--- Current Month Cost (hq-cloud tagged) ---"
START_DATE=$(date -u +%Y-%m-01)
END_DATE=$(date -u +%Y-%m-%d)
aws ce get-cost-and-usage \
  --time-period "Start=$START_DATE,End=$END_DATE" \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --filter '{"Tags":{"Key":"project","Values":["hq-cloud"]}}' \
  --query 'ResultsByTime[0].Total.BlendedCost.{Amount:Amount,Unit:Unit}' \
  --output table 2>/dev/null || echo "Cost data not available (may take 24h after first deploy)."

# --- Tagged Resources ---
echo ""
echo "--- All project:hq-cloud Tagged Resources ---"
aws resourcegroupstaggingapi get-resources \
  --tag-filters Key=project,Values=hq-cloud \
  --query 'ResourceTagMappingList[].{ARN:ResourceARN}' \
  --output table 2>/dev/null || echo "No tagged resources found."

echo ""
echo "=== Audit Complete ==="
