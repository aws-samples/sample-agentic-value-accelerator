"""App Factory API routes — capture questionnaire submissions, generate code, and deploy"""

import uuid
import logging
import json
import os
import io
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import boto3
from boto3.dynamodb.types import TypeSerializer
from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, HTTPException

from core.rbac import require_role, Role
from pydantic import BaseModel
from typing import Optional

from core import region_config
from core.config import settings
from models.deployment import DeploymentCreate, DeploymentResponse, DeploymentStatus
from services.deployment_service import DeploymentService
from services.pipeline_service import PipelineService
from services.pipeline_inputs import AppFactoryPipelineInput

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/app-factory", tags=["app-factory"])

_table = None
_deploy_svc = None
_pipeline_svc = None


def get_table():
    """Lazily build the App Factory DynamoDB table handle.

    Guarded rather than raw, because boto3 accepts `Table("")` without complaint and
    only raises ParamValidationError ("Invalid length for parameter TableName") when
    the first operation runs. An unset APP_FACTORY_TABLE_NAME therefore surfaced from
    inside each route's own try/except, which rewrote it as a generic 500 ("Failed to
    retrieve submissions") and never named the setting that was missing. Worse, the
    empty-named handle was memoised into _table, so every later request repeated the
    same opaque failure.

    Raises:
        HTTPException: 503, naming the setting, when the table is not configured.
    """
    global _table
    if _table is None:
        table_name = settings.APP_FACTORY_TABLE_NAME
        if not table_name:
            # info, not error: an unconfigured table is a configuration state, not an
            # outage, and this path runs on every request until it is set.
            logger.info(
                "APP_FACTORY_TABLE_NAME is not configured; App Factory routes return 503."
            )
            raise HTTPException(
                status_code=503,
                detail=(
                    "APP_FACTORY_TABLE_NAME is not configured. Set it to the App Factory "
                    "DynamoDB table name."
                ),
            )
        # table_region("APP_FACTORY"), not settings.AWS_REGION directly. The tier is right
        # either way - this is AVA's own control-plane table, not the governed fleet - but
        # reading AWS_REGION raw meant APP_FACTORY_TABLE_REGION and
        # CONTROL_PLANE_TABLE_REGION were silently ignored for this one table while every
        # other control-plane table honoured them, so relocating it left the reader pointing
        # at the old region and returning an empty submission list.
        dynamodb = boto3.resource("dynamodb", region_name=region_config.table_region("APP_FACTORY"))
        _table = dynamodb.Table(table_name)
    return _table


def get_deploy_svc():
    global _deploy_svc
    if _deploy_svc is None:
        # table_region("DEPLOYMENTS"): DeploymentService builds its dynamodb resource from
        # this region, and litellm.py already reads the same table through
        # region_config.table_region("DEPLOYMENTS"). Leaving this one on raw AWS_REGION
        # meant a set DEPLOYMENTS_TABLE_REGION split the two apart - App Factory writing
        # deployments to one region while the model-catalog reader looked in another, with
        # no error on either side.
        _deploy_svc = DeploymentService(
            table_name=settings.DEPLOYMENTS_TABLE_NAME,
            region=region_config.table_region("DEPLOYMENTS"),
        )
    return _deploy_svc


def get_pipeline_svc():
    global _pipeline_svc
    if _pipeline_svc is None:
        # control_region(), NOT table_region(...): PipelineService holds no table. It builds
        # a stepfunctions client plus a logs client, so the region has to be the one
        # STATE_MACHINE_ARN lives in - naming a table key here would imply this follows a
        # table-relocation knob that has nothing to do with a state machine. Tier 1 either
        # way (AVA's own pipeline), and control_region() states that through the contract
        # instead of re-reading AWS_REGION. A mismatch with the ARN's own region fails loudly
        # at StartExecution, unlike the tier-2 sites in this change.
        _pipeline_svc = PipelineService(
            state_machine_arn=settings.STATE_MACHINE_ARN,
            region=region_config.control_region(),
        )
    return _pipeline_svc


