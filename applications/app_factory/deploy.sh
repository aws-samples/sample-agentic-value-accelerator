#!/bin/bash
set -e

# App Factory Deploy Script
# Phase 1: Generate use case code with builder.py (Claude Agent SDK)
# Phase 2: Deploy the generated use case via Terraform (same as other foundry deployments)

echo "========================================"
echo "App Factory: Generate + Deploy"
echo "========================================"
echo "Submission ID: $SUBMISSION_ID"
echo "Use Case ID:   $USE_CASE_ID"
echo "Framework:     $FRAMEWORK"
echo "Region:        $AWS_TARGET_REGION"
echo ""

# ============================================================
# Phase 1: Code Generation
# ============================================================
echo "=== Phase 1: Code Generation ==="

# Install Claude Code CLI + Agent SDK
echo "Installing Claude Code CLI..."
if ! command -v claude &>/dev/null; then
  npm install -g @anthropic-ai/claude-code 2>&1 || { echo "ERROR: Failed to install Claude Code CLI"; exit 1; }
fi
echo "Claude Code CLI: $(claude --version 2>/dev/null || echo 'installed')"

echo "Installing Claude Agent SDK..."
pip install claude-agent-sdk 2>&1 || { echo "ERROR: Failed to install claude-agent-sdk"; exit 1; }

# Libs the data-builder subagent uses to generate PDF/image sample documents
echo "Installing PDF + image generation libs for data-builder..."
pip install reportlab Pillow 2>&1 | tail -3 || echo "WARNING: reportlab/Pillow install failed — document generation may be degraded"

# Registry publish uses AgentCore Control Plane APIs (preview) that require
# a recent boto3. CodeBuild image may ship an older version.
echo "Upgrading boto3 for AgentCore registry support..."
pip install --upgrade 'boto3>=1.42.90' 2>&1 | tail -2 || echo "WARNING: boto3 upgrade failed"

# Set up environment for Bedrock routing
export CLAUDE_CODE_USE_BEDROCK=1
export ANTHROPIC_MODEL="${ANTHROPIC_MODEL:-us.anthropic.claude-sonnet-4-6}"

# The workspace has the app_factory/ directory with builder.py and ui-template/
# It also has the full FSI Foundry source structure for the builder to work with

# Reconstruct a working directory structure the builder expects
# builder.py expects REPO_ROOT to contain applications/fsi_foundry/
WORK_DIR=/tmp/app_factory_workspace
mkdir -p "$WORK_DIR/applications/app_factory"
mkdir -p "$WORK_DIR/applications/fsi_foundry/foundations/src"
mkdir -p "$WORK_DIR/applications/fsi_foundry/foundations/docker"
mkdir -p "$WORK_DIR/applications/fsi_foundry/foundations/iac/agentcore"
mkdir -p "$WORK_DIR/applications/fsi_foundry/use_cases"
mkdir -p "$WORK_DIR/applications/fsi_foundry/data"
mkdir -p "$WORK_DIR/applications/fsi_foundry/ui"

