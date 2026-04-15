#!/usr/bin/env bash
# Test Langfuse EKS deployment end-to-end.
#
# This script:
#   1. Reads the Langfuse host from Terraform output (or --host flag)
#   2. Updates kubeconfig for the EKS cluster
#   3. Waits for the web pod to be ready
#   4. Seeds a project and API keys via Prisma in the web pod
#   5. Runs the standard test-langfuse.py test suite
#
# Usage:
#   ./scripts/test-langfuse-eks.sh                          # auto-detect from terraform output
#   ./scripts/test-langfuse-eks.sh --host http://ALB_DNS    # explicit host
#   ./scripts/test-langfuse-eks.sh --region us-west-2       # override region

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAMESPACE="langfuse"

# Defaults
HOST=""
REGION=""
CLUSTER_NAME=""
SKIP_SEED=false
TF_DIR=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --host) HOST="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    --cluster) CLUSTER_NAME="$2"; shift 2 ;;
    --tf-dir) TF_DIR="$2"; shift 2 ;;
    --skip-seed) SKIP_SEED=true; shift ;;
    -h|--help)
      echo "Usage: $0 [--host URL] [--region REGION] [--cluster NAME] [--tf-dir DIR] [--skip-seed]"
      echo ""
      echo "Options:"
      echo "  --host URL       Langfuse ALB URL (auto-detected from terraform output if omitted)"
      echo "  --region REGION  AWS region (auto-detected from terraform output if omitted)"
      echo "  --cluster NAME   EKS cluster name (default: langfuse)"
      echo "  --tf-dir DIR     Terraform directory to read outputs from (auto-detected if omitted)"
      echo "  --skip-seed      Skip API key seeding (use if keys already exist)"
      echo ""
      echo "Works with both terraform_eks/ and terraform_eks_pods/ patterns."
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Auto-detect Terraform directory if not specified
if [[ -z "$TF_DIR" ]]; then
  # Prefer whichever directory has a terraform.tfstate file (i.e., an active deployment)
  EKS_DIR="$SCRIPT_DIR/../iac/terraform_eks"
  EKS_PODS_DIR="$SCRIPT_DIR/../iac/terraform_eks_pods"

  if [[ -f "$EKS_PODS_DIR/terraform.tfstate" ]] && grep -q '"resources"' "$EKS_PODS_DIR/terraform.tfstate" 2>/dev/null; then
    TF_DIR="$EKS_PODS_DIR"
  elif [[ -f "$EKS_DIR/terraform.tfstate" ]] && grep -q '"resources"' "$EKS_DIR/terraform.tfstate" 2>/dev/null; then
    TF_DIR="$EKS_DIR"
  else
    TF_DIR="$EKS_DIR"  # default fallback
  fi
fi

# --- Helpers ---

log()  { echo -e "\033[1;34m==>\033[0m $*"; }
ok()   { echo -e "\033[1;32m  OK\033[0m $*"; }
fail() { echo -e "\033[1;31mFAIL\033[0m $*"; exit 1; }

# --- Step 1: Resolve host and cluster from Terraform output ---

if [[ -z "$HOST" ]] || [[ -z "$REGION" ]] || [[ -z "$CLUSTER_NAME" ]]; then
  log "Reading Terraform outputs from $TF_DIR"
  pushd "$TF_DIR" > /dev/null

  if [[ -z "$HOST" ]]; then
    HOST=$(terraform output -raw langfuse_host 2>/dev/null) || fail "Cannot read langfuse_host from terraform output"
  fi
  if [[ -z "$CLUSTER_NAME" ]]; then
    CLUSTER_NAME=$(terraform output -raw cluster_name 2>/dev/null) || CLUSTER_NAME="langfuse"
  fi
  if [[ -z "$REGION" ]]; then
    REGION=$(terraform output -raw cluster_host 2>/dev/null | sed 's|.*\.\(.*\)\.eks\.amazonaws\.com.*|\1|') || REGION="us-east-1"
  fi

  popd > /dev/null
fi

HOST="${HOST%/}"  # strip trailing slash
log "Host:    $HOST"
log "Cluster: $CLUSTER_NAME"
log "Region:  $REGION"

# --- Step 2: Update kubeconfig ---

log "Updating kubeconfig for EKS cluster $CLUSTER_NAME"
aws eks update-kubeconfig --name "$CLUSTER_NAME" --region "$REGION" > /dev/null 2>&1
ok "kubeconfig updated"

# --- Step 3: Wait for web pod to be ready ---