# Map of questionnaire domain values → single-letter catalog prefix. The
# foundry registry (data/registry/offerings.json) uses the same shape —
# "B01" for banking, "I01" for insurance, etc. App-factory submissions get a
# prefix derived from the user's selected domain so catalog IDs across both
# sources remain visually consistent.
_DOMAIN_PREFIX_MAP = {
    "Retail Banking":     "AB",
    "Lending":            "AL",
    "Wealth Management":  "AW",
    "Capital Markets":    "AC",
    "Insurance":          "AI",
    "Compliance & Risk":  "AR",
    "Operations":         "AO",
    "Customer Service":   "AS",
    "Fraud & Security":   "AF",
    "Other":              "AX",
}


def _catalog_prefix(domain: str) -> str:
    """Two-letter catalog prefix for a questionnaire domain; "AX" (Other) if unmapped."""
    return _DOMAIN_PREFIX_MAP.get(domain, "AX")


def _scan_highest_catalog_nn(table, prefix: str) -> int:
    """Return the highest NN already issued under `prefix`, or 0 if none.

    Scans existing SUBMISSION#* items for any catalog_id that shares the prefix and
    parses the numeric tail. The caller adds 1 to get a candidate; _claim_catalog_id is
    what makes that candidate actually exclusive.

    Derives the next number from max(NN), NOT from len(items) - a deleted submission
    therefore leaves a gap rather than causing the next assignment to re-issue a live
    ID. Do not "simplify" this to a count.

    Raises whatever the scan raises. That is deliberate: the caller must NOT invent an ID
    when this fails, because a failed scan means the set of IDs already in use is
    unknown. See create_submission() for the archaeology on the fabricated fallback that
    used to sit there.
    """
    import re as _re
    pattern = _re.compile(r"^" + _re.escape(prefix) + r"(\d+)$")

    highest = 0
    # Paginated scan across all submissions. Volume is low (dozens, not
    # thousands), so a full scan is fine. If this grows, add a GSI keyed on
    # (prefix, NN) and query instead.
    #
    # ConsistentRead=True: a default Scan is eventually consistent, so a submission
    # written seconds earlier could be missing from this page - and a missing row means
    # its NN is not in `highest`, so this returns a candidate that is already taken.
    # The claim item below now catches that case rather than issuing a duplicate, but a
    # stale read still costs a wasted transaction round-trip per missing row, so keep
    # the strong read. Cost is 2x RCU on a table this module itself describes as holding
    # dozens of rows. Legal here because this is a table Scan; ConsistentRead is only
    # rejected on global secondary indexes.
    scan_kwargs = {
        "FilterExpression": "begins_with(pk, :pfx) AND sk = :sk AND attribute_exists(catalog_id)",
        "ExpressionAttributeValues": {":pfx": "SUBMISSION#", ":sk": "META"},
        "ProjectionExpression": "catalog_id",
        "ConsistentRead": True,
    }
    while True:
        resp = table.scan(**scan_kwargs)
        for item in resp.get("Items", []):
            m = pattern.match(item.get("catalog_id", ""))
            if m:
                highest = max(highest, int(m.group(1)))
        if "LastEvaluatedKey" not in resp:
            break
        scan_kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]

    return highest


# Bound on the recompute loop in _claim_catalog_id. Each iteration burns one
# already-taken NN, so this is "how many submissions can be racing in one domain before
# we give up and tell the caller to retry", not a latency knob. 12 is far above the
# observed concurrency for a table holding dozens of rows, and the loop exits on the
# first success, so the common path is exactly one transaction.
_CATALOG_CLAIM_ATTEMPTS = 12

# TransactWriteItems is a client-level operation, not a Table-resource one, so items
# have to be handed over in low-level DynamoDB JSON ({"S": "..."}) rather than the
# Python natives table.put_item accepts. TypeSerializer is boto3's own translator for
# exactly this - hand-rolling the {"S"/"N"/"BOOL"} mapping is how a null display_name
# or a numeric field silently becomes the wrong type.
_serializer = TypeSerializer()