# Copy from workspace into the expected structure
cp -r /tmp/workspace/app_factory/* "$WORK_DIR/applications/app_factory/" 2>/dev/null || true
cp -r /tmp/workspace/app_src/* "$WORK_DIR/applications/fsi_foundry/foundations/src/" 2>/dev/null || true
cp -r /tmp/workspace/docker/* "$WORK_DIR/applications/fsi_foundry/foundations/docker/" 2>/dev/null || true
cp -r /tmp/workspace/use_cases/* "$WORK_DIR/applications/fsi_foundry/use_cases/" 2>/dev/null || true
cp -r /tmp/workspace/data/* "$WORK_DIR/applications/fsi_foundry/data/" 2>/dev/null || true

# Copy IaC structure for deployment phase
cp -r /tmp/workspace/iac/* "$WORK_DIR/applications/fsi_foundry/foundations/iac/agentcore/" || { echo "ERROR: Failed to copy IaC"; exit 1; }
cp -r /tmp/workspace/shared "$WORK_DIR/applications/fsi_foundry/foundations/iac/shared" 2>/dev/null || true

echo "Running builder.py..."
# builder.py is now a package (app_factory/); run as module so relative
# imports resolve. cwd must be the parent directory so Python finds the
# `app_factory` package on sys.path.
cd "$WORK_DIR/applications"
python3 -m app_factory.builder \
  --submission-id "$SUBMISSION_ID" \
  --region "$AWS_TARGET_REGION" \
  2>&1 || { echo "ERROR: Code generation failed"; exit 1; }

echo "Code generation complete."
echo ""

# ============================================================
# Phase 1.5: Package generated source for download
# ============================================================
# Zip the full generated workspace (use case code, UI, data, IaC, docker,
# foundations source) and upload to the deployment's S3 bucket so the UI
# can offer a download link once the deploy succeeds.
if [ -n "$ARCHIVE_BUCKET" ] && [ -n "$DEPLOYMENT_ID" ]; then
  echo "=== Phase 1.5: Packaging generated source ==="
  SOURCE_ZIP="/tmp/generated-source.zip"
  SOURCE_KEY="deployments/${DEPLOYMENT_ID}/generated-source.zip"

  (
    cd "$WORK_DIR"
    # Include only the generated artifacts for this use case:
    #   - generated agent code (use_cases/<id>)
    #   - generated UI customization (ui/<id>)
    #   - generated sample data (data/samples/<id>) if present
    #   - IaC required to deploy the above (foundations/iac)
    # Exclude the builder (app_factory/), foundations source/docker, reference
    # use cases, caches, and terraform state.
    PATHS=(
      "applications/fsi_foundry/use_cases/$USE_CASE_ID"
      "applications/fsi_foundry/ui/$USE_CASE_ID"
      "applications/fsi_foundry/foundations/iac"
    )
    if [ -d "applications/fsi_foundry/data/samples/$USE_CASE_ID" ]; then
      PATHS+=("applications/fsi_foundry/data/samples/$USE_CASE_ID")
    fi
    zip -qr "$SOURCE_ZIP" "${PATHS[@]}" \
      -x '*/.terraform/*' \
      -x '*/terraform.tfstate*' \
      -x '*/node_modules/*' \
      -x '*/__pycache__/*' \
      -x '*/dist/*' \
      -x '*/.terraform.lock.hcl'
  ) && aws s3 cp "$SOURCE_ZIP" "s3://$ARCHIVE_BUCKET/$SOURCE_KEY" \
        --region "$AWS_TARGET_REGION" \
        --content-type application/zip \
    && echo "Packaged generated source to s3://$ARCHIVE_BUCKET/$SOURCE_KEY" \
    || echo "WARNING: Failed to package generated source (continuing)"

  echo '{"source_zip_key":"'$SOURCE_KEY'","source_zip_bucket":"'$ARCHIVE_BUCKET'"}' \
    > /tmp/source_outputs.json
else
  echo '{}' > /tmp/source_outputs.json
fi
echo ""

# ============================================================
# Phase 1.6: Capture the generated About-the-use-case markdown
# ============================================================
# docs-builder (subagent) writes a 300-500 word markdown file that the
# control plane DeploymentDetail page renders in an "About this deployment"
# card. Failure here is non-fatal — the UI handles a missing field.
DOCS_MD="$WORK_DIR/applications/fsi_foundry/use_cases/$USE_CASE_ID/docs/use-case.md"
if [ -f "$DOCS_MD" ]; then
  python3 - <<PYEOF > /tmp/docs_outputs.json
import json, pathlib
content = pathlib.Path("$DOCS_MD").read_text()
print(json.dumps({"about_markdown": {"value": content}}))
PYEOF
  echo "Captured About doc ($(wc -c < "$DOCS_MD") bytes)"
else
  echo "No docs/use-case.md generated — skipping About capture"
  echo '{}' > /tmp/docs_outputs.json
fi
echo ""

# ============================================================
# Phase 2: Terraform Deployment (mirrors existing foundry flow)
# ============================================================
echo "=== Phase 2: Terraform Deployment ==="

FSI_ROOT="$WORK_DIR/applications/fsi_foundry"
IAC_DIR="$FSI_ROOT/foundations/iac/agentcore"

if [ ! -d "$IAC_DIR/infra" ] || [ ! -d "$IAC_DIR/runtime" ]; then
  echo "ERROR: IaC directory structure not found at $IAC_DIR"
  ls -la "$IAC_DIR" 2>/dev/null || echo "(directory does not exist)"
  exit 1
fi

# --- Stage 2a: Infrastructure ---
echo "=== Stage 2a: Infrastructure ==="
cd "$IAC_DIR/infra"

if ! grep -rq 'backend "s3"' *.tf 2>/dev/null; then
  printf 'terraform {\n  backend "s3" {}\n}\n' > backend_override.tf
fi

