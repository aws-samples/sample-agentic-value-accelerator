"""Guardrail service for managing guardrail templates via Bedrock SDK + DynamoDB"""

import boto3
import logging
import json
import re
import time
import threading
from decimal import Decimal
from typing import Dict, List, Optional
from datetime import datetime, timedelta

from models.guardrail import (
    GuardrailTemplate,
    GuardrailTemplateCreate,
    GuardrailTemplateUpdate,
    GuardrailStatus,
    StatusHistoryEntry,
    GuardrailPreset,
    GuardrailMetrics,
    GuardrailEvent,
    ContentFilterConfig,
    DeniedTopic,
    PiiEntityConfig,
    SensitiveRegexConfig,
    WordFilterConfig,
    ContextualGroundingConfig,
    FilterStrength,
    FilterType,
    PiiAction,
    PiiEntityType,
)

logger = logging.getLogger(__name__)


# --- FSI Presets ---

FSI_PRESETS: List[GuardrailPreset] = [
    GuardrailPreset(
        id="fsi-standard",
        name="FSI Standard",
        description="Comprehensive protection for financial services — content filtering, PII detection for financial data, and profanity filtering.",
        tags=["banking", "insurance", "compliance"],
        config=GuardrailTemplateCreate(
            name="FSI Standard Guardrail",
            description="Standard financial services guardrail with content filtering and PII protection",
            content_filters=[
                ContentFilterConfig(type=FilterType.HATE, input_strength=FilterStrength.HIGH, output_strength=FilterStrength.HIGH),
                ContentFilterConfig(type=FilterType.INSULTS, input_strength=FilterStrength.HIGH, output_strength=FilterStrength.HIGH),
                ContentFilterConfig(type=FilterType.SEXUAL, input_strength=FilterStrength.HIGH, output_strength=FilterStrength.HIGH),
                ContentFilterConfig(type=FilterType.VIOLENCE, input_strength=FilterStrength.MEDIUM, output_strength=FilterStrength.MEDIUM),
                ContentFilterConfig(type=FilterType.MISCONDUCT, input_strength=FilterStrength.HIGH, output_strength=FilterStrength.HIGH),
                ContentFilterConfig(type=FilterType.PROMPT_ATTACK, input_strength=FilterStrength.HIGH, output_strength=FilterStrength.NONE),
            ],
            pii_entities=[
                PiiEntityConfig(type=PiiEntityType.CREDIT_DEBIT_CARD_NUMBER, action=PiiAction.ANONYMIZE),
                PiiEntityConfig(type=PiiEntityType.CREDIT_DEBIT_CARD_CVV, action=PiiAction.BLOCK),
                PiiEntityConfig(type=PiiEntityType.SSN, action=PiiAction.ANONYMIZE),
                PiiEntityConfig(type=PiiEntityType.INTERNATIONAL_BANK_ACCOUNT_NUMBER, action=PiiAction.ANONYMIZE),
                PiiEntityConfig(type=PiiEntityType.SWIFT_CODE, action=PiiAction.ANONYMIZE),
            ],
            word_filter=WordFilterConfig(enable_profanity=True, blocked_words=[]),
        ),
    ),
    GuardrailPreset(
        id="market-surveillance",
        name="Market Surveillance",
        description="Designed for trading and capital markets — blocks insider trading advice and unauthorized financial recommendations.",
        tags=["trading", "capital-markets", "compliance"],
        config=GuardrailTemplateCreate(
            name="Market Surveillance Guardrail",
            description="Guardrail for capital markets with denied topics for trading compliance",
            content_filters=[
                ContentFilterConfig(type=FilterType.HATE, input_strength=FilterStrength.MEDIUM, output_strength=FilterStrength.MEDIUM),
                ContentFilterConfig(type=FilterType.INSULTS, input_strength=FilterStrength.MEDIUM, output_strength=FilterStrength.MEDIUM),
                ContentFilterConfig(type=FilterType.MISCONDUCT, input_strength=FilterStrength.HIGH, output_strength=FilterStrength.HIGH),
                ContentFilterConfig(type=FilterType.PROMPT_ATTACK, input_strength=FilterStrength.HIGH, output_strength=FilterStrength.NONE),
            ],
            denied_topics=[
                DeniedTopic(
                    name="Insider Trading Advice",
                    definition="Any advice or instructions related to trading based on material non-public information",
                    examples=["Buy stock before the earnings announcement", "I heard they're about to merge"],
                ),
                DeniedTopic(
                    name="Market Manipulation",
                    definition="Strategies or techniques for artificially influencing security prices",
                    examples=["How to pump and dump a stock", "Coordinating trades to move the price"],
                ),
                DeniedTopic(
                    name="Unauthorized Financial Advice",
                    definition="Specific investment recommendations without proper licensing or disclaimers",
                    examples=["You should definitely buy this stock", "Put all your money into crypto"],
                ),
            ],
        ),
    ),
    GuardrailPreset(
        id="customer-service",
        name="Customer Service",
        description="Moderate filtering with PII anonymization — ideal for customer-facing AI assistants in banking and insurance.",
        tags=["customer-facing", "banking", "insurance"],
        config=GuardrailTemplateCreate(
            name="Customer Service Guardrail",
            description="Balanced guardrail for customer-facing applications with PII anonymization",
            content_filters=[
                ContentFilterConfig(type=FilterType.HATE, input_strength=FilterStrength.MEDIUM, output_strength=FilterStrength.HIGH),
                ContentFilterConfig(type=FilterType.INSULTS, input_strength=FilterStrength.LOW, output_strength=FilterStrength.HIGH),
                ContentFilterConfig(type=FilterType.SEXUAL, input_strength=FilterStrength.HIGH, output_strength=FilterStrength.HIGH),
                ContentFilterConfig(type=FilterType.VIOLENCE, input_strength=FilterStrength.MEDIUM, output_strength=FilterStrength.HIGH),
                ContentFilterConfig(type=FilterType.MISCONDUCT, input_strength=FilterStrength.MEDIUM, output_strength=FilterStrength.HIGH),
                ContentFilterConfig(type=FilterType.PROMPT_ATTACK, input_strength=FilterStrength.HIGH, output_strength=FilterStrength.NONE),
            ],
            pii_entities=[
                PiiEntityConfig(type=PiiEntityType.EMAIL, action=PiiAction.ANONYMIZE),
                PiiEntityConfig(type=PiiEntityType.PHONE, action=PiiAction.ANONYMIZE),
                PiiEntityConfig(type=PiiEntityType.ADDRESS, action=PiiAction.ANONYMIZE),
                PiiEntityConfig(type=PiiEntityType.SSN, action=PiiAction.BLOCK),
                PiiEntityConfig(type=PiiEntityType.CREDIT_DEBIT_CARD_NUMBER, action=PiiAction.BLOCK),
            ],
            word_filter=WordFilterConfig(enable_profanity=True, blocked_words=[]),
            contextual_grounding=ContextualGroundingConfig(enabled=True, grounding_threshold=0.7, relevance_threshold=0.7),
        ),
    ),
]


