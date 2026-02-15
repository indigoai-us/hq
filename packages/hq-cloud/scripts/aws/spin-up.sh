#!/usr/bin/env bash
# spin-up.sh — Ensure infra is deployed, build + push Docker image, output connection info
#
# Usage: ./spin-up.sh [--profile hq-cloud]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACCOUNT_ID="${AWS_ACCOUNT_ID:-804849608251}"
REGION="${AWS_DEFAULT_REGION:-us-east-1}"

echo "=== HQ Cloud Spin Up ==="
echo ""

# Check if stacks are deployed
echo "--- Checking infrastructure ---"
STACKS=$(aws cloudformation list-stacks \
  --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
  --query "StackSummaries[?starts_with(StackName, 'HqCloud') || starts_with(StackName, 'HqWorkerRuntime')].StackName" \
  --output text 2>/dev/null || echo "")

if [ -z "$STACKS" ] || [ "$STACKS" = "None" ]; then
  echo "Infrastructure not deployed. Running deploy..."
  bash "$SCRIPT_DIR/deploy.sh" "$@"
else
  echo "Stacks found: $STACKS"
fi

# Build and push Docker image
echo ""
echo "--- Building and pushing Docker image ---"
bash "$SCRIPT_DIR/build-and-push.sh" "$@"

# Get connection info
echo ""
echo "--- Connection Info ---"
CLUSTER_ARN=$(aws ecs describe-clusters --clusters hq-cloud-dev \
  --query 'clusters[0].clusterArn' --output text 2>/dev/null || echo "N/A")
REPO_URI=$(aws ecr describe-repositories --repository-names hq-cloud/worker-runtime \
  --query 'repositories[0].repositoryUri' --output text 2>/dev/null || echo "N/A")
BUCKET_ARN=$(aws s3api get-bucket-location --bucket hq-cloud-files-dev \
  --output text 2>/dev/null && echo "arn:aws:s3:::hq-cloud-files-dev" || echo "N/A")

echo ""
echo "ECS Cluster: $CLUSTER_ARN"
echo "ECR Repo:    $REPO_URI"
echo "S3 Bucket:   arn:aws:s3:::hq-cloud-files-dev"
echo "Region:      $REGION"
echo ""
echo "Environment variables for local dev:"
echo "  export HQ_WORKER_IMAGE_URI=$REPO_URI"
echo "  export HQ_WORKER_S3_BUCKET_ARN=arn:aws:s3:::hq-cloud-files-dev"
echo "  export AWS_REGION=$REGION"
echo ""
echo "=== Spin Up Complete ==="
