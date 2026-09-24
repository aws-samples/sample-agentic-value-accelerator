"""Cognito PostConfirmation trigger: place newly confirmed users in 'viewer'.

Runs once, after the user submits the verification code (or admin confirms).
Self-signup defaults to the least-privileged role; admins promote to
'operator' or 'admin' by hand.

Idempotent: AdminAddUserToGroup is a no-op if the user is already in the
group. Any other error is logged but not re-raised — a failure here should
not block the user from completing sign-up.
"""
import logging
import os

import boto3
from botocore.exceptions import ClientError

log = logging.getLogger()
log.setLevel(logging.INFO)

DEFAULT_GROUP = os.environ.get("DEFAULT_GROUP", "viewer")
_cognito = boto3.client("cognito-idp")


def handler(event, _context):
    pool_id = event.get("userPoolName") or event["userPoolId"]
    username = event.get("userName")
    if not username:
        log.warning("PostConfirmation event missing userName; skipping group assignment")
        return event

    try:
        _cognito.admin_add_user_to_group(
            UserPoolId=pool_id,
            Username=username,
            GroupName=DEFAULT_GROUP,
        )
        log.info("Added %s to group %s", username, DEFAULT_GROUP)
    except ClientError as e:
        # Don't fail sign-up because of a group-assignment glitch — an admin
        # can add them by hand. Log the code so this shows up in metrics.
        log.error("Failed to add %s to %s: %s", username, DEFAULT_GROUP, e.response["Error"]["Code"])

    return event