def _to_dynamo(item: dict) -> dict:
    return {k: _serializer.serialize(v) for k, v in item.items()}


def _claim_catalog_id(table, prefix: str, first_nn: int, submission_item: dict) -> str:
    """Store `submission_item` and the catalog ID it was issued, atomically. Returns the ID.

    Writes two items in one TransactWriteItems:

      - the claim, pk="CATALOG_ID#<id>" / sk="CLAIM", conditional on
        attribute_not_exists(pk), which is what makes the ID exclusive; and
      - the submission itself, with catalog_id set to that ID, conditional on
        attribute_not_exists(pk) so a PutItem upsert cannot silently replace a record.

    Either both land or neither does. That closes the read-then-write race this function
    replaced: two submissions in the same domain that overlapped between the scan and the
    write both computed the same highest+1 and both stored it, so the value AppFactory.tsx
    calls "the authoritative identifier shown in the UI" was duplicated - with no error on
    either request. Now the second transaction's claim arm fails its condition, and we
    recompute from the next NN and retry instead of issuing the duplicate.

    On ConditionalCheckFailedException the candidate is incremented locally rather than
    re-scanned: the scan tells us nothing new (the winner's row and its claim were
    committed together, so the ID is taken either way) and a re-scan per attempt turns a
    burst of N concurrent submissions into O(N^2) scans.

    The claim is deliberately never deleted - there is no delete route for submissions,
    and _scan_highest_catalog_nn's contract is already that a removed submission leaves a
    gap rather than having its ID re-issued. A surviving claim enforces that instead of
    merely documenting it.

    No backfill is needed for rows written before this existed. Their IDs have no claim
    items, but they are still visible to the scan, so highest+1 skips past them; the first
    claim any of those IDs ever needs is the one that would collide with them.

    Raises:
        HTTPException: 409 if the submission pk already exists (the pk is a fresh uuid4,
            so this means a genuine collision, not contention); 503 if
            _CATALOG_CLAIM_ATTEMPTS consecutive IDs were all taken.
    """
    client = table.meta.client
    table_name = table.name
    nn = first_nn

    for _ in range(_CATALOG_CLAIM_ATTEMPTS):
        catalog_id = f"{prefix}{nn:02d}"
        item = {**submission_item, "catalog_id": catalog_id}
        claim = {
            "pk": f"CATALOG_ID#{catalog_id}",
            "sk": "CLAIM",
            "catalog_id": catalog_id,
            "submission_id": submission_item["submission_id"],
            "claimed_at": submission_item["created_at"],
        }
        try:
            client.transact_write_items(
                TransactItems=[
                    {
                        "Put": {
                            "TableName": table_name,
                            "Item": _to_dynamo(claim),
                            "ConditionExpression": "attribute_not_exists(pk)",
                        }
                    },
                    {
                        "Put": {
                            "TableName": table_name,
                            "Item": _to_dynamo(item),
                            "ConditionExpression": "attribute_not_exists(pk)",
                        }
                    },
                ]
            )
            return catalog_id
        except ClientError as e:
            if e.response.get("Error", {}).get("Code") != "TransactionCanceledException":
                raise
            # CancellationReasons is positional: index 0 is the claim arm, index 1 the
            # submission arm. Check the submission arm FIRST - if that is what failed,
            # incrementing the catalog ID and retrying would loop until the bound while
            # the actual fault (a pk that already exists) never changes.
            reasons = [r.get("Code") for r in e.response.get("CancellationReasons", [])]
            if len(reasons) > 1 and reasons[1] == "ConditionalCheckFailedException":
                logger.error(
                    "Submission %s already exists; refused to overwrite it.",
                    submission_item["submission_id"],
                )
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"Submission {submission_item['submission_id']} already exists. "
                        "Refusing to overwrite an existing record."
                    ),
                )
            if reasons and reasons[0] == "ConditionalCheckFailedException":
                logger.info(
                    "Catalog ID %s was claimed by a concurrent submission; trying %s%02d.",
                    catalog_id,
                    prefix,
                    nn + 1,
                )
                nn += 1
                continue
            if "TransactionConflict" in reasons:
                # Another transaction is mid-flight on the same claim item. Retry the SAME
                # id: if the other one commits we get ConditionalCheckFailed next time
                # around and increment then, so this self-corrects without guessing.
                logger.info("Transaction conflict on catalog ID %s; retrying.", catalog_id)
                continue
            raise

    logger.error(
        "Gave up assigning a catalog ID for prefix %s after %d attempts (last tried %s%02d).",
        prefix,
        _CATALOG_CLAIM_ATTEMPTS,
        prefix,
        nn,
    )
    raise HTTPException(
        status_code=503,
        detail=(
            f"Could not assign a catalog ID: {_CATALOG_CLAIM_ATTEMPTS} consecutive IDs for "
            f"prefix {prefix} were claimed by concurrent submissions. The submission was "
            "not saved - retry."
        ),
    )


