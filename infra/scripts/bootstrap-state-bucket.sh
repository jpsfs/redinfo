#!/usr/bin/env bash
# Creates the S3 bucket that holds this repo's Terraform state.
#
# Why a script and not Terraform: the bucket is where the state lives, so it
# cannot be a resource *in* that state without a chicken-and-egg problem. The
# usual answers are a second bootstrap state or a one-off out-of-band create;
# this is the latter, kept in the repo so the bucket's settings are reviewable
# rather than folklore.
#
# Run once, by someone with AWS credentials:
#   infra/scripts/bootstrap-state-bucket.sh --bucket redinfo-terraform-state --region eu-west-1
#
# Then fill in infra/terraform/backend.hcl from backend.hcl.example and:
#   terraform -chdir=infra/terraform init -backend-config=backend.hcl
#
# Safe to re-run: it creates what is missing and re-applies every setting.
set -euo pipefail

BUCKET=""
REGION="${AWS_REGION:-eu-west-1}"

while [ $# -gt 0 ]; do
  case "$1" in
    --bucket) BUCKET="${2:?--bucket needs a value}"; shift 2 ;;
    --region) REGION="${2:?--region needs a value}"; shift 2 ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

[ -n "$BUCKET" ] || { echo "error: --bucket is required" >&2; exit 2; }
command -v aws >/dev/null || { echo "error: the AWS CLI is not installed" >&2; exit 1; }

echo "==> identity"
aws sts get-caller-identity --output text --query '[Account,Arn]'

if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  echo "==> bucket s3://$BUCKET already exists, reconciling its settings"
else
  echo "==> creating s3://$BUCKET in $REGION"
  # us-east-1 is the one region where CreateBucket must NOT be given a
  # LocationConstraint — passing it there is an InvalidLocationConstraint error.
  if [ "$REGION" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION"
  else
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
      --create-bucket-configuration "LocationConstraint=$REGION"
  fi
fi

# Terraform state is a plaintext record of the whole environment, including
# any attribute a provider marks sensitive. None of the following is optional.

echo "==> blocking all public access"
aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

echo "==> enabling versioning"
# Versioning is the undo button for a corrupted or truncated state file, which
# is the failure mode that actually loses an environment.
aws s3api put-bucket-versioning --bucket "$BUCKET" \
  --versioning-configuration Status=Enabled

echo "==> enabling default encryption"
aws s3api put-bucket-encryption --bucket "$BUCKET" \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true}]}'

echo "==> requiring TLS"
aws s3api put-bucket-policy --bucket "$BUCKET" --policy "$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": ["arn:aws:s3:::${BUCKET}", "arn:aws:s3:::${BUCKET}/*"],
      "Condition": { "Bool": { "aws:SecureTransport": "false" } }
    }
  ]
}
JSON
)"

echo "==> expiring old state versions after 90 days"
# Every apply writes a new version. Without this the bucket grows forever;
# 90 days is far more history than a state file is ever rolled back through.
aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" \
  --lifecycle-configuration '{
    "Rules": [
      {
        "ID": "expire-noncurrent-state-versions",
        "Status": "Enabled",
        "Filter": { "Prefix": "" },
        "NoncurrentVersionExpiration": { "NoncurrentDays": 90 },
        "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 7 }
      }
    ]
  }'

cat <<SUMMARY

Done. s3://$BUCKET ($REGION) is ready: versioned, encrypted, private, TLS-only.

Next:
  cp infra/terraform/backend.hcl.example infra/terraform/backend.hcl
  # set bucket=$BUCKET region=$REGION
  terraform -chdir=infra/terraform init -backend-config=backend.hcl

Note there is no DynamoDB lock table: the backend uses S3-native locking
(use_lockfile = true), which needs Terraform 1.10+ and nothing else.
SUMMARY
