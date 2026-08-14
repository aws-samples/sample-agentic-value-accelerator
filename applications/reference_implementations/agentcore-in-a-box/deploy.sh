#!/usr/bin/env bash
set -euo pipefail

echo "=== AgentCore in a Box Deployment ==="

# ── Read parameters from deploy.auto.tfvars.json (injected by AVA packaging service)
if [ -f deploy.auto.tfvars.json ]; then
  PARAM_REGION=$(python3 -c "import json; print(json.load(open('deploy.auto.tfvars.json')).get('aws_region',''))")
  PROJECT_NAME=$(python3 -c "import json; print(json.load(open('deploy.auto.tfvars.json')).get('project_name','agentcore-in-a-box'))")
else
  PARAM_REGION=""
  PROJECT_NAME="agentcore-in-a-box"
fi

# Region resolution order: CP-injected AWS_TARGET_REGION → user param → fallback us-west-2
REGION="${AWS_TARGET_REGION:-${PARAM_REGION:-us-west-2}}"
export AWS_REGION="$REGION"
export CDK_DEFAULT_REGION="$REGION"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export CDK_DEFAULT_ACCOUNT="$ACCOUNT_ID"

# Isolate parallel deploys — use a short (≤7 char) suffix derived from the CP
# deployment id. The upstream stack embeds DEMO_ENV in S3 bucket names
# (agentcore-demo-market-${DEMO_ENV}-${ACCOUNT}), which caps at 63 chars total;
# the upstream's own generator uses `u<6-hex>` for the same reason. Take the
# first 6 hex chars of the deployment UUID after 'u' → 7 chars total, stable
# and collision-safe across parallel CP deploys.
if [ -n "${DEPLOYMENT_ID:-}" ]; then
  # Strip dashes from the UUID and take the first 6 hex chars, prefix with 'u'.
  _DEMO_SUFFIX=$(echo "${DEPLOYMENT_ID}" | tr -d '-' | cut -c1-6)
  export DEMO_ENV="u${_DEMO_SUFFIX}"
else
  export DEMO_ENV="${PROJECT_NAME}"
fi

echo "Project: $PROJECT_NAME | Region: $REGION | Account: $ACCOUNT_ID | DEMO_ENV: $DEMO_ENV"

# Force docker over finch. CodeBuild's ARM Linux image ships finch on PATH
# but containerd is not running, so `finch build` exits silently after login.
# Docker is the only container CLI that actually works in CodeBuild.
export CONTAINER_CLI="$(command -v docker || command -v finch)"
echo "Container CLI: $CONTAINER_CLI"

# ── Ensure Node 20+ for CDK ───────────────────────────────────────────────────
NODE_VER=$(node --version 2>/dev/null | sed 's/v//' | cut -d. -f1 || echo 0)
if [ -z "$NODE_VER" ] || [ "$NODE_VER" -lt 20 ]; then
  ARCH=$(uname -m)
  case "$ARCH" in
    aarch64|arm64) NODE_ARCH="linux-arm64" ;;
    x86_64)        NODE_ARCH="linux-x64"   ;;
    *)             echo "Unsupported arch: $ARCH"; exit 1 ;;
  esac
  echo "Upgrading Node.js to 22 ($NODE_ARCH)..."
  curl -fsSL "https://nodejs.org/dist/v22.15.0/node-v22.15.0-${NODE_ARCH}.tar.xz" | tar -xJ -C /usr/local --strip-components=1
fi

# ── Upgrade CDK CLI ───────────────────────────────────────────────────────────
echo "Upgrading CDK CLI..."
npm install -g aws-cdk@latest

# ── Install CDK dependencies for this stack (TypeScript) ──────────────────────
echo "Installing CDK dependencies..."
npm install

# ── CDK bootstrap ─────────────────────────────────────────────────────────────
echo "Bootstrapping CDK in $ACCOUNT_ID / $REGION..."
npx cdk bootstrap "aws://${ACCOUNT_ID}/${REGION}" || {
  echo "ERROR: CDK bootstrap failed"; exit 1
}

# ── Delegate to the upstream orchestrator ─────────────────────────────────────
# _deploy_internal.sh does the full CDK deploy + AgentCore CLI resource creation
# + agent container build/push + Lambda/runtime wiring + frontend config.
echo "=== Delegating to upstream deploy orchestrator ==="
chmod +x ./_deploy_internal.sh
./_deploy_internal.sh

