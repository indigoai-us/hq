#!/usr/bin/env bash
# build-and-push.sh — ECR login, Docker build, tag with git SHA, push
#
# NOTE: This script requires Docker locally. For CI/CD environments,
# use GitHub Actions or AWS CodeBuild instead. See the project's
# CI/CD pipeline configuration for cloud-based image builds.
#
# Usage: ./build-and-push.sh [--profile hq-cloud]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKER_RUNTIME_DIR="$SCRIPT_DIR/../../worker-runtime"
ACCOUNT_ID="${AWS_ACCOUNT_ID:-804849608251}"
REGION="${AWS_DEFAULT_REGION:-us-east-1}"
REPO_NAME="hq-cloud/worker-runtime"
REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
IMAGE="${REGISTRY}/${REPO_NAME}"

echo "=== Build and Push Docker Image ==="
echo "Registry: $REGISTRY"
echo "Repository: $REPO_NAME"
echo ""

# Get git SHA for tagging
GIT_SHA=$(git -C "$WORKER_RUNTIME_DIR" rev-parse --short HEAD 2>/dev/null || echo "unknown")
TIMESTAMP=$(date -u +%Y%m%d%H%M%S)
TAG="${GIT_SHA}-${TIMESTAMP}"

echo "Tag: $TAG"
echo ""

# ECR login
echo "--- ECR Login ---"
aws ecr get-login-password --region "$REGION" | \
  docker login --username AWS --password-stdin "$REGISTRY"

# Build
echo ""
echo "--- Docker Build ---"
docker build -t "${IMAGE}:${TAG}" -t "${IMAGE}:latest" "$WORKER_RUNTIME_DIR"

# Push both tags
echo ""
echo "--- Docker Push ---"
docker push "${IMAGE}:${TAG}"
docker push "${IMAGE}:latest"

echo ""
echo "=== Push Complete ==="
echo "Image: ${IMAGE}:${TAG}"
echo "Image: ${IMAGE}:latest"
