# Service Approval — Safety Rules

These rules apply across all clients and all agents.

## Deployment Safety
- Before any AWS deployment, run `aws sts get-caller-identity --profile <env>` and display
  the account ID and alias to the user. Pause and ask for explicit confirmation.
- Never deploy to any account whose alias or ID suggests production (contains: prod, prd,
  production, live) unless the user has confirmed twice.
- The `--env` flag must point to a named AWS CLI profile — never use the default profile.

## State Safety
- Always write state to `.service-approval/<slug>/<phase>/` relative to the current working directory.
- Never overwrite existing `research.json` or `validated.json` without user confirmation.
- State files from previous runs are preserved unless `--clean` flag is passed.

## Generation Safety
- Never generate controls for items with `verified: false` unless `--include-unverified` is passed.
- All generated JSON policy files must be validated with `python3 -m json.tool <file>` before use.
- For IAM policy files (SCP, RCP, permission boundaries), additionally validate with
  `aws iam validate-policy --policy-document file://<file> --policy-type SERVICE_CONTROL_POLICY`
  where applicable.
- Generated SCPs must include a Deny statement — never generate Allow-only SCPs as the only control.

## Teardown Safety
- Tester always tears down deployed test resources at the end unless `--keep` is passed.
- If teardown fails, list the deployed resource ARNs in `test-results.json` under `teardown_failed`.

## MCP Safety
- All API parameters, condition keys, and Config rule names must be sourced from MCP — never
  from model training data.
- Log every MCP call to `.service-approval/<slug>/mcp-calls.log`.
