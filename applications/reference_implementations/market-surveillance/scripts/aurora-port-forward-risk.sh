#!/bin/bash

# Gets the Risk Analyst Aurora DB host and sets up port forwarding with local port 5941

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

cd $SCRIPT_DIR > /dev/null

# Configuration
REGION="${AWS_REGION:-us-east-1}"
APP_NAME="${APP_NAME:-market-surveillance}"
ENV_NAME="${ENV_NAME:-dev}"
LOCAL_PORT="${LOCAL_PORT:-5941}"

# --- Resolve Risk Analyst Aurora DB host from Parameter Store ---
PARAM_NAME="/${APP_NAME}/${ENV_NAME}/foundations/msp-rds/db-address"
echo -e "\nGetting Risk Analyst Aurora DB HOST from parameter: $PARAM_NAME"

DB_HOST=$(aws ssm get-parameter \
  --name "$PARAM_NAME" \
  --region "$REGION" \
  --query "Parameter.Value" \
  --output text 2>/dev/null)

if [ -z "$DB_HOST" ]; then
  echo "ERROR: Could not find Risk Analyst RDS endpoint in Parameter Store"
  echo ""
  echo "Troubleshooting:"
  echo "  1. Check parameter exists: aws ssm get-parameter --name $PARAM_NAME --region $REGION"
  echo "  2. Ensure you're in the correct region: $REGION"
  exit 1
fi

echo -e "Risk Analyst Aurora DB HOST IS ${DB_HOST}\n"

# Set up port forwarding to Aurora using local port
cd "$SCRIPT_DIR"
$SCRIPT_DIR/start-ssh-session.sh pf $REGION $APP_NAME $ENV_NAME $LOCAL_PORT $DB_HOST 5432 || { echo -e "\nERROR: Failed to establish Risk Analyst Aurora port forwarding.\n"; cd -; exit 1; }

cd - > /dev/null