log "Waiting for Langfuse web pod to be ready"
for i in $(seq 1 60); do
  READY=$(kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/name=langfuse,app.kubernetes.io/component=web -o jsonpath='{.items[0].status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || true)
  if [[ "$READY" == "True" ]]; then
    break
  fi
  # Fallback: check by pod name pattern
  POD=$(kubectl get pods -n "$NAMESPACE" --no-headers 2>/dev/null | grep "langfuse-web" | grep "Running" | head -1 | awk '{print $1}')
  if [[ -n "$POD" ]]; then
    READY_COUNT=$(kubectl get pod "$POD" -n "$NAMESPACE" -o jsonpath='{.status.containerStatuses[0].ready}' 2>/dev/null || true)
    if [[ "$READY_COUNT" == "true" ]]; then
      break
    fi
  fi
  if [[ $i -eq 60 ]]; then
    fail "Langfuse web pod not ready after 5 minutes"
  fi
  sleep 5
done

WEB_POD=$(kubectl get pods -n "$NAMESPACE" --no-headers 2>/dev/null | grep "langfuse-web" | grep "Running" | head -1 | awk '{print $1}')
ok "Web pod ready: $WEB_POD"

# --- Step 4: Wait for health endpoint ---

log "Waiting for Langfuse health endpoint"
for i in $(seq 1 36); do
  STATUS=$(curl -sf "$HOST/api/public/health" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || true)
  if [[ "$STATUS" == "OK" ]]; then
    VERSION=$(curl -sf "$HOST/api/public/health" | python3 -c "import sys,json; print(json.load(sys.stdin).get('version','unknown'))" 2>/dev/null)
    ok "Langfuse $VERSION is healthy"
    break
  fi
  if [[ $i -eq 36 ]]; then
    fail "Health endpoint not responding after 3 minutes"
  fi
  sleep 5
done

# --- Step 5: Seed project and API keys ---

if [[ "$SKIP_SEED" == "true" ]]; then
  log "Skipping seed (--skip-seed)"
  echo ""
  echo "Provide keys manually:"
  echo "  $SCRIPT_DIR/test-langfuse.py --host $HOST --public-key PK --secret-key SK"
  exit 0
fi

log "Seeding project and API keys via web pod"

# Create a signup user first (idempotent — returns 200 if already exists)
curl -sf -X POST "$HOST/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{"name":"test-admin","email":"test@langfuse.local","password":"Password123!"}' > /dev/null 2>&1 || true

SEED_OUTPUT=$(kubectl exec -n "$NAMESPACE" "$WEB_POD" -- sh -c '
# Build DATABASE_URL — handle hosts with or without port, and with or without SSL
DB_HOST_PORT="${DATABASE_HOST}"
case "$DB_HOST_PORT" in
  *:*) ;; # already has port
  *)   DB_HOST_PORT="${DB_HOST_PORT}:5432" ;;
esac
# Use sslmode=require for RDS endpoints, disable for in-cluster postgres
case "$DATABASE_HOST" in
  *.rds.amazonaws.com*) SSL_MODE="?sslmode=require" ;;
  *)                    SSL_MODE="" ;;
esac
export DATABASE_URL="postgresql://${DATABASE_USERNAME}:${DATABASE_PASSWORD}@${DB_HOST_PORT}/${DATABASE_NAME}${SSL_MODE}"
node -e "
const { PrismaClient } = require(\"@prisma/client\");
const crypto = require(\"crypto\");

async function main() {
  const prisma = new PrismaClient();

  // Upsert org
  const org = await prisma.organization.upsert({
    where: { id: \"seed-org-id\" },
    update: {},
    create: { id: \"seed-org-id\", name: \"Default Org\" }
  });

  // Upsert project
  const project = await prisma.project.upsert({
    where: { id: \"seed-project-id\" },
    update: {},
    create: { id: \"seed-project-id\", name: \"default\", orgId: \"seed-org-id\" }
  });

  // Link user if exists
  const user = await prisma.user.findFirst({ where: { email: \"test@langfuse.local\" } });
  if (user) {
    await prisma.organizationMembership.upsert({
      where: { id: \"seed-mem-id\" },
      update: {},
      create: { id: \"seed-mem-id\", orgId: \"seed-org-id\", userId: user.id, role: \"OWNER\" }
    });
  }

  // Generate API keys
  const pk = \"pk-lf-\" + crypto.randomBytes(16).toString(\"hex\");
  const sk = \"sk-lf-\" + crypto.randomBytes(16).toString(\"hex\");

  // Hash using Langfuse createShaHash: sha256(key).update(sha256(salt)).digest(hex)
  const salt = process.env.SALT;
  const saltHash = crypto.createHash(\"sha256\").update(salt, \"utf8\").digest(\"hex\");
  const fastHash = crypto.createHash(\"sha256\").update(sk).update(saltHash).digest(\"hex\");

  // Delete any previous seeded key
  await prisma.apiKey.deleteMany({ where: { note: \"Seeded by test script\" } });

  // Create key
  await prisma.apiKey.create({
    data: {
      publicKey: pk,
      hashedSecretKey: fastHash,
      fastHashedSecretKey: fastHash,
      displaySecretKey: sk.substring(0, 8) + \"...\" + sk.slice(-4),
      note: \"Seeded by test script\",
      projectId: \"seed-project-id\"
    }
  });

  // Output as parseable format
  console.log(\"PUBLIC_KEY=\" + pk);
  console.log(\"SECRET_KEY=\" + sk);

  await prisma.\$disconnect();
}
main().catch(e => { console.error(e.message); process.exit(1); });
"' 2>&1)

PUBLIC_KEY=$(echo "$SEED_OUTPUT" | grep "^PUBLIC_KEY=" | cut -d= -f2)
SECRET_KEY=$(echo "$SEED_OUTPUT" | grep "^SECRET_KEY=" | cut -d= -f2)

if [[ -z "$PUBLIC_KEY" ]] || [[ -z "$SECRET_KEY" ]]; then
  echo "$SEED_OUTPUT"
  fail "Failed to seed API keys"
fi

ok "API keys seeded"
echo "    Public key:  $PUBLIC_KEY"
echo "    Secret key:  ${SECRET_KEY:0:8}...${SECRET_KEY: -4}"

# --- Step 6: Run test suite ---

log "Running test suite"
echo ""
python3 "$SCRIPT_DIR/test-langfuse.py" \
  --host "$HOST" \
  --public-key "$PUBLIC_KEY" \
  --secret-key "$SECRET_KEY"