# ── Attach AVA FSI SSO CloudFront Function (idempotent, opt-in via env) ──────
# When AVA_FSI_APP_SIGNING_SECRET is set in CodeBuild (buildspec.yml exports it),
# attach the AVA edge auth function so users transparently SSO from the AVA UI
# without seeing the Cognito Hosted UI. The 9 demo Cognito users still exist
# (they back per-user DynamoDB rows + Aurora RLS), but nobody logs in as them —
# the persona is picked from a dropdown after AVA SSO.
if [ -n "${AVA_FSI_APP_SIGNING_SECRET:-}" ]; then
  echo "=== Attaching AVA FSI SSO edge auth ==="
  # The CDK stack exports CloudFrontUrl (the domain), not the DistributionId.
  # Read the domain from the upstream's outputs file, then resolve the id via
  # `aws cloudfront list-distributions`.
  CF_DOMAIN=""
  OUTPUTS_FILE=".deployment-outputs-${DEMO_ENV}.json"
  if [ -f "$OUTPUTS_FILE" ]; then
    CF_DOMAIN=$(python3 -c "
import json, sys, re
try:
    d = json.load(open('$OUTPUTS_FILE'))
    # Values in the file may be either scalar strings or nested dicts of stack outputs.
    def walk(o):
        if isinstance(o, dict):
            for v in o.values():
                r = walk(v)
                if r: return r
        elif isinstance(o, list):
            for v in o:
                r = walk(v)
                if r: return r
        elif isinstance(o, str) and 'cloudfront.net' in o:
            m = re.search(r'([a-z0-9]+\.cloudfront\.net)', o)
            if m: return m.group(1)
        return None
    r = walk(d)
    print(r or '')
except Exception:
    print('')
" 2>/dev/null || echo "")
  fi
  # Fail-loud: when AVA SSO is on (signing secret set), a missing attach is a
  # security regression — the CloudFront URL would be world-open. Prior version
  # swallowed all three failure paths with `|| echo`, which is exactly how the
  # jwt_auth_function.js file went missing in a "successful" build. Any skip
  # here now aborts the deploy so the AVA UI records it as failed.
  if [ -z "$CF_DOMAIN" ]; then
    echo "ERROR: CloudFront domain not found in $OUTPUTS_FILE — cannot attach SSO edge auth" >&2
    exit 1
  fi
  CF_DIST_ID=$(aws cloudfront list-distributions \
    --query "DistributionList.Items[?DomainName=='${CF_DOMAIN}'].Id | [0]" \
    --output text 2>/dev/null || echo "")
  if [ -z "$CF_DIST_ID" ] || [ "$CF_DIST_ID" = "None" ]; then
    echo "ERROR: CF distribution id not resolvable (domain=$CF_DOMAIN)" >&2
    exit 1
  fi
  if [ ! -f attach_cf_auth.py ]; then
    echo "ERROR: attach_cf_auth.py not found — cannot attach SSO edge auth" >&2
    exit 1
  fi
  if [ ! -f jwt_auth_function.js ]; then
    echo "ERROR: jwt_auth_function.js not found — attach_cf_auth.py would fail silently" >&2
    exit 1
  fi
  python3 ./attach_cf_auth.py "$CF_DIST_ID" "$PROJECT_NAME"
else
  echo "  AVA_FSI_APP_SIGNING_SECRET not set — skipping SSO edge auth (Cognito Hosted UI login path)"
fi

# ── Collect outputs and write to control plane DynamoDB ───────────────────────
echo "=== Collecting outputs ==="
python3 - <<'PYEOF'
import glob
import json
import os

# The upstream script writes .deployment-outputs-<DEMO_ENV>.json
demo_env = os.environ.get("DEMO_ENV", "")
candidates = [
    f".deployment-outputs-{demo_env}.json",
    ".deployment-outputs.json",
]
candidates += sorted(glob.glob(".deployment-outputs-*.json"), reverse=True)

raw = {}
found = None
for path in candidates:
    if os.path.exists(path):
        try:
            with open(path) as f:
                raw = json.load(f)
            found = path
            break
        except Exception as e:
            print(f"Warning: could not parse {path}: {e}")

if not found:
    # Fall back to cdk outputs if the upstream file is missing.
    cdk_out_glob = sorted(glob.glob("cdk-outputs-*.json"), reverse=True)
    if cdk_out_glob:
        try:
            with open(cdk_out_glob[0]) as f:
                raw = json.load(f)
            found = cdk_out_glob[0]
        except Exception as e:
            print(f"Warning: could not parse {cdk_out_glob[0]}: {e}")

print(f"Reading outputs from: {found or '(none found)'}")

# Normalize keys to snake_case and hoist CloudFront URL to ui_url.
def _flatten(obj, out):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if isinstance(v, (dict, list)):
                _flatten(v, out)
            else:
                key = str(k).replace("-", "_").lower()
                out[key] = v
    elif isinstance(obj, list):
        for item in obj:
            _flatten(item, out)

flat = {}
_flatten(raw, flat)

outputs = {
    "status": "success",
    "deployment_id": os.environ.get("DEPLOYMENT_ID", ""),
}
outputs.update(flat)

# Map upstream naming conventions to the CP-standard ui_url.
for key in ("cloudfront_url", "cloudfrontdomain", "cloudfront_domain",
            "frontend_url", "frontendurl", "app_url"):
    if key in flat and "ui_url" not in outputs:
        outputs["ui_url"] = flat[key]
        break

# If the upstream JSON nests CloudFormation-style stack outputs, catch those too.
for k, v in list(flat.items()):
    if isinstance(v, str) and "cloudfront.net" in v and "ui_url" not in outputs:
        outputs["ui_url"] = v
        break

print(f"Collected {len(outputs)} outputs")
with open('/tmp/outputs.json', 'w') as f:
    json.dump(outputs, f)

# Write outputs to the control plane DynamoDB using AWS_DEFAULT_REGION
# (the CodeBuild execution region, where the control plane table lives),
# NOT AWS_TARGET_REGION (the deployment region, where the app was deployed).
table_name = os.environ.get('DEPLOYMENTS_TABLE', '')
deployment_id = os.environ.get('DEPLOYMENT_ID', '')
cp_region = os.environ.get('AWS_DEFAULT_REGION', 'us-east-1')
if table_name and deployment_id:
    try:
        import boto3
        ddb = boto3.resource('dynamodb', region_name=cp_region)
        table = ddb.Table(table_name)
        clean = {k: v for k, v in outputs.items() if k not in ('deployment_id', 'status')}
        if clean:
            table.update_item(
                Key={'pk': f'DEPLOY#{deployment_id}', 'sk': 'META'},
                UpdateExpression='SET outputs = :o',
                ExpressionAttributeValues={':o': clean},
            )
            print(f"Stored {len(clean)} outputs to DynamoDB ({cp_region})")
    except Exception as e:
        print(f"Warning: could not write outputs to DynamoDB: {e}")
PYEOF

echo "=== Deployment complete ==="
cat /tmp/outputs.json 2>/dev/null || true