class AppFactorySubmission(BaseModel):
    # use_case_name is the normalized technical ID (lowercase, hyphen-only,
    # <=32 chars) computed by the frontend's toUseCaseId(). This is what
    # flows into every downstream AWS resource name.
    use_case_name: str
    # display_name is the original free-form text the user typed. Stored
    # for UI-side readability. Optional for backwards compatibility with
    # API callers that don't set it (they'll see use_case_name in the UI).
    display_name: Optional[str] = ""
    problem: str
    domain: str
    current_process: str
    users: str
    successful_interaction: str
    workflow: str
    frequency: str
    human_in_loop: Optional[str] = ""
    data_inputs: str
    data_outputs: str
    compliance: Optional[str] = ""
    existing_systems: Optional[str] = ""


@router.post("/submissions", status_code=201)
async def create_submission(body: AppFactorySubmission, _=Depends(require_role(Role.OPERATOR))):
    submission_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()

    # Normalize use_case_name at the boundary so every downstream consumer
    # (deploy.sh tfvars, builder.py, data-builder, Dockerfile COPY) sees the
    # same canonical form. Prevents leading/trailing whitespace from becoming
    # underscores in one code path and not another.
    payload = body.dict()
    if payload.get("use_case_name"):
        payload["use_case_name"] = payload["use_case_name"].strip()

    # Assign a catalog ID (e.g. I04) derived from the domain prefix. Mirrors the foundry
    # registry's id scheme so both sources look consistent in the UI. Two steps, and they
    # are separate on purpose: the scan below only proposes a candidate, and the
    # transaction further down is what makes it exclusive. Splitting them keeps the two
    # honest error contracts distinct - a failed READ means no ID can be chosen at all
    # (503, nothing written), whereas a failed WRITE means the ID was fine and the store
    # rejected it (409/500). Fusing them would report one as the other.
    table = get_table()
    prefix = _catalog_prefix(payload.get("domain", ""))
    try:
        highest_nn = _scan_highest_catalog_nn(table, prefix)
    except HTTPException:
        raise
    except Exception as e:
        # Was: log a warning and fabricate `f"AX{submission_id[:6].upper()}"`. Four things
        # were wrong with that, and all four were invisible because the request still
        # returned 201 with a plausible-looking ID:
        #
        # 1. Wrong domain, 100% of the time. "AX" is the prefix for "Other"
        #    (_DOMAIN_PREFIX_MAP), so a Lending or Insurance submission was filed under
        #    Other no matter what the user selected. Encoding the domain in the ID is the
        #    entire point of the map - see commit 2d329104, "prefix all catalog IDs with
        #    A, distinct letter per domain".
        # 2. It poisoned the sequence ~6% of the time. uuid4's first six hex chars are all
        #    digits with probability (10/16)**6 = 0.0596; measured 0.05958 over 200k
        #    uuid4s. When that happens the fabricated ID matches _scan_highest_catalog_nn's
        #    `^AX(\d+)$` matcher, so `highest` jumps to a six-digit number. Reproduced:
        #    a table holding AX01, AX02, AX03 plus one fabricated AX481902 parses
        #    highest=481902, and the next healthy submission is issued AX481903. One
        #    failed scan permanently burns the readable NN scheme for that prefix.
        # 3. The other ~94% (AX7862BB, AXFA88E4) do NOT match that regex, so they are
        #    invisible to every later assignment - permanently orphaned IDs that the
        #    assigner can neither see nor avoid.
        # 4. It broke the <PREFIX><NN> shape contract that the foundry registry
        #    (data/registry/offerings.json: B01, B02, ...) and the UI share, and
        #    AppFactory.tsx renders this value as the authoritative identifier.
        #
        # The deeper problem is the timing: this branch runs precisely when the scan
        # FAILED, i.e. when the set of catalog IDs already in use is unknown. Guessing an
        # identity at the one moment we cannot check it for collisions is the worst
        # possible trade. Refuse instead. 503 + the exception type names the actual fault
        # (throttle, IAM, wrong region, missing table) and the frontend surfaces it -
        # client.ts reads error.response.data.detail and AppFactory.tsx puts it in its
        # error banner - so the user retries rather than silently owning a corrupt ID.
        logger.error(
            "Catalog ID assignment failed (%s) for domain %r on submission %s: %s. "
            "Refusing to fabricate an ID: the scan that enumerates IDs already in use is "
            "what failed, so any generated value is unverifiable. Returning 503.",
            type(e).__name__,
            payload.get("domain", ""),
            submission_id,
            e,
        )
        raise HTTPException(
            status_code=503,
            detail=(
                f"Could not assign a catalog ID ({type(e).__name__}): the App Factory "
                "table could not be read to determine the next available ID. The "
                "submission was not saved - retry. No ID is issued without that read, "
                "because a guessed ID can duplicate an existing one."
            ),
        )

    # catalog_id is absent here on purpose: _claim_catalog_id sets it, because which ID
    # this submission ends up with is decided by which claim wins, not by the candidate
    # computed above.
    item = {
        "pk": f"SUBMISSION#{submission_id}",
        "sk": "META",
        "submission_id": submission_id,
        "created_at": created_at,
        "status": "pending",
        **payload,
    }

    try:
        # Transactional claim + write, not a bare put_item, for two independent reasons:
        #
        # 1. PutItem is an upsert, so a pk that is already present is silently REPLACED,
        #    taking the existing record's catalog_id, created_at, status and deployment_id
        #    with it. The pk is a fresh uuid4 so that should never happen - but "should
        #    never happen" is exactly the class of assumption this branch exists to stop
        #    relying on, and a submission quietly vanishing leaves no trace at all.
        # 2. The catalog ID has to become exclusive in the same operation that uses it,
        #    or two concurrent submissions in one domain both keep the same number.
        #
        # Both are enforced by attribute_not_exists(pk) conditions inside the transaction.
        catalog_id = _claim_catalog_id(table, prefix, highest_nn + 1, item)
    except HTTPException:
        # 409 (pk collision) and 503 (claim contention) are raised by _claim_catalog_id
        # with the specific fault already named. Do not rewrite them as a generic 500.
        raise
    except Exception as e:
        logger.error(f"Failed to save submission: {e}")
        raise HTTPException(status_code=500, detail="Failed to save submission")

    logger.info(f"Saved app factory submission {submission_id} as catalog {catalog_id}")
    return {
        "submission_id": submission_id,
        "catalog_id": catalog_id,
        "created_at": created_at,
    }