# Only keep this use case's sample data (remove others to prevent fileset conflicts)
if [ -d "$FSI_ROOT/data/samples" ]; then
  for d in "$FSI_ROOT/data/samples"/*/; do
    dir_name=$(basename "$d")
    if [ "$dir_name" != "$USE_CASE_ID" ]; then
      rm -rf "$d"
    fi
  done
fi

cat > deploy.auto.tfvars << TFVARS
aws_region    = "$AWS_TARGET_REGION"
use_case_id   = "$USE_CASE_ID"
use_case_name = "$USE_CASE_ID"
framework     = "${FRAMEWORK:-strands}"
data_path     = "$FSI_ROOT/data/samples"
TFVARS

terraform init -input=false \
  -backend-config="bucket=$STATE_BUCKET" \
  -backend-config="key=foundry/${USE_CASE_ID}/${FRAMEWORK}/infra/terraform.tfstate" \
  -backend-config="region=$AWS_TARGET_REGION" \
  -backend-config="dynamodb_table=$LOCK_TABLE"

terraform plan -input=false -out=tfplan
terraform apply -input=false -auto-approve tfplan
terraform output -json > /tmp/infra_outputs.json 2>/dev/null || echo '{}' > /tmp/infra_outputs.json

# Download infra state for runtime's terraform_remote_state
aws s3 cp "s3://$STATE_BUCKET/foundry/${USE_CASE_ID}/${FRAMEWORK}/infra/terraform.tfstate" \
  "$IAC_DIR/infra/terraform.tfstate"

# --- Stage 2b: Docker Build + Push ---
ECR_REPO=$(terraform output -raw agentcore_ecr_repository 2>/dev/null | grep -E '^[0-9]+\.dkr\.ecr\.' || true)
if [ -n "$ECR_REPO" ] && [ -f /tmp/workspace/docker/Dockerfile.agentcore ]; then
  echo "=== Stage 2b: Docker Build + Push ==="
  ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
  aws ecr get-login-password --region $AWS_TARGET_REGION | docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${AWS_TARGET_REGION}.amazonaws.com

  # Copy generated use case back to the original zip structure for Docker context
  # Dockerfile.agentcore expects app_src/ and use_cases/ at context root
  cp -r "$WORK_DIR/applications/fsi_foundry/use_cases/$USE_CASE_ID" "/tmp/workspace/use_cases/$USE_CASE_ID" 2>/dev/null || true

  IMAGE_TAG="${FRAMEWORK}-latest"
  docker build \
    --build-arg USE_CASE_ID="$USE_CASE_ID" \
    --build-arg FRAMEWORK="$FRAMEWORK" \
    -t "${ECR_REPO}:${IMAGE_TAG}" \
    -f /tmp/workspace/docker/Dockerfile.agentcore \
    /tmp/workspace || { echo "ERROR: Docker build failed"; exit 1; }
  docker push "${ECR_REPO}:${IMAGE_TAG}" || { echo "ERROR: Docker push failed"; exit 1; }
  echo "Image pushed: ${ECR_REPO}:${IMAGE_TAG}"
fi

# --- Stage 2c: Runtime ---
echo "=== Stage 2c: Runtime ==="
cd "$IAC_DIR/runtime"

if ! grep -rq 'backend "s3"' *.tf 2>/dev/null; then
  printf 'terraform {\n  backend "s3" {}\n}\n' > backend_override.tf
fi

cat > deploy.auto.tfvars << TFVARS
aws_region         = "$AWS_TARGET_REGION"
use_case_id        = "$USE_CASE_ID"
use_case_name      = "$USE_CASE_ID"
framework          = "${FRAMEWORK:-strands}"
image_tag          = "${FRAMEWORK:-strands}-latest"
bedrock_model_id   = "${ANTHROPIC_MODEL}"
TFVARS

terraform init -input=false \
  -backend-config="bucket=$STATE_BUCKET" \
  -backend-config="key=foundry/${USE_CASE_ID}/${FRAMEWORK}/runtime/terraform.tfstate" \
  -backend-config="region=$AWS_TARGET_REGION" \
  -backend-config="dynamodb_table=$LOCK_TABLE"

terraform plan -input=false -out=tfplan
terraform apply -input=false -auto-approve tfplan || { echo "ERROR: Runtime terraform apply failed"; exit 1; }
terraform output -json > /tmp/runtime_outputs.json 2>/dev/null || echo '{}' > /tmp/runtime_outputs.json

# --- Stage 2c.5: Publish to AWS Agent Registry (preview) ---
# Failure here must NEVER fail the deploy — registry is a discovery layer, not critical path.
echo "=== Stage 2c.5: Publish to Agent Registry ==="
if [ -n "${AGENT_REGISTRY_ARN:-}" ]; then
  RUNTIME_ARN=$(terraform output -raw agentcore_runtime_arn 2>/dev/null || true)
  if [ -n "$RUNTIME_ARN" ]; then
    python3 /tmp/workspace/app_factory/scripts/publish_to_registry.py \
      --registry-arn "$AGENT_REGISTRY_ARN" \
      --runtime-arn "$RUNTIME_ARN" \
      --use-case-id "$USE_CASE_ID" \
      --submission-id "$SUBMISSION_ID" \
      --app-factory-table "$APP_FACTORY_TABLE_NAME" \
      --region "$AWS_TARGET_REGION" \
      --output-json /tmp/registry_outputs.json \
      || echo "WARNING: Agent Registry publish failed (non-fatal)"
  else
    echo "No runtime ARN found — skipping registry publish"
    echo '{}' > /tmp/registry_outputs.json
  fi
else
  echo "AGENT_REGISTRY_ARN not set — skipping registry publish"
  echo '{}' > /tmp/registry_outputs.json
fi

# --- Stage 2d: UI Deployment ---
UI_DIR="$FSI_ROOT/ui/$USE_CASE_ID"
UI_IAC="$IAC_DIR/ui"
if [ -d "$UI_DIR" ] && [ -d "$UI_IAC" ]; then
  echo "=== Stage 2d: UI Deployment ==="
  RUNTIME_ARN=$(cd "$IAC_DIR/runtime" && terraform output -raw agentcore_runtime_arn 2>/dev/null || true)
  if [ -n "$RUNTIME_ARN" ]; then
    cd "$UI_IAC"
    if ! grep -rq 'backend "s3"' *.tf 2>/dev/null; then
      printf 'terraform {\n  backend "s3" {}\n}\n' > backend_override.tf
    fi
    cat > deploy.auto.tfvars << TFVARS
aws_region           = "$AWS_TARGET_REGION"
use_case_id          = "$USE_CASE_ID"
use_case_name        = "$USE_CASE_ID"
framework            = "${FRAMEWORK:-strands}"
agentcore_runtime_arn = "$RUNTIME_ARN"
TFVARS
    terraform init -input=false \
      -backend-config="bucket=$STATE_BUCKET" \
      -backend-config="key=foundry/${USE_CASE_ID}/${FRAMEWORK}/ui/terraform.tfstate" \
      -backend-config="region=$AWS_TARGET_REGION" \
      -backend-config="dynamodb_table=$LOCK_TABLE"
    terraform plan -input=false -out=tfplan
    terraform apply -input=false -auto-approve tfplan || echo "WARNING: UI terraform apply failed"
    terraform output -json > /tmp/ui_outputs.json 2>/dev/null || echo '{}' > /tmp/ui_outputs.json

    # Build and deploy React app
    UI_BUCKET=$(terraform output -raw ui_bucket_name 2>/dev/null || true)
    CF_DIST_ID=$(terraform output -raw cloudfront_distribution_id 2>/dev/null || true)
    API_ENDPOINT=$(terraform output -raw api_endpoint 2>/dev/null || true)
    if [ -n "$UI_BUCKET" ]; then
      # Ensure Node 22+ for Vite
      NODE_VER=$(node --version 2>/dev/null | sed 's/v//' | cut -d. -f1)
      if [ -z "$NODE_VER" ] || [ "$NODE_VER" -lt 22 ]; then
        curl -fsSL https://nodejs.org/dist/v22.15.0/node-v22.15.0-linux-arm64.tar.xz | tar -xJ -C /usr/local --strip-components=1
      fi
      cd "$UI_DIR"
      npm install --legacy-peer-deps
      if [ -n "$API_ENDPOINT" ]; then
        cat public/runtime-config.json | jq --arg api "$API_ENDPOINT" '.api_endpoint = $api' > /tmp/rc.json && mv /tmp/rc.json public/runtime-config.json
      fi
      npm run build || { echo "ERROR: UI build failed"; exit 1; }
      aws s3 sync dist/ s3://$UI_BUCKET/ --delete --region $AWS_TARGET_REGION
      if [ -n "$CF_DIST_ID" ]; then
        aws cloudfront create-invalidation --distribution-id $CF_DIST_ID --paths "/*" --region $AWS_TARGET_REGION || true
      fi
      echo "UI deployed to s3://$UI_BUCKET"
    fi
  fi
else
  echo "No UI directory found — skipping UI deployment"
  echo '{}' > /tmp/ui_outputs.json
fi

# --- Merge outputs ---
echo "=== Merging outputs ==="
python3 -c "
import json, os
merged = {}
for path in ['/tmp/infra_outputs.json', '/tmp/runtime_outputs.json', '/tmp/ui_outputs.json', '/tmp/source_outputs.json', '/tmp/registry_outputs.json', '/tmp/docs_outputs.json']:
    try:
        raw = json.load(open(path))
        for k, v in raw.items():
            merged[k] = str(v.get('value','') if isinstance(v, dict) else v)
    except: pass
merged['deployment_id'] = os.environ['DEPLOYMENT_ID']
merged['status'] = 'success'
merged['iac_type'] = 'terraform'
json.dump(merged, open('/tmp/outputs.json', 'w'))
print(f'Merged {len(merged)} outputs')
"

echo ""
echo "========================================"
echo "App Factory deployment complete!"
echo "========================================"
cat /tmp/outputs.json
