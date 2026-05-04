#!/bin/bash

# Check for minimum required arguments
if [[ $# -lt 4 ]]; then
  echo 1>&2 "Usage: $0 <MODE> <REGION> <APP_NAME> <ENV_NAME> [<LOCAL_PORT> <REMOTE_HOST> <REMOTE_PORT>]"
  echo 1>&2 "MODE: ssh | pf (for port forwarding)"
  echo 1>&2 "MODE: For pf [<LOCAL_PORT> <REMOTE_HOST> <REMOTE_PORT>] is required"
  echo 1>&2 "Example: $0 ssh us-east-2 card-mgmt sdwiv"
  echo 1>&2 "Example: Connect to PostgreSQL Database in an isolated subnet"
  echo 1>&2 "$0 pf us-east-2 project1 user1 5432 my-aurora-postgres-db.inst.us-east-2.rds.amazonaws.com 5432"
  exit 1
fi

MODE=$1
REGION=$2
APP_NAME=$3
ENV_NAME=$4
LOCAL_PORT=$5
REMOTE_HOST=$6
REMOTE_PORT=$7

AWS_INSTANCE_ID=$(aws ec2 describe-instances \
                --region "$REGION" \
                --filters "Name=tag:Name,Values=$APP_NAME-$ENV_NAME-bastion-host" \
                         "Name=instance-state-name,Values=running" \
                --query "Reservations[*].Instances[*].InstanceId" \
                --output text)

if [[ -z "$AWS_INSTANCE_ID" ]]; then
  echo "Error: No running instance found with name tag '$APP_NAME-$ENV_NAME-bastion-host'"
  exit 1
fi

echo "Found instance: $AWS_INSTANCE_ID"

case $MODE in
  ssh)
    # start SSH session
    aws ec2-instance-connect ssh \
      --region "$REGION" \
      --instance-id "${AWS_INSTANCE_ID}" \
      --connection-type eice
      ;;
  pf)
    if [[ -z "$LOCAL_PORT" || -z "$REMOTE_HOST" || -z "$REMOTE_PORT" ]]; then
      echo 1>&2 "Usage: $0 pf <REGION> <APP_NAME> <ENV_NAME> <LOCAL_PORT> <REMOTE_HOST> <REMOTE_PORT>"
      echo "Error: LOCAL_PORT, REMOTE_HOST, and REMOTE_PORT are required for port forwarding"
      exit 1
    fi
    # start SSH port forwarding session
    echo -e "\nEstablishing port forwarding to Aurora from local port $LOCAL_PORT to remote port $REMOTE_PORT"
    aws ec2-instance-connect ssh \
      --region "$REGION" \
      --instance-id "${AWS_INSTANCE_ID}" \
      --connection-type eice \
      --local-forwarding "${LOCAL_PORT}:${REMOTE_HOST}:${REMOTE_PORT}"
      ;;
  *)
    echo "Unknown mode $MODE"
    echo 1>&2 "Usage: $0 <MODE> <REGION> <APP_NAME> <ENV_NAME> [<LOCAL_PORT> <REMOTE_HOST> <REMOTE_PORT>]"
    echo 1>&2 "MODE: ssh | pf (for port forwarding)"
    echo 1>&2 "MODE: For pf [<LOCAL_PORT> <REMOTE_HOST> <REMOTE_PORT>] is required"
    exit 1
    ;;
esac
exit $?