class GuardrailService:
    # Class-level sync state for auto-discovery
    _last_sync_time: float = 0
    _sync_lock = threading.Lock()
    _SYNC_INTERVAL_SECONDS = 300  # 5 minutes between auto-syncs

    def __init__(self, table_name: str = "fsi-control-plane-guardrails", region: str = "us-east-1", auto_sync: bool = True):
        self.table_name = table_name
        self.region = region
        self.dynamodb = boto3.resource("dynamodb", region_name=region)
        self.table = self.dynamodb.Table(table_name)
        self.bedrock_client = boto3.client("bedrock", region_name=region)
        self.cloudwatch_client = boto3.client("cloudwatch", region_name=region)

        # Auto-sync on first initialization if enabled
        if auto_sync:
            self._maybe_auto_sync()

    def _maybe_auto_sync(self) -> bool:
        """Run auto-sync if enough time has passed since last sync.

        Returns True if sync was run, False if skipped (too recent).
        Thread-safe via lock to prevent concurrent syncs.
        """
        now = time.time()
        with GuardrailService._sync_lock:
            if now - GuardrailService._last_sync_time < GuardrailService._SYNC_INTERVAL_SECONDS:
                return False
            GuardrailService._last_sync_time = now

        # Run sync outside the lock to not block other requests
        try:
            logger.debug("Running auto-sync with AWS Bedrock guardrails...")
            result = self.discover_aws_guardrails()
            if result.get("success"):
                synced = result.get("synced", 0)
                discovered = result.get("discovered", 0)
                if synced > 0:
                    logger.info(f"Auto-sync: imported {synced} new guardrails from AWS (total {discovered} in AWS)")
                else:
                    logger.debug(f"Auto-sync: all {discovered} AWS guardrails already tracked")
            return True
        except Exception as e:
            logger.warning(f"Auto-sync failed (non-fatal): {e}")
            return False

    # --- DynamoDB helpers ---

    def _to_item(self, template: GuardrailTemplate) -> dict:
        data = template.model_dump()
        data["pk"] = f"GUARDRAIL#{template.template_id}"
        data["sk"] = "META"
        # Convert enums to strings and floats to Decimal for DynamoDB
        return json.loads(json.dumps(data, default=str), parse_float=Decimal)

    def _from_item(self, item: dict) -> GuardrailTemplate:
        item.pop("pk", None)
        item.pop("sk", None)
        return GuardrailTemplate(**item)

    def _add_status(self, template: GuardrailTemplate, status: GuardrailStatus, message: str = ""):
        now = datetime.utcnow().isoformat()
        template.status = status
        template.updated_at = now
        template.status_history.append(
            StatusHistoryEntry(status=status.value, timestamp=now, message=message)
        )

    # --- CRUD ---

    def create_template(self, req: GuardrailTemplateCreate, created_by: str = "system") -> GuardrailTemplate:
        template = GuardrailTemplate(
            name=req.name,
            description=req.description,
            content_filters=req.content_filters,
            denied_topics=req.denied_topics,
            pii_entities=req.pii_entities,
            sensitive_regexes=req.sensitive_regexes,
            word_filter=req.word_filter,
            contextual_grounding=req.contextual_grounding,
            created_by=created_by,
        )
        self._add_status(template, GuardrailStatus.CREATING, "Creating Bedrock guardrail")

        try:
            result = self._create_bedrock_guardrail(template)
            template.guardrail_id = result["guardrailId"]
            template.guardrail_arn = result["guardrailArn"]
            template.guardrail_version = result.get("version", "DRAFT")
            self._add_status(template, GuardrailStatus.ACTIVE, "Guardrail created successfully")
        except Exception as e:
            logger.error(f"Failed to create Bedrock guardrail: {e}")
            self._add_status(template, GuardrailStatus.FAILED, f"Bedrock API error: {str(e)[:200]}")
            # Don't persist an orphaned record — no Bedrock guardrail was created.
            # The route surfaces the FAILED status as an error; nothing is stored.
            return template

        self.table.put_item(Item=self._to_item(template))
        logger.info(f"Created guardrail template {template.template_id} (bedrock_id={template.guardrail_id})")
        return template

    def get_template(self, template_id: str) -> Optional[GuardrailTemplate]:
        resp = self.table.get_item(Key={"pk": f"GUARDRAIL#{template_id}", "sk": "META"})
        item = resp.get("Item")
        if not item:
            return None
        return self._from_item(item)

    def list_templates(self, status: Optional[GuardrailStatus] = None, auto_sync: bool = True) -> List[GuardrailTemplate]:
        # Auto-sync from AWS before listing (rate-limited to every 5 min)
        if auto_sync:
            self._maybe_auto_sync()

        # Scan with filter — acceptable for control plane (low cardinality)
        scan_kwargs: Dict = {}
        if status:
            scan_kwargs["FilterExpression"] = boto3.dynamodb.conditions.Attr("status").eq(status.value)

        # Filter to only guardrail items
        from boto3.dynamodb.conditions import Key, Attr
        scan_kwargs["FilterExpression"] = Attr("pk").begins_with("GUARDRAIL#")
        if status:
            scan_kwargs["FilterExpression"] = scan_kwargs["FilterExpression"] & Attr("status").eq(status.value)

        resp = self.table.scan(**scan_kwargs)
        items = resp.get("Items", [])
        templates = [self._from_item(item) for item in items]
        templates.sort(key=lambda t: t.created_at, reverse=True)
        return templates

    def update_template(self, template_id: str, req: GuardrailTemplateUpdate) -> Optional[GuardrailTemplate]:
        template = self.get_template(template_id)
        if not template:
            return None

        # Apply updates
        update_data = req.model_dump(exclude_none=True)
        for field, value in update_data.items():
            setattr(template, field, value)

        if template.guardrail_id and template.status == GuardrailStatus.ACTIVE:
            self._add_status(template, GuardrailStatus.UPDATING, "Updating Bedrock guardrail")
            try:
                self._update_bedrock_guardrail(template)
                self._add_status(template, GuardrailStatus.ACTIVE, "Guardrail updated successfully")
            except Exception as e:
                logger.error(f"Failed to update Bedrock guardrail: {e}")
                self._add_status(template, GuardrailStatus.FAILED, f"Update error: {str(e)[:200]}")

        self.table.put_item(Item=self._to_item(template))
        return template

    def delete_template(self, template_id: str) -> Optional[GuardrailTemplate]:
        template = self.get_template(template_id)
        if not template:
            return None

        if template.guardrail_id:
            self._add_status(template, GuardrailStatus.DELETING, "Deleting Bedrock guardrail")
            try:
                self._delete_bedrock_guardrail(template.guardrail_id)
                self._add_status(template, GuardrailStatus.DELETED, "Guardrail deleted")
            except Exception as e:
                logger.error(f"Failed to delete Bedrock guardrail: {e}")
                self._add_status(template, GuardrailStatus.FAILED, f"Delete error: {str(e)[:200]}")
        else:
            self._add_status(template, GuardrailStatus.DELETED, "Draft deleted")

        self.table.put_item(Item=self._to_item(template))
        return template

    def publish_version(self, template_id: str) -> Optional[GuardrailTemplate]:
        template = self.get_template(template_id)
        if not template or not template.guardrail_id:
            return None

        try:
            resp = self.bedrock_client.create_guardrail_version(
                guardrailIdentifier=template.guardrail_id,
                description=f"Published from AVA control plane at {datetime.utcnow().isoformat()}"
            )
            template.guardrail_version = resp.get("version", template.guardrail_version)
            self._add_status(template, GuardrailStatus.ACTIVE, f"Published version {template.guardrail_version}")
        except Exception as e:
            logger.error(f"Failed to publish guardrail version: {e}")
            self._add_status(template, GuardrailStatus.FAILED, f"Publish error: {str(e)[:200]}")

        self.table.put_item(Item=self._to_item(template))
        return template

    # --- Bedrock SDK integration ---

    def _build_bedrock_params(self, template: GuardrailTemplate) -> dict:
        # Bedrock guardrail name must match [0-9a-zA-Z-_]+ (no spaces or
        # punctuation) and description must be <= 200 chars. Template names
        # contain spaces/em-dashes/commas, so sanitize hard and truncate.
        name_slug = re.sub(r"[^0-9a-zA-Z]+", "-", template.name)[:30].strip("-").lower()
        safe_name = f"ava-{template.template_id[:8]}-{name_slug}".strip("-")[:63]
        raw_desc = template.description or f"AVA Guardrail: {template.name}"
        safe_desc = raw_desc[:200]
        params: Dict = {
            "name": safe_name,
            "description": safe_desc,
            "blockedInputMessaging": "Your request was blocked by the guardrail policy. Please rephrase your input.",
            "blockedOutputsMessaging": "The response was blocked by the guardrail policy as it may contain restricted content.",
        }

        # Content policy
        if template.content_filters:
            filters = []
            for cf in template.content_filters:
                f = {
                    "type": cf.type.value,
                    "inputStrength": cf.input_strength.value,
                    "outputStrength": cf.output_strength.value,
                }
                # PROMPT_ATTACK output must be NONE
                if cf.type == FilterType.PROMPT_ATTACK:
                    f["outputStrength"] = "NONE"
                filters.append(f)
            params["contentPolicyConfig"] = {"filtersConfig": filters}

        # Topic policy
        if template.denied_topics:
            topics = []
            for topic in template.denied_topics:
                t = {
                    "name": topic.name,
                    "definition": topic.definition,
                    "type": "DENY",
                }
                if topic.examples:
                    t["examples"] = topic.examples[:5]  # Bedrock allows max 5 examples
                topics.append(t)
            params["topicPolicyConfig"] = {"topicsConfig": topics}

        # Sensitive information policy (PII + regex)
        pii_config = []
        regex_config = []

        # Valid Bedrock PII entity types (filter out legacy/invalid ones)
        VALID_BEDROCK_PII_TYPES = {
            "NAME", "EMAIL", "PHONE", "ADDRESS", "AGE", "USERNAME", "PASSWORD",
            "DRIVER_ID", "LICENSE_PLATE", "US_SOCIAL_SECURITY_NUMBER", "US_PASSPORT_NUMBER",
            "CREDIT_DEBIT_CARD_NUMBER", "CREDIT_DEBIT_CARD_CVV", "CREDIT_DEBIT_CARD_EXPIRY",
            "PIN", "SWIFT_CODE", "INTERNATIONAL_BANK_ACCOUNT_NUMBER",
            "IP_ADDRESS", "MAC_ADDRESS", "URL", "AWS_ACCESS_KEY", "AWS_SECRET_KEY",
            "US_BANK_ACCOUNT_NUMBER", "US_BANK_ROUTING_NUMBER", "CA_HEALTH_NUMBER",
            "CA_SOCIAL_INSURANCE_NUMBER", "UK_NATIONAL_HEALTH_SERVICE_NUMBER",
            "UK_NATIONAL_INSURANCE_NUMBER", "UK_UNIQUE_TAXPAYER_REFERENCE_NUMBER",
            "US_INDIVIDUAL_TAX_IDENTIFICATION_NUMBER", "VEHICLE_IDENTIFICATION_NUMBER",
        }

        if template.pii_entities:
            for entity in template.pii_entities:
                if entity.type.value not in VALID_BEDROCK_PII_TYPES:
                    logger.warning(f"Skipping invalid PII type for Bedrock API: {entity.type.value}")
                    continue
                pii_config.append({
                    "type": entity.type.value,
                    "action": entity.action.value,
                })

        if template.sensitive_regexes:
            for regex in template.sensitive_regexes:
                r = {
                    "name": regex.name,
                    "pattern": regex.pattern,
                    "action": regex.action.value,
                }
                if regex.description:
                    r["description"] = regex.description
                regex_config.append(r)

        if pii_config or regex_config:
            si_config: Dict = {}
            if pii_config:
                si_config["piiEntitiesConfig"] = pii_config
            if regex_config:
                si_config["regexesConfig"] = regex_config
            params["sensitiveInformationPolicyConfig"] = si_config

        # Word policy
        if template.word_filter:
            word_config: Dict = {}
            if template.word_filter.enable_profanity:
                word_config["managedWordListsConfig"] = [{"type": "PROFANITY"}]
            if template.word_filter.blocked_words:
                word_config["wordsConfig"] = [{"text": w} for w in template.word_filter.blocked_words]
            if word_config:
                params["wordPolicyConfig"] = word_config

        # Contextual grounding
        if template.contextual_grounding and template.contextual_grounding.enabled:
            params["contextualGroundingPolicyConfig"] = {
                "filtersConfig": [
                    {"type": "GROUNDING", "threshold": template.contextual_grounding.grounding_threshold},
                    {"type": "RELEVANCE", "threshold": template.contextual_grounding.relevance_threshold},
                ]
            }

        return params

    def _create_bedrock_guardrail(self, template: GuardrailTemplate) -> dict:
        params = self._build_bedrock_params(template)
        resp = self.bedrock_client.create_guardrail(**params)
        return resp

    def _update_bedrock_guardrail(self, template: GuardrailTemplate):
        params = self._build_bedrock_params(template)
        params["guardrailIdentifier"] = template.guardrail_id
        # Remove 'name' from update — cannot change name after creation
        params.pop("name", None)
        self.bedrock_client.update_guardrail(**params)

    def _delete_bedrock_guardrail(self, guardrail_id: str):
        self.bedrock_client.delete_guardrail(guardrailIdentifier=guardrail_id)

    # --- Observability ---

    def get_metrics(self, guardrail_id: str, hours: int = 24) -> GuardrailMetrics:
        """Get guardrail metrics from CloudWatch"""
        end_time = datetime.utcnow()
        start_time = end_time - timedelta(hours=hours)

        metrics = GuardrailMetrics(guardrail_id=guardrail_id)

        try:
            # Get invocation count
            resp = self.cloudwatch_client.get_metric_statistics(
                Namespace="AWS/Bedrock/Guardrails",
                MetricName="Invocations",
                Dimensions=[{"Name": "GuardrailId", "Value": guardrail_id}],
                StartTime=start_time,
                EndTime=end_time,
                Period=3600,
                Statistics=["Sum"],
            )
            for dp in resp.get("Datapoints", []):
                metrics.total_invocations += int(dp.get("Sum", 0))
                metrics.time_series.append({
                    "timestamp": dp["Timestamp"].isoformat(),
                    "invocations": int(dp.get("Sum", 0)),
                })

            # Get blocked count
            resp = self.cloudwatch_client.get_metric_statistics(
                Namespace="AWS/Bedrock/Guardrails",
                MetricName="InvocationsBlocked",
                Dimensions=[{"Name": "GuardrailId", "Value": guardrail_id}],
                StartTime=start_time,
                EndTime=end_time,
                Period=3600,
                Statistics=["Sum"],
            )
            for dp in resp.get("Datapoints", []):
                metrics.blocked_count += int(dp.get("Sum", 0))

            metrics.allowed_count = metrics.total_invocations - metrics.blocked_count
            if metrics.total_invocations > 0:
                metrics.block_rate = round(metrics.blocked_count / metrics.total_invocations * 100, 1)

            # Sort time series
            metrics.time_series.sort(key=lambda x: x["timestamp"])

        except Exception as e:
            logger.warning(f"Failed to fetch CloudWatch metrics for guardrail {guardrail_id}: {e}")

        return metrics

    # --- Presets ---

    def get_presets(self) -> List[GuardrailPreset]:
        return FSI_PRESETS

    # --- Discovery & Sync ---

    def discover_aws_guardrails(self) -> dict:
        """Discover Bedrock Guardrails in AWS and sync to inventory.

        Lists all guardrails in the AWS account and imports any that aren't
        already tracked in DynamoDB. Returns a summary of discovered vs synced.

        This is called automatically:
        - On service initialization
        - Before list_templates() (rate-limited to every 5 minutes)
        - Can also be called manually via POST /api/v1/guardrails/discover
        """
        discovered = []
        synced = []
        already_tracked = []
        errors = []

        try:
            # Get all existing guardrail_ids we already track (skip auto_sync to avoid recursion)
            existing = self.list_templates(auto_sync=False)
            tracked_ids = {t.guardrail_id for t in existing if t.guardrail_id}

            # List all Bedrock guardrails in the account
            paginator_token = None
            while True:
                kwargs = {"maxResults": 50}
                if paginator_token:
                    kwargs["nextToken"] = paginator_token
                resp = self.bedrock_client.list_guardrails(**kwargs)

                for g in resp.get("guardrails", []):
                    gid = g.get("id")
                    name = g.get("name", "")
                    status = g.get("status", "")
                    version = g.get("version", "DRAFT")
                    arn = g.get("arn", "")
                    created = g.get("createdAt")

                    discovered.append({
                        "guardrail_id": gid,
                        "name": name,
                        "status": status,
                        "version": version,
                    })

                    if gid in tracked_ids:
                        already_tracked.append(gid)
                        continue

                    # Import this guardrail into our inventory
                    try:
                        # Fetch full details to get configuration
                        details = self.bedrock_client.get_guardrail(
                            guardrailIdentifier=gid,
                            guardrailVersion=version if version != "DRAFT" else "DRAFT"
                        )

                        # Create a template record for it
                        template = GuardrailTemplate(
                            name=name,
                            description=details.get("description", f"Imported from AWS: {name}"),
                            guardrail_id=gid,
                            guardrail_arn=arn,
                            guardrail_version=version,
                            created_by="aws-discovery",
                        )

                        # Parse content filters if present
                        content_policy = details.get("contentPolicy", {})
                        if content_policy.get("filters"):
                            template.content_filters = [
                                ContentFilterConfig(
                                    type=FilterType(f.get("type", "HATE")),
                                    input_strength=FilterStrength(f.get("inputStrength", "MEDIUM")),
                                    output_strength=FilterStrength(f.get("outputStrength", "MEDIUM")),
                                )
                                for f in content_policy["filters"]
                                if f.get("type") in [ft.value for ft in FilterType]
                            ]

                        # Parse denied topics if present
                        topic_policy = details.get("topicPolicy", {})
                        if topic_policy.get("topics"):
                            template.denied_topics = [
                                DeniedTopic(
                                    name=t.get("name", ""),
                                    definition=t.get("definition", ""),
                                    examples=t.get("examples", []),
                                )
                                for t in topic_policy["topics"]
                                if t.get("type") == "DENY"
                            ]

                        # Parse PII config if present
                        sensitive_policy = details.get("sensitiveInformationPolicy", {})
                        if sensitive_policy.get("piiEntities"):
                            template.pii_entities = []
                            for p in sensitive_policy["piiEntities"]:
                                try:
                                    template.pii_entities.append(
                                        PiiEntityConfig(
                                            type=PiiEntityType(p.get("type", "NAME")),
                                            action=PiiAction(p.get("action", "ANONYMIZE")),
                                        )
                                    )
                                except ValueError:
                                    pass  # Skip unknown PII types

                        # Parse word filter if present
                        word_policy = details.get("wordPolicy", {})
                        if word_policy:
                            managed = word_policy.get("managedWordLists", [])
                            words = word_policy.get("words", [])
                            template.word_filter = WordFilterConfig(
                                enable_profanity=any(m.get("type") == "PROFANITY" for m in managed),
                                blocked_words=[w.get("text", "") for w in words if w.get("text")],
                            )

                        # Set status based on Bedrock status
                        bedrock_status = status.upper()
                        if bedrock_status == "READY":
                            self._add_status(template, GuardrailStatus.ACTIVE, "Imported from AWS Bedrock")
                        elif bedrock_status == "CREATING":
                            self._add_status(template, GuardrailStatus.CREATING, "Discovered in creating state")
                        elif bedrock_status == "FAILED":
                            self._add_status(template, GuardrailStatus.FAILED, "Discovered in failed state")
                        else:
                            self._add_status(template, GuardrailStatus.DRAFT, f"Imported with status: {bedrock_status}")

                        # Save to DynamoDB
                        self.table.put_item(Item=self._to_item(template))
                        synced.append({
                            "guardrail_id": gid,
                            "name": name,
                            "template_id": template.template_id,
                        })
                        logger.info(f"Synced AWS guardrail {gid} ({name}) -> template {template.template_id}")

                    except Exception as e:
                        logger.warning(f"Failed to import guardrail {gid}: {e}")
                        errors.append({"guardrail_id": gid, "error": str(e)[:200]})

                paginator_token = resp.get("nextToken")
                if not paginator_token:
                    break

        except Exception as e:
            logger.error(f"Failed to discover AWS guardrails: {e}")
            return {
                "success": False,
                "error": str(e),
                "discovered": 0,
                "synced": 0,
            }

        return {
            "success": True,
            "discovered": len(discovered),
            "synced": len(synced),
            "already_tracked": len(already_tracked),
            "errors": len(errors),
            "details": {
                "discovered": discovered,
                "synced": synced,
                "already_tracked": already_tracked,
                "errors": errors,
            },
        }
