"""The Cognito group names this deployment actually creates.

One home for three strings, because they were previously spelled differently in the
place that mints them and the place that checks them, and both places were sure.

infrastructure/modules/cognito/main.tf creates "admin", "operator" and "viewer" - all
singular. core/security.py's require_admin demanded "admins", so against a real user
pool it could not pass for anybody: the token carried "admin", the code wanted "admins",
and a correctly configured administrator got a 403 indistinguishable from a genuine
permissions problem.

It survived because core/dev_auth.py was wrong in the same direction. The dev bypass
minted a mock admin in a group named "admins" and then checked for "admins", so it
agreed with itself, local development passed every time, and nothing ever compared
either spelling with the resource that creates the group.

Kept here rather than in core/security.py or core/rbac.py because this module imports
nothing. core/security.py needs python-jose and core/rbac.py needs PyJWT, so a constant
living in either one cannot be adopted by the other without dragging that dependency
into it - and core/dev_auth.py deliberately has no JWT dependency at all, which is what
lets the dev-auth path import cleanly on a host that has not installed the full
requirements.

tests/test_cognito_group_names.py parses the Terraform and asserts these three names are
exactly the ones it declares, so the next drift fails a test instead of failing closed in
production.

Not for other pools. applications/reference_implementations/agentcore-in-a-box is a
separate deployment that genuinely creates and checks a group named "admins"; it is
self-consistent and nothing here applies to it.
"""

# Full access: manage users, deployments and platform settings.
ADMIN_GROUP = "admin"

# Create and manage deployments. No consumer imports this yet - core/rbac.py owns the
# role ladder and still carries its own literals - but the set has to be complete for
# the Terraform comparison in the test to be an equality rather than a subset check,
# and an enumeration of the pool's groups that omits one is the kind of half-truth this
# module exists to end.
OPERATOR_GROUP = "operator"

# Read-only.
VIEWER_GROUP = "viewer"
