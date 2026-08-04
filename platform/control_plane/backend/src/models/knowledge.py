"""Knowledge models — schemas for discovery and registration APIs."""

from pydantic import BaseModel, Field


# -----------------------------------------------------------------------------
# Discovery — Glue Catalog
# -----------------------------------------------------------------------------

class GlueTable(BaseModel):
    name: str
    table_type: str = ""


class GlueDatabase(BaseModel):
    name: str
    description: str = ""
    tables: list[GlueTable] = []


class GlueDatabaseListResponse(BaseModel):
    databases: list[GlueDatabase]


# -----------------------------------------------------------------------------
# Discovery — Athena
# -----------------------------------------------------------------------------

class AthenaWorkgroup(BaseModel):
    name: str
    state: str


class AthenaWorkgroupListResponse(BaseModel):
    workgroups: list[AthenaWorkgroup]


# -----------------------------------------------------------------------------
# Registration
# -----------------------------------------------------------------------------

class DataLakeConfig(BaseModel):
    databases: list[str] = Field(..., min_length=1)
    athena_workgroup: str = Field(..., min_length=1)


class KnowledgeBaseConfig(BaseModel):
    knowledge_base_id: str = Field(..., min_length=1)
    model_id: str = Field(default="us.anthropic.claude-sonnet-4-20250514-v2:0")


class KnowledgeRegistrationCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    type: str = "data_lake"  # "data_lake" | "knowledge_base"
    description: str = ""
    config: dict  # DataLakeConfig or KnowledgeBaseConfig fields as dict


class KnowledgeRegistration(BaseModel):
    registration_id: str
    name: str
    type: str
    description: str = ""
    status: str  # PROVISIONING | ACTIVE | FAILED | DELETING
    config: dict = {}
    gateway_endpoint: str = ""
    tools: list[str] = []
    mcp_server: str = ""
    iam_role_arn: str = ""
    runtime_id: str = ""
    gateway_id: str = ""
    target_id: str = ""
    error_message: str = ""
    created_at: str = ""
    updated_at: str = ""


class KnowledgeRegistrationListResponse(BaseModel):
    registrations: list[KnowledgeRegistration]
    total: int
