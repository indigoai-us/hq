#!/usr/bin/env bash
# aws-helper.sh — AWS CLI wrapper with ergonomic defaults
# Usage: aws-helper.sh <subcommand> [options]
set -euo pipefail

COMPANY=""
AWS_PROFILE_ARG=()
AWS_REGION_ARG=()

usage() {
  cat <<EOF
Usage: $(basename "$0") [options] <subcommand> [args]

AWS CLI wrapper with ergonomic defaults and formatted output.

Options:
  -c, --company SLUG     Company slug (loads AWS_PROFILE/AWS_REGION from env)
  --profile PROFILE      AWS profile to use
  --region REGION        AWS region to use
  -h, --help             Show this help

Subcommands:
  s3 ls [path]           List S3 buckets or bucket contents
  s3 cp <src> <dst>      Copy files to/from S3
  s3 cat <s3-path>       Print S3 object contents
  lambda invoke <name>   Invoke a Lambda function
  lambda list            List Lambda functions
  logs tail <group>      Tail CloudWatch log group
  logs groups            List log groups
  sts whoami             Show current AWS identity

Examples:
  $(basename "$0") s3 ls
  $(basename "$0") s3 ls s3://my-bucket/prefix/
  $(basename "$0") lambda invoke my-function
  $(basename "$0") logs tail /aws/lambda/my-function
  $(basename "$0") sts whoami
  $(basename "$0") --profile prod --region us-east-1 s3 ls
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -c|--company)   COMPANY="$2"; shift 2 ;;
    --profile)      AWS_PROFILE_ARG=(--profile "$2"); shift 2 ;;
    --region)       AWS_REGION_ARG=(--region "$2"); shift 2 ;;
    -h|--help)      usage ;;
    --)             shift; break ;;
    -*)             echo "Unknown option: $1" >&2; exit 1 ;;
    *)              break ;;
  esac
done

AWS_COMMON=("${AWS_PROFILE_ARG[@]:-}" "${AWS_REGION_ARG[@]:-}")

SUBCOMMAND="${1:-}"
if [[ -z "$SUBCOMMAND" ]]; then
  echo "Error: subcommand is required." >&2
  echo "Run '$(basename "$0") --help' for usage." >&2
  exit 1
fi
shift

case "$SUBCOMMAND" in
  s3)
    ACTION="${1:-ls}"
    shift || true
    case "$ACTION" in
      ls)   aws "${AWS_COMMON[@]}" s3 ls "$@" ;;
      cp)   aws "${AWS_COMMON[@]}" s3 cp "$@" ;;
      cat)
        S3PATH="${1:-}"
        if [[ -z "$S3PATH" ]]; then
          echo "Error: s3 cat requires an S3 path." >&2
          exit 1
        fi
        aws "${AWS_COMMON[@]}" s3 cp "$S3PATH" -
        ;;
      *)
        echo "Error: unknown s3 action '$ACTION'." >&2
        exit 1
        ;;
    esac
    ;;
  lambda)
    ACTION="${1:-list}"
    shift || true
    case "$ACTION" in
      list)
        aws "${AWS_COMMON[@]}" lambda list-functions \
          --query 'Functions[*].[FunctionName,Runtime,LastModified]' \
          --output table
        ;;
      invoke)
        FUNCTION="${1:-}"
        if [[ -z "$FUNCTION" ]]; then
          echo "Error: lambda invoke requires a function name." >&2
          exit 1
        fi
        shift
        PAYLOAD="${1:-{}}"
        aws "${AWS_COMMON[@]}" lambda invoke \
          --function-name "$FUNCTION" \
          --payload "$PAYLOAD" \
          --cli-binary-format raw-in-base64-out \
          /dev/stdout
        ;;
      *)
        echo "Error: unknown lambda action '$ACTION'." >&2
        exit 1
        ;;
    esac
    ;;
  logs)
    ACTION="${1:-groups}"
    shift || true
    case "$ACTION" in
      groups)
        aws "${AWS_COMMON[@]}" logs describe-log-groups \
          --query 'logGroups[*].logGroupName' \
          --output table
        ;;
      tail)
        GROUP="${1:-}"
        if [[ -z "$GROUP" ]]; then
          echo "Error: logs tail requires a log group name." >&2
          exit 1
        fi
        aws "${AWS_COMMON[@]}" logs tail "$GROUP" --follow
        ;;
      *)
        echo "Error: unknown logs action '$ACTION'." >&2
        exit 1
        ;;
    esac
    ;;
  sts)
    ACTION="${1:-whoami}"
    shift || true
    case "$ACTION" in
      whoami)
        aws "${AWS_COMMON[@]}" sts get-caller-identity
        ;;
      *)
        echo "Error: unknown sts action '$ACTION'." >&2
        exit 1
        ;;
    esac
    ;;
  *)
    echo "Error: unknown subcommand '$SUBCOMMAND'." >&2
    echo "Run '$(basename "$0") --help' for usage." >&2
    exit 1
    ;;
esac
