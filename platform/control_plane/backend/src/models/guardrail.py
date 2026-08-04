"""Guardrail template data models"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from enum import Enum
from datetime import datetime
import uuid


class GuardrailStatus(str, Enum):
    DRAFT = "draft"
    CREATING = "creating"
    ACTIVE = "active"
    UPDATING = "updating"
    FAILED = "failed"
    DELETING = "deleting"
    DELETED = "deleted"


class FilterStrength(str, Enum):
    NONE = "NONE"
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class FilterType(str, Enum):
    HATE = "HATE"
    INSULTS = "INSULTS"
    SEXUAL = "SEXUAL"
    VIOLENCE = "VIOLENCE"
    MISCONDUCT = "MISCONDUCT"
    PROMPT_ATTACK = "PROMPT_ATTACK"


class PiiAction(str, Enum):
    BLOCK = "BLOCK"
    ANONYMIZE = "ANONYMIZE"


class PiiEntityType(str, Enum):
    # Financial
    CREDIT_DEBIT_CARD_NUMBER = "CREDIT_DEBIT_CARD_NUMBER"
    CREDIT_DEBIT_CARD_CVV = "CREDIT_DEBIT_CARD_CVV"
    CREDIT_DEBIT_CARD_EXPIRY = "CREDIT_DEBIT_CARD_EXPIRY"
    PIN = "PIN"
    SWIFT_CODE = "SWIFT_CODE"
    INTERNATIONAL_BANK_ACCOUNT_NUMBER = "INTERNATIONAL_BANK_ACCOUNT_NUMBER"
    US_BANK_ACCOUNT_NUMBER = "US_BANK_ACCOUNT_NUMBER"
    US_BANK_ROUTING_NUMBER = "US_BANK_ROUTING_NUMBER"
    # Personal
    NAME = "NAME"
    EMAIL = "EMAIL"
    PHONE = "PHONE"
    ADDRESS = "ADDRESS"
    AGE = "AGE"
    SSN = "US_SOCIAL_SECURITY_NUMBER"
    US_PASSPORT_NUMBER = "US_PASSPORT_NUMBER"
    DRIVER_ID = "DRIVER_ID"
    LICENSE_PLATE = "LICENSE_PLATE"
    # Legacy (kept for backward compat with existing DynamoDB records, filtered before Bedrock API calls)
    DATE_TIME = "DATE_TIME"
    PASSPORT_NUMBER = "PASSPORT_NUMBER"
    # Technical
    IP_ADDRESS = "IP_ADDRESS"
    MAC_ADDRESS = "MAC_ADDRESS"
    URL = "URL"
    USERNAME = "USERNAME"
    PASSWORD = "PASSWORD"
    AWS_ACCESS_KEY = "AWS_ACCESS_KEY"
    AWS_SECRET_KEY = "AWS_SECRET_KEY"


# --- Configuration sub-models ---

class ContentFilterConfig(BaseModel):
    type: FilterType
    input_strength: FilterStrength = FilterStrength.MEDIUM
    output_strength: FilterStrength = FilterStrength.MEDIUM


class DeniedTopic(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    # Optional at the schema level so the create route can return a friendly
    # 400 ("topic X needs a definition") instead of an opaque 422. Bedrock
    # still requires it — the route validates presence before calling AWS.
    definition: Optional[str] = Field(default=None, max_length=500)
    examples: List[str] = Field(default_factory=list)


class PiiEntityConfig(BaseModel):
    type: PiiEntityType
    action: PiiAction = PiiAction.ANONYMIZE


class SensitiveRegexConfig(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    pattern: str = Field(..., min_length=1)
    description: Optional[str] = None
    action: PiiAction = PiiAction.BLOCK


class WordFilterConfig(BaseModel):
    enable_profanity: bool = True
    blocked_words: List[str] = Field(default_factory=list)


class ContextualGroundingConfig(BaseModel):
    enabled: bool = False
    grounding_threshold: float = Field(default=0.7, ge=0.0, le=1.0)
    relevance_threshold: float = Field(default=0.7, ge=0.0, le=1.0)


# --- Request/Response models ---

class GuardrailTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    content_filters: List[ContentFilterConfig] = Field(default_factory=list)
    denied_topics: List[DeniedTopic] = Field(default_factory=list)
    pii_entities: List[PiiEntityConfig] = Field(default_factory=list)
    sensitive_regexes: List[SensitiveRegexConfig] = Field(default_factory=list)
    word_filter: Optional[WordFilterConfig] = None
    contextual_grounding: Optional[ContextualGroundingConfig] = None


class GuardrailTemplateUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    content_filters: Optional[List[ContentFilterConfig]] = None
    denied_topics: Optional[List[DeniedTopic]] = None
    pii_entities: Optional[List[PiiEntityConfig]] = None
    sensitive_regexes: Optional[List[SensitiveRegexConfig]] = None
    word_filter: Optional[WordFilterConfig] = None
    contextual_grounding: Optional[ContextualGroundingConfig] = None


class StatusHistoryEntry(BaseModel):
    status: str
    timestamp: str
    message: Optional[str] = None


class GuardrailTemplate(BaseModel):
    template_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    status: GuardrailStatus = GuardrailStatus.DRAFT
    guardrail_id: Optional[str] = None
    guardrail_arn: Optional[str] = None
    guardrail_version: Optional[str] = None
    content_filters: List[ContentFilterConfig] = Field(default_factory=list)
    denied_topics: List[DeniedTopic] = Field(default_factory=list)
    pii_entities: List[PiiEntityConfig] = Field(default_factory=list)
    sensitive_regexes: List[SensitiveRegexConfig] = Field(default_factory=list)
    word_filter: Optional[WordFilterConfig] = None
    contextual_grounding: Optional[ContextualGroundingConfig] = None
    status_history: List[StatusHistoryEntry] = Field(default_factory=list)
    created_by: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class GuardrailPreset(BaseModel):
    id: str
    name: str
    description: str
    tags: List[str] = Field(default_factory=list)
    config: GuardrailTemplateCreate


class GuardrailEvent(BaseModel):
    timestamp: str
    guardrail_id: str
    guardrail_name: Optional[str] = None
    action: str  # BLOCKED, ALLOWED, ANONYMIZED
    filter_type: Optional[str] = None
    input_snippet: Optional[str] = None
    details: Optional[Dict[str, Any]] = None


class GuardrailMetrics(BaseModel):
    guardrail_id: str
    total_invocations: int = 0
    blocked_count: int = 0
    allowed_count: int = 0
    anonymized_count: int = 0
    block_rate: float = 0.0
    top_triggered_filter: Optional[str] = None
    filter_breakdown: Dict[str, int] = Field(default_factory=dict)
    time_series: List[Dict[str, Any]] = Field(default_factory=list)
    recent_events: List[GuardrailEvent] = Field(default_factory=list)