@router.post("/submissions/{submission_id}/deploy", status_code=201)
async def deploy_submission(submission_id: str, _=Depends(require_role(Role.OPERATOR))):
    """Trigger code generation + deployment for an App Factory submission.

    Creates a deployment record (same as other deployments), packages the
    App Factory builder + reference code into a zip, and starts the Step
    Functions pipeline with a special app-factory buildspec.
    """
    # Fetch the submission
    response = get_table().get_item(
        Key={"pk": f"SUBMISSION#{submission_id}", "sk": "META"}
    )
    item = response.get("Item")
    if not item:
        raise HTTPException(status_code=404, detail=f"Submission {submission_id} not found")

    use_case_name = item["use_case_name"].strip().replace("-", "_").replace(" ", "_").lower().strip("_")

    # Create a deployment record (same table as all other deployments)
    deploy_req = DeploymentCreate(
        deployment_name=f"app-factory-{use_case_name}",
        template_id=f"app-factory-{use_case_name}",
        iac_type="terraform",
        framework_id="strands",
        aws_region=settings.AWS_REGION,
        parameters={
            "USE_CASE_ID": use_case_name,
            "FRAMEWORK": "strands",
            "DEPLOYMENT_PATTERN": "agentcore",
            "ENABLE_TRACING": "false",
            "LANGFUSE_HOST": "",
            "LANGFUSE_SECRET_NAME": "",
            "SUBMISSION_ID": submission_id,
            "APP_FACTORY_TABLE_NAME": settings.APP_FACTORY_TABLE_NAME,
        },
    )

    svc = get_deploy_svc()
    deployment = svc.create_deployment(deploy_req)

    # Package the App Factory builder + FSI Foundry source into a zip
    try:
        s3_client = boto3.client("s3", region_name=settings.AWS_REGION)

        # Resolve paths
        fsi_root = Path(settings.FOUNDRY_IAC_PATH).parent.parent
        # In Docker: /app/applications/app_factory (via symlink)
        # In local dev: repo_root/applications/app_factory
        docker_app_factory = Path("/app/applications/app_factory")
        if docker_app_factory.is_dir():
            app_factory_dir = docker_app_factory
        else:
            repo_root = fsi_root.parent.parent
            app_factory_dir = repo_root / "applications" / "app_factory"
        iac_dir = os.path.join(settings.FOUNDRY_IAC_PATH, "agentcore")
        shared_dir = os.path.join(settings.FOUNDRY_IAC_PATH, "shared")

        def _add_dir_to_zip(zf, src_dir, arc_prefix):
            for root, dirs, filenames in os.walk(src_dir):
                dirs[:] = [d for d in dirs if not d.startswith(".")
                           and d not in ("terraform.tfstate.d", "node_modules",
                                         "__pycache__", ".terraform")]
                for fname in filenames:
                    if fname.startswith(".") or fname.endswith((".tfstate", ".tfstate.backup", ".tsbuildinfo")):
                        continue
                    full = os.path.join(root, fname)
                    arcname = os.path.join(arc_prefix, os.path.relpath(full, src_dir))
                    zf.write(full, arcname)

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
            # App Factory builder and UI template
            if app_factory_dir.is_dir():
                _add_dir_to_zip(zf, str(app_factory_dir), "app_factory")

            # deploy.sh at zip root (CodeBuild buildspec runs this if present)
            deploy_sh = app_factory_dir / "deploy.sh"
            if deploy_sh.exists():
                zf.write(str(deploy_sh), "deploy.sh")

            # IaC (for deploying the generated use case)
            if os.path.isdir(iac_dir):
                _add_dir_to_zip(zf, iac_dir, "iac")
            if os.path.isdir(shared_dir):
                _add_dir_to_zip(zf, shared_dir, "shared")

            # Docker build context
            if os.path.isdir(settings.FOUNDRY_DOCKER_PATH):
                _add_dir_to_zip(zf, settings.FOUNDRY_DOCKER_PATH, "docker")

            # Foundations source (reference for builder + Docker image)
            if os.path.isdir(settings.FOUNDRY_SRC_PATH):
                _add_dir_to_zip(zf, settings.FOUNDRY_SRC_PATH, "app_src")

            # Reference use case source (for builder to study)
            ref_uc = os.path.join(settings.FOUNDRY_USE_CASES_PATH, "customer_service", "src")
            if os.path.isdir(ref_uc):
                _add_dir_to_zip(zf, ref_uc, "use_cases/customer_service/src")

            # Reference sample data and registry
            fsi_data = fsi_root / "data"
            if fsi_data.is_dir():
                _add_dir_to_zip(zf, str(fsi_data), "data")

        s3_key = f"deployments/{deployment.deployment_id}/{use_case_name}.zip"
        s3_client.put_object(Bucket=deployment.s3_bucket, Key=s3_key, Body=buf.getvalue())
        deployment.s3_key = s3_key
        logger.info(f"Packaged app-factory bundle to s3://{deployment.s3_bucket}/{s3_key}")
    except Exception as e:
        logger.error(f"App Factory packaging failed: {e}")
        svc.update_status(deployment.deployment_id, DeploymentStatus.FAILED, error_message=str(e))
        raise HTTPException(status_code=500, detail=f"Packaging failed: {e}")

    # Start the Step Functions pipeline
    try:
        pipeline_svc = get_pipeline_svc()
        sf_input = {
            "deployment_id": deployment.deployment_id,
            "template_id": f"app-factory-{use_case_name}",
            "deployment_name": f"app-factory-{use_case_name}",
            "iac_type": "terraform",
            "framework_id": "strands",
            "aws_region": settings.AWS_REGION,
            "s3_bucket": deployment.s3_bucket,
            "s3_key": deployment.s3_key,
            "parameters": AppFactoryPipelineInput.from_dict(deploy_req.parameters).to_sfn_parameters(),
            "target_account_id": None,
            "target_role_arn": None,
            "action": "deploy",
            "job": {
                "name": "onboarding",
                "incoming_event": f"{use_case_name}_onboarding_request",
                "outgoing_event": f"{use_case_name}_onboarding_success",
            },
        }
        execution_name = f"appfactory-{deployment.deployment_id}"
        response = pipeline_svc.sfn_client.start_execution(
            stateMachineArn=pipeline_svc.state_machine_arn,
            name=execution_name,
            input=json.dumps(sf_input),
        )
        deployment.execution_arn = response["executionArn"]
        svc.table.put_item(Item=svc._to_item(deployment))
    except Exception as e:
        logger.error(f"App Factory pipeline start failed: {e}")
        svc.update_status(deployment.deployment_id, DeploymentStatus.FAILED, error_message=str(e))
        raise HTTPException(status_code=500, detail=f"Pipeline start failed: {e}")

    # Update the submission with deployment info
    try:
        get_table().update_item(
            Key={"pk": f"SUBMISSION#{submission_id}", "sk": "META"},
            UpdateExpression="SET #status = :status, deployment_id = :did",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={
                ":status": "deploying",
                ":did": deployment.deployment_id,
            },
        )
    except Exception:
        logger.warning(f"Failed to update submission {submission_id} with deployment_id")

    return DeploymentResponse(**deployment.dict())


@router.get("/submissions")
async def list_submissions(_=Depends(require_role(Role.VIEWER))):
    try:
        response = get_table().scan(
            FilterExpression="sk = :sk",
            ExpressionAttributeValues={":sk": "META"},
        )
        items = response.get("Items", [])
        for item in items:
            item.pop("pk", None)
            item.pop("sk", None)
        items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        return items
    except HTTPException:
        # get_table() raises a 503 that names the unconfigured setting. Without this
        # re-raise the broad handler below swallowed it into a generic 500 "Failed to
        # retrieve submissions", which reads as a database fault and hides the fix.
        raise
    except Exception as e:
        logger.error(f"Failed to list submissions: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve submissions")


@router.get("/submissions/{submission_id}")
async def get_submission(submission_id: str, _=Depends(require_role(Role.VIEWER))):
    try:
        response = get_table().get_item(
            Key={"pk": f"SUBMISSION#{submission_id}", "sk": "META"}
        )
        item = response.get("Item")
        if not item:
            raise HTTPException(status_code=404, detail="Submission not found")
        item.pop("pk", None)
        item.pop("sk", None)
        return item
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get submission: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve submission")
