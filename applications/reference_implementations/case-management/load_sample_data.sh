#!/bin/bash
set -euo pipefail

# Load credentials from .env when running locally. In CI/CD the environment
# already carries AWS creds; .env is absent and optional.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/.env" ]; then
  export $(grep -v '^#' "$SCRIPT_DIR/.env" | grep -v '^$' | xargs)
fi

REGION="${AWS_REGION:-us-east-1}"
TABLE="txn_logs"

# Portable "time ago" and "time plus" helpers so this script runs on both
# macOS (BSD date) and Linux (GNU date). Uses python3 to avoid platform drift.
#   iso_ago_hours N  → ISO-8601 UTC timestamp N hours in the past
#   iso_ago_mins  N  → ISO-8601 UTC timestamp N minutes in the past
#   epoch_plus_days N → epoch seconds N days in the future
iso_ago_hours() { python3 -c "import datetime,sys; print((datetime.datetime.utcnow()-datetime.timedelta(hours=int(sys.argv[1]))).strftime('%Y-%m-%dT%H:%M:%SZ'))" "$1"; }
iso_ago_mins()  { python3 -c "import datetime,sys; print((datetime.datetime.utcnow()-datetime.timedelta(minutes=int(sys.argv[1]))).strftime('%Y-%m-%dT%H:%M:%SZ'))" "$1"; }
epoch_plus_days() { python3 -c "import datetime,sys; print(int((datetime.datetime.utcnow()+datetime.timedelta(days=int(sys.argv[1]))).timestamp()))" "$1"; }
# rand_amount MIN MAX → random dollar amount with 2 decimals, uniform in [MIN, MAX+0.99].
# Replaces the original `bc`-based expression; bc isn't available on CodeBuild AL2.
rand_amount()   { python3 -c "import random,sys; print(f'{random.randint(int(sys.argv[1]), int(sys.argv[2])) + random.randint(0,99)/100:.2f}')" "$1" "$2"; }

echo "=========================================="
echo "Sample Data Loader"
echo "=========================================="
echo "Account: $(aws sts get-caller-identity --query Account --output text)"
echo "Region: $REGION"
echo "Table: $TABLE"
echo ""

# Function to put item to DynamoDB
put_item() {
  local txn_id="$1"
  local src="$2"
  local dst="$3"
  local amount="$4"
  local decision="$5"
  local fraud_score="$6"
  local timestamp="$7"
  local geo="$8"
  local device_id="$9"
  local tags="${10}"

  local pk=$(uuidgen)
  local expire_ts=$(epoch_plus_days 30)

  aws dynamodb put-item \
    --table-name "$TABLE" \
    --region "$REGION" \
    --item "{
      \"pk\": {\"S\": \"$pk\"},
      \"txn_id\": {\"S\": \"$txn_id\"},
      \"src\": {\"S\": \"$src\"},
      \"dst\": {\"S\": \"$dst\"},
      \"amount\": {\"N\": \"$amount\"},
      \"timestamp\": {\"S\": \"$timestamp\"},
      \"decision\": {\"S\": \"$decision\"},
      \"fraud_score\": {\"N\": \"$fraud_score\"},
      \"reason_tags\": {\"L\": [$tags]},
      \"expire_ts\": {\"N\": \"$expire_ts\"}
    }" >/dev/null 2>&1

  echo "✓ $txn_id → $decision"
}

# Generate timestamps
BASE_TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "Loading sample transactions..."
echo ""

# Normal transactions (APPROVE)
for i in {1..20}; do
  txn_id=$(printf "TXN_%04d" $i)
  src="A$(shuf -i 101-305 -n 1)"
  dst="A$(shuf -i 101-305 -n 1)"
  amount=$(rand_amount 10 500)
  timestamp=$(iso_ago_hours "$i")
  put_item "$txn_id" "$src" "$dst" "$amount" "APPROVE" "0.15" "$timestamp" "US-CA" "web-1234" ""
done

# Smurfing pattern (STEP_UP_REVIEW)
echo ""
echo "Loading suspicious patterns..."
for i in {1..5}; do
  txn_id="TXN_SMURF_$i"
  amount="97.50"
  timestamp=$(iso_ago_mins $((i * 15)))
  put_item "$txn_id" "A705" "A901" "$amount" "STEP_UP_REVIEW" "0.88" "$timestamp" "US-NY" "web-5555" "{\"S\":\"SMURFING\"}"
done

# High velocity pattern (STEP_UP_REVIEW)
for i in {1..8}; do
  txn_id="TXN_VEL_$i"
  amount=$(rand_amount 50 300)
  timestamp=$(iso_ago_mins $((i * 4)))
  dst="A40$(shuf -i 1-3 -n 1)"
  put_item "$txn_id" "A305" "$dst" "$amount" "STEP_UP_REVIEW" "0.90" "$timestamp" "US-CA" "mobile-ios-6666" "{\"S\":\"HIGH_VELOCITY\"}"
done

# Mule account pattern (HOLD_AND_CASE)
for i in {1..5}; do
  txn_id="TXN_MULE_$i"
  src="A10$i"
  amount=$(rand_amount 200 500)
  timestamp=$(iso_ago_mins $((i * 10)))
  put_item "$txn_id" "$src" "A801" "$amount" "HOLD_AND_CASE" "0.96" "$timestamp" "US-TX" "web-7777" "{\"S\":\"FAN_IN_TO_DST\"},{\"S\":\"MULE_DESTINATION\"}"
done

# Large transactions (STEP_UP_REVIEW)
for i in {1..3}; do
  txn_id="TXN_LARGE_$i"
  amount=$(rand_amount 5000 10000)
  timestamp=$(iso_ago_hours $((i * 12)))
  put_item "$txn_id" "A201" "A601" "$amount" "STEP_UP_REVIEW" "0.87" "$timestamp" "US-FL" "web-8888" "{\"S\":\"LARGE_AMOUNT\"}"
done

echo ""
echo "=========================================="
echo "✅ Sample data loaded successfully!"
echo "=========================================="
echo ""
echo "🌐 Open your UI to view transactions:"
echo "   http://case-management-ui-<ACCOUNT_ID>.s3-website-us-east-1.amazonaws.com"
echo ""
