#!/bin/bash
# =============================================================================
# acm.sh -- Optional custom-domain wire-up. Run AFTER deploy-full.sh AND
# after the parent zone (example.com) has been delegated to the four
# name servers deploy-full.sh's Step 1b printed.
#
# Two terraform applies:
#   A. bootstrap/acm  -> creates the 2 ACM certs (apex us-east-1, api. region)
#                        and writes their DNS-01 validation CNAMEs into the
#                        hosted zone; blocks until both certs reach ISSUED.
#   B. CP re-apply    -> layers hosted_zone_id + domain_name + both cert
#                        ARNs on top of the base tfvars so CloudFront and
#                        API Gateway pick up their custom domains and the
#                        apex/api alias records get written.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

# Load HOSTED_ZONE_DOMAIN + API_PREFIX from repo-root .env if not already
# exported. Users customize the DNS name there; see .env.example for the
# canonical location.
if [ -z "${HOSTED_ZONE_DOMAIN:-}" ] && [ -f "$REPO_ROOT/.env" ]; then
    HOSTED_ZONE_DOMAIN=$(grep -E '^HOSTED_ZONE_DOMAIN=' "$REPO_ROOT/.env" | tail -n1 | cut -d= -f2-)
fi
if [ -z "${API_PREFIX:-}" ] && [ -f "$REPO_ROOT/.env" ]; then
    API_PREFIX=$(grep -E '^API_PREFIX=' "$REPO_ROOT/.env" | tail -n1 | cut -d= -f2-)
fi

AWS_REGION="${AWS_REGION:-$(aws configure get region 2>/dev/null || echo us-east-1)}"
HOSTED_ZONE_DOMAIN="${HOSTED_ZONE_DOMAIN:?HOSTED_ZONE_DOMAIN not set. Add it to .env or export it before running acm.sh.}"
API_PREFIX="${API_PREFIX:-api}"

# Read zone_id from bootstrap/hosted_zone state
HZ_ID=$(cd "$INFRA_DIR/bootstrap/hosted_zone" && terraform output -raw zone_id)
echo "Zone: $HOSTED_ZONE_DOMAIN ($HZ_ID)"

# [A] Certs + validation CNAMEs
echo "[A] bootstrap/acm terraform"
cd "$INFRA_DIR/bootstrap/acm"
terraform init -input=false
terraform apply -auto-approve \
    -var "aws_region=$AWS_REGION" \
    -var "domain_name=$HOSTED_ZONE_DOMAIN" \
    -var "api_prefix=$API_PREFIX" \
    -var "hosted_zone_id=$HZ_ID"
CLOUDFRONT_ACM_CERTIFICATE_ARN=$(terraform output -raw cloudfront_acm_certificate_arn)
API_ACM_CERTIFICATE_ARN=$(terraform output -raw api_acm_certificate_arn)

# [B] CP re-apply -- attach certs, create alias records
# The CP's sample_datalake module needs an IAM role ARN for its Lake Formation
# permission (empty string fails validation). deploy-full.sh derives this
# from the caller identity into TF_VAR_lf_admin_role_arn; replicate that here
# so the second apply doesn't fail on module.sample_datalake.
CALLER_ARN=$(aws sts get-caller-identity --query Arn --output text)
LF_ADMIN_ROLE_ARN=$(echo "$CALLER_ARN" | sed 's|arn:aws:sts::\([0-9]*\):assumed-role/\([^/]*\)/.*|arn:aws:iam::\1:role/\2|')
# Resolve the path-qualified ARN (IAM Identity Center roles sit under
# /aws-reserved/sso.amazonaws.com/ and Lake Formation rejects path-less ARNs).
LF_ROLE_NAME=$(echo "$LF_ADMIN_ROLE_ARN" | sed 's|.*:role/||')
LF_RESOLVED_ARN=$(aws iam get-role --role-name "$LF_ROLE_NAME" --query 'Role.Arn' --output text 2>/dev/null || echo "")
if [ -n "$LF_RESOLVED_ARN" ] && [ "$LF_RESOLVED_ARN" != "None" ]; then
    LF_ADMIN_ROLE_ARN="$LF_RESOLVED_ARN"
fi
export TF_VAR_lf_admin_role_arn="$LF_ADMIN_ROLE_ARN"

echo "[B] CP terraform re-apply"
cd "$INFRA_DIR"
OVERLAY=/tmp/acm-overlay.$$.auto.tfvars
trap 'rm -f "$OVERLAY"' EXIT
cat > "$OVERLAY" <<TFVARS
hosted_zone_id                 = "$HZ_ID"
domain_name                    = "$HOSTED_ZONE_DOMAIN"
api_prefix                     = "$API_PREFIX"
cloudfront_acm_certificate_arn = "$CLOUDFRONT_ACM_CERTIFICATE_ARN"
api_acm_certificate_arn        = "$API_ACM_CERTIFICATE_ARN"
TFVARS
terraform apply -auto-approve -var-file="$OVERLAY"

echo
echo "Custom domain live:"
echo "  Frontend: $(terraform output -raw frontend_url)"
echo "  API:      $(terraform output -raw api_endpoint)"
