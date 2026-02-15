#!/usr/bin/env bash
# setup-iam.sh — Create scoped IAM role for hq-cloud deployments
#
# Creates:
# - IAM policy 'hq-cloud-deployer-policy' with least-privilege access
# - IAM role 'hq-cloud-deployer' assumable by the 'stefan' user
# - AWS CLI profile 'hq-cloud' that assumes this role
#
# Usage: ./setup-iam.sh
# Requires: aws cli configured with admin/IAM-capable credentials

set -euo pipefail

ACCOUNT_ID="${AWS_ACCOUNT_ID:-804849608251}"
REGION="${AWS_DEFAULT_REGION:-us-east-1}"
ROLE_NAME="hq-cloud-deployer"
POLICY_NAME="hq-cloud-deployer-policy"
PROFILE_NAME="hq-cloud"
USER_NAME="${AWS_IAM_USER:-stefan}"

echo "=== HQ Cloud IAM Setup ==="
echo "Account: $ACCOUNT_ID"
echo "Region:  $REGION"
echo "Role:    $ROLE_NAME"
echo "User:    $USER_NAME"
echo ""

# Check if role already exists
if aws iam get-role --role-name "$ROLE_NAME" 2>/dev/null; then
  echo "Role '$ROLE_NAME' already exists. Updating policy..."
else
  echo "Creating role '$ROLE_NAME'..."

  # Trust policy — allow stefan user to assume this role
  aws iam create-role \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document "$(cat <<TRUST
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::${ACCOUNT_ID}:user/${USER_NAME}"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
TRUST
)" \
    --tags Key=project,Value=hq-cloud Key=managed-by,Value=script \
    --description "Scoped deployer role for hq-cloud infrastructure"
fi

# Create/update the policy (compact — fits AWS 6144 char limit)
POLICY_DOC=$(cat <<'POLICY'
{"Version":"2012-10-17","Statement":[
{"Sid":"ECS","Effect":"Allow","Action":["ecs:*"],"Resource":"*"},
{"Sid":"ECRAuth","Effect":"Allow","Action":"ecr:GetAuthorizationToken","Resource":"*"},
{"Sid":"ECRRepo","Effect":"Allow","Action":"ecr:*","Resource":"arn:aws:ecr:*:${ACCOUNT_ID}:repository/hq-cloud/*"},
{"Sid":"S3","Effect":"Allow","Action":"s3:*","Resource":["arn:aws:s3:::hq-cloud-files-*","arn:aws:s3:::hq-cloud-files-*/*"]},
{"Sid":"Logs","Effect":"Allow","Action":"logs:*","Resource":"arn:aws:logs:*:${ACCOUNT_ID}:log-group:/hq/*"},
{"Sid":"CFN","Effect":"Allow","Action":"cloudformation:*","Resource":["arn:aws:cloudformation:*:${ACCOUNT_ID}:stack/HqCloud*/*","arn:aws:cloudformation:*:${ACCOUNT_ID}:stack/HqWorkerRuntime*/*"]},
{"Sid":"CFNGlobal","Effect":"Allow","Action":["cloudformation:ListStacks","cloudformation:GetTemplateSummary"],"Resource":"*"},
{"Sid":"Budget","Effect":"Allow","Action":"budgets:*","Resource":"*"},
{"Sid":"CE","Effect":"Allow","Action":["ce:GetCostAndUsage","ce:GetCostForecast"],"Resource":"*"},
{"Sid":"IAM","Effect":"Allow","Action":["iam:PassRole","iam:CreateRole","iam:DeleteRole","iam:GetRole","iam:PutRolePolicy","iam:DeleteRolePolicy","iam:GetRolePolicy","iam:AttachRolePolicy","iam:DetachRolePolicy","iam:ListRolePolicies","iam:ListAttachedRolePolicies","iam:TagRole","iam:UntagRole"],"Resource":["arn:aws:iam::${ACCOUNT_ID}:role/HqCloud*","arn:aws:iam::${ACCOUNT_ID}:role/HqWorkerRuntime*"]},
{"Sid":"EC2","Effect":"Allow","Action":["ec2:*Vpc*","ec2:*Subnet*","ec2:*SecurityGroup*","ec2:*InternetGateway*","ec2:*RouteTable*","ec2:*Route","ec2:*VpcEndpoint*","ec2:*Tags","ec2:Describe*","ec2:CreateTags","ec2:DeleteTags","ec2:AllocateAddress","ec2:ReleaseAddress","ec2:ModifySubnetAttribute"],"Resource":"*"},
{"Sid":"CDK","Effect":"Allow","Action":"sts:AssumeRole","Resource":"arn:aws:iam::${ACCOUNT_ID}:role/cdk-*"},
{"Sid":"CDKBoot","Effect":"Allow","Action":"ssm:GetParameter","Resource":"arn:aws:ssm:*:${ACCOUNT_ID}:parameter/cdk-bootstrap/*"},
{"Sid":"CDKStaging","Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:ListBucket","s3:GetBucketLocation"],"Resource":["arn:aws:s3:::cdk-*","arn:aws:s3:::cdk-*/*"]},
{"Sid":"Lambda","Effect":"Allow","Action":"lambda:*","Resource":"arn:aws:lambda:*:${ACCOUNT_ID}:function:HqCloud*"},
{"Sid":"Tags","Effect":"Allow","Action":"tag:*","Resource":"*"}
]}
POLICY
)

# Replace ${ACCOUNT_ID} in policy document
POLICY_DOC=$(echo "$POLICY_DOC" | sed "s/\${ACCOUNT_ID}/$ACCOUNT_ID/g")

# Check if policy exists
POLICY_ARN="arn:aws:iam::${ACCOUNT_ID}:policy/${POLICY_NAME}"
if aws iam get-policy --policy-arn "$POLICY_ARN" 2>/dev/null; then
  echo "Updating existing policy..."
  # Delete old versions if at limit (max 5)
  OLD_VERSIONS=$(aws iam list-policy-versions --policy-arn "$POLICY_ARN" \
    --query 'Versions[?IsDefaultVersion==`false`].VersionId' --output text)
  for v in $OLD_VERSIONS; do
    aws iam delete-policy-version --policy-arn "$POLICY_ARN" --version-id "$v" 2>/dev/null || true
  done
  aws iam create-policy-version \
    --policy-arn "$POLICY_ARN" \
    --policy-document "$POLICY_DOC" \
    --set-as-default
else
  echo "Creating policy '$POLICY_NAME'..."
  aws iam create-policy \
    --policy-name "$POLICY_NAME" \
    --policy-document "$POLICY_DOC" \
    --description "Scoped permissions for hq-cloud infrastructure deployment" \
    --tags Key=project,Value=hq-cloud Key=managed-by,Value=script
fi

# Attach policy to role
echo "Attaching policy to role..."
aws iam attach-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-arn "$POLICY_ARN"

# Configure AWS CLI profile
echo ""
echo "Configuring AWS CLI profile '$PROFILE_NAME'..."
aws configure set profile.${PROFILE_NAME}.role_arn "arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"
aws configure set profile.${PROFILE_NAME}.source_profile default
aws configure set profile.${PROFILE_NAME}.region "$REGION"

echo ""
echo "=== Setup Complete ==="
echo ""
echo "To use: export AWS_PROFILE=$PROFILE_NAME"
echo "Test:   aws sts get-caller-identity --profile $PROFILE_NAME"
echo ""
