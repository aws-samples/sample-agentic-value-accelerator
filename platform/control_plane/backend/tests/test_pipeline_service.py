"""
Property-Based Tests for CodeBuild Environment Variables

# Feature: cicd-deployment-pipeline, Property 5: CodeBuild environment variables include all required keys and user parameters

Uses Hypothesis to verify that PipelineService._build_codebuild_env_vars
produces an environment variable list containing entries for AWS_ACCOUNT,
AWS_REGION, DEPLOYMENT_ID, TEMPLATE_ID, IAC_TYPE, and one entry for each
key in the user's parameters dictionary.

**Validates: Requirements 1.4, 2.2**
"""

import os
import sys
import importlib.util
from unittest.mock import MagicMock

from hypothesis import given, strategies as st, settings

# ---------------------------------------------------------------------------
# Inject a mock boto3 module so pipeline_service.py can be loaded without
# a real boto3 installation in the test environment.
# ---------------------------------------------------------------------------
_mock_boto3 = MagicMock()
_had_boto3 = "boto3" in sys.modules
_original_boto3 = sys.modules.get("boto3")
sys.modules["boto3"] = _mock_boto3

# ---------------------------------------------------------------------------
# Import the Deployment model via importlib to avoid Settings() chain issues.
# ---------------------------------------------------------------------------
_deployment_path = os.path.join(
    os.path.dirname(__file__), os.pardir, "src", "models", "deployment.py"
)
_dep_spec = importlib.util.spec_from_file_location(
    "deployment", os.path.abspath(_deployment_path)
)
_deployment_mod = importlib.util.module_from_spec(_dep_spec)
_dep_spec.loader.exec_module(_deployment_mod)

Deployment = _deployment_mod.Deployment

# ---------------------------------------------------------------------------
# We also need the Template model on sys.modules so pipeline_service can
# resolve its `from models.template import Template` import.
# ---------------------------------------------------------------------------
_template_path = os.path.join(
    os.path.dirname(__file__), os.pardir, "src", "models", "template.py"
)
if os.path.exists(_template_path):
    _tpl_spec = importlib.util.spec_from_file_location(
        "models.template", os.path.abspath(_template_path)
    )
    _template_mod = importlib.util.module_from_spec(_tpl_spec)
    sys.modules["models.template"] = _template_mod
    _tpl_spec.loader.exec_module(_template_mod)

# Put the deployment module on sys.modules so pipeline_service resolves it
sys.modules["models.deployment"] = _deployment_mod

# ---------------------------------------------------------------------------
# Import PipelineService via importlib.
# ---------------------------------------------------------------------------
_pipeline_service_path = os.path.join(
    os.path.dirname(__file__), os.pardir, "src", "services", "pipeline_service.py"
)
_ps_spec = importlib.util.spec_from_file_location(
    "pipeline_service", os.path.abspath(_pipeline_service_path)
)
_pipeline_service_mod = importlib.util.module_from_spec(_ps_spec)
_ps_spec.loader.exec_module(_pipeline_service_mod)

# Restore original boto3 state
if _had_boto3:
    sys.modules["boto3"] = _original_boto3
else:
    del sys.modules["boto3"]

PipelineService = _pipeline_service_mod.PipelineService


# ---------------------------------------------------------------------------
# Hypothesis strategies
# ---------------------------------------------------------------------------

# AWS account IDs: 12-digit numeric strings
aws_account_strategy = st.from_regex(r"[0-9]{12}", fullmatch=True)

# AWS region names
aws_region_strategy = st.sampled_from([
    "us-east-1", "us-west-2", "eu-west-1", "ap-southeast-1", "eu-central-1",
])

# Non-empty identifier strings for deployment_id and template_id
identifier_strategy = st.text(
    min_size=1,
    max_size=80,
    alphabet=st.characters(whitelist_categories=("L", "N"), whitelist_characters="-_"),
)

# IaC type
iac_type_strategy = st.sampled_from(["terraform", "cdk", "cloudformation"])

# User parameter keys: valid env-var-style names (letters, digits, underscores)
param_key_strategy = st.from_regex(r"[A-Za-z][A-Za-z0-9_]{0,39}", fullmatch=True)

# User parameter values: arbitrary non-empty strings
param_value_strategy = st.text(min_size=1, max_size=100)

# Dictionary of user-provided parameters (0 to 10 entries)
user_params_strategy = st.dictionaries(
    keys=param_key_strategy,
    values=param_value_strategy,
    min_size=0,
    max_size=10,
)

# Required env var names that must always be present
REQUIRED_ENV_VAR_NAMES = {"AWS_ACCOUNT", "AWS_REGION", "DEPLOYMENT_ID", "TEMPLATE_ID", "IAC_TYPE"}


def _make_deployment(
    aws_account: str,
    aws_region: str,
    deployment_id: str,
    template_id: str,
    iac_type: str,
    parameters: dict,
) -> Deployment:
    """Create a Deployment instance with the given fields."""
    return Deployment(
        deployment_id=deployment_id,
        deployment_name="test-deploy",
        template_id=template_id,
        iac_type=iac_type,
        aws_account=aws_account,
        aws_region=aws_region,
        s3_bucket="test-bucket",
        parameters=parameters,
    )


class TestCodeBuildEnvVars:
    """Property 5: CodeBuild environment variables include all required keys and user parameters.

    For any deployment with any set of user-provided parameters, the constructed
    CodeBuild environment variable list should contain entries for AWS_ACCOUNT,
    AWS_REGION, DEPLOYMENT_ID, TEMPLATE_ID, IAC_TYPE, and one entry for each
    key in the user's parameters dictionary.

    **Validates: Requirements 1.4, 2.2**
    """

    # Feature: cicd-deployment-pipeline, Property 5: CodeBuild environment variables include all required keys and user parameters

    @settings(max_examples=100)
    @given(
        aws_account=aws_account_strategy,
        aws_region=aws_region_strategy,
        deployment_id=identifier_strategy,
        template_id=identifier_strategy,
        iac_type=iac_type_strategy,
        parameters=user_params_strategy,
    )
    def test_env_vars_contain_all_required_keys(
        self,
        aws_account: str,
        aws_region: str,
        deployment_id: str,
        template_id: str,
        iac_type: str,
        parameters: dict,
    ):
        """All required env var keys must be present in the output list."""
        # Feature: cicd-deployment-pipeline, Property 5: CodeBuild environment variables include all required keys and user parameters

        deployment = _make_deployment(
            aws_account, aws_region, deployment_id, template_id, iac_type, parameters
        )
        env_vars = PipelineService._build_codebuild_env_vars(deployment)
        env_var_names = {ev["name"] for ev in env_vars}

        for required_name in REQUIRED_ENV_VAR_NAMES:
            assert required_name in env_var_names, (
                f"Required env var '{required_name}' missing from CodeBuild env vars"
            )

    @settings(max_examples=100)
    @given(
        aws_account=aws_account_strategy,
        aws_region=aws_region_strategy,
        deployment_id=identifier_strategy,
        template_id=identifier_strategy,
        iac_type=iac_type_strategy,
        parameters=user_params_strategy,
    )
    def test_env_vars_contain_all_user_parameter_keys(
        self,
        aws_account: str,
        aws_region: str,
        deployment_id: str,
        template_id: str,
        iac_type: str,
        parameters: dict,
    ):
        """Every user-provided parameter key must appear in the env var list."""
        # Feature: cicd-deployment-pipeline, Property 5: CodeBuild environment variables include all required keys and user parameters

        deployment = _make_deployment(
            aws_account, aws_region, deployment_id, template_id, iac_type, parameters
        )
        env_vars = PipelineService._build_codebuild_env_vars(deployment)
        env_var_names = {ev["name"] for ev in env_vars}

        for param_key in parameters:
            assert param_key in env_var_names, (
                f"User parameter '{param_key}' missing from CodeBuild env vars"
            )

    @settings(max_examples=100)
    @given(
        aws_account=aws_account_strategy,
        aws_region=aws_region_strategy,
        deployment_id=identifier_strategy,
        template_id=identifier_strategy,
        iac_type=iac_type_strategy,
        parameters=user_params_strategy,
    )
    def test_env_var_values_match_deployment_fields(
        self,
        aws_account: str,
        aws_region: str,
        deployment_id: str,
        template_id: str,
        iac_type: str,
        parameters: dict,
    ):
        """Required env var values must match the corresponding deployment fields."""
        # Feature: cicd-deployment-pipeline, Property 5: CodeBuild environment variables include all required keys and user parameters

        deployment = _make_deployment(
            aws_account, aws_region, deployment_id, template_id, iac_type, parameters
        )
        env_vars = PipelineService._build_codebuild_env_vars(deployment)
        env_map = {ev["name"]: ev["value"] for ev in env_vars}

        assert env_map["AWS_ACCOUNT"] == aws_account
        assert env_map["AWS_REGION"] == aws_region
        assert env_map["DEPLOYMENT_ID"] == deployment_id
        assert env_map["TEMPLATE_ID"] == template_id
        assert env_map["IAC_TYPE"] == iac_type

        for param_key, param_value in parameters.items():
            assert env_map[param_key] == str(param_value)

    @settings(max_examples=100)
    @given(
        aws_account=aws_account_strategy,
        aws_region=aws_region_strategy,
        deployment_id=identifier_strategy,
        template_id=identifier_strategy,
        iac_type=iac_type_strategy,
        parameters=user_params_strategy,
    )
    def test_env_var_count_matches_required_plus_user_params(
        self,
        aws_account: str,
        aws_region: str,
        deployment_id: str,
        template_id: str,
        iac_type: str,
        parameters: dict,
    ):
        """Total env var count should equal 5 required + number of user params."""
        # Feature: cicd-deployment-pipeline, Property 5: CodeBuild environment variables include all required keys and user parameters

        deployment = _make_deployment(
            aws_account, aws_region, deployment_id, template_id, iac_type, parameters
        )
        env_vars = PipelineService._build_codebuild_env_vars(deployment)

        expected_count = len(REQUIRED_ENV_VAR_NAMES) + len(parameters)
        assert len(env_vars) == expected_count, (
            f"Expected {expected_count} env vars, got {len(env_vars)}"
        )


# ---------------------------------------------------------------------------
# Property 7: Terraform backend configuration includes correct
# deployment-specific values
# ---------------------------------------------------------------------------

# Strategies for backend config inputs
bucket_name_strategy = st.text(
    min_size=3,
    max_size=63,
    alphabet=st.characters(whitelist_categories=("Ll", "N"), whitelist_characters="-"),
).filter(lambda s: s[0].isalpha())

lock_table_name_strategy = st.text(
    min_size=1,
    max_size=80,
    alphabet=st.characters(whitelist_categories=("L", "N"), whitelist_characters="-_"),
)

backend_region_strategy = st.sampled_from([
    "us-east-1", "us-west-2", "eu-west-1", "ap-southeast-1",
    "eu-central-1", "ap-northeast-1", "sa-east-1",
])

deployment_id_strategy = st.text(
    min_size=1,
    max_size=80,
    alphabet=st.characters(whitelist_categories=("L", "N"), whitelist_characters="-_"),
)


class TestTerraformBackendConfig:
    """Property 7: Terraform backend configuration includes correct deployment-specific values.

    For any deployment_id, state backend bucket name, lock table name, and AWS
    region, the generated terraform init backend configuration should contain
    the bucket name, the lock table name, a key path that includes the
    deployment_id, and the region — ensuring each deployment's state is isolated.

    **Validates: Requirements 3.1, 3.3**
    """

    # Feature: cicd-deployment-pipeline, Property 7: Terraform backend configuration includes correct deployment-specific values

    @settings(max_examples=100)
    @given(
        deployment_id=deployment_id_strategy,
        bucket_name=bucket_name_strategy,
        lock_table_name=lock_table_name_strategy,
        region=backend_region_strategy,
    )
    def test_backend_config_contains_bucket_name(
        self,
        deployment_id: str,
        bucket_name: str,
        lock_table_name: str,
        region: str,
    ):
        """The backend config string must contain the bucket name."""
        # Feature: cicd-deployment-pipeline, Property 7: Terraform backend configuration includes correct deployment-specific values

        config = PipelineService._build_terraform_backend_config(
            deployment_id, bucket_name, lock_table_name, region
        )
        assert f"bucket={bucket_name}" in config, (
            f"Bucket name '{bucket_name}' not found in backend config"
        )

    @settings(max_examples=100)
    @given(
        deployment_id=deployment_id_strategy,
        bucket_name=bucket_name_strategy,
        lock_table_name=lock_table_name_strategy,
        region=backend_region_strategy,
    )
    def test_backend_config_contains_lock_table_name(
        self,
        deployment_id: str,
        bucket_name: str,
        lock_table_name: str,
        region: str,
    ):
        """The backend config string must contain the DynamoDB lock table name."""
        # Feature: cicd-deployment-pipeline, Property 7: Terraform backend configuration includes correct deployment-specific values

        config = PipelineService._build_terraform_backend_config(
            deployment_id, bucket_name, lock_table_name, region
        )
        assert f"dynamodb_table={lock_table_name}" in config, (
            f"Lock table name '{lock_table_name}' not found in backend config"
        )

    @settings(max_examples=100)
    @given(
        deployment_id=deployment_id_strategy,
        bucket_name=bucket_name_strategy,
        lock_table_name=lock_table_name_strategy,
        region=backend_region_strategy,
    )
    def test_backend_config_key_includes_deployment_id(
        self,
        deployment_id: str,
        bucket_name: str,
        lock_table_name: str,
        region: str,
    ):
        """The key path in the backend config must include the deployment_id for state isolation."""
        # Feature: cicd-deployment-pipeline, Property 7: Terraform backend configuration includes correct deployment-specific values

        config = PipelineService._build_terraform_backend_config(
            deployment_id, bucket_name, lock_table_name, region
        )
        expected_key = f"deployments/{deployment_id}/terraform.tfstate"
        assert f"key={expected_key}" in config, (
            f"Deployment-specific key path '{expected_key}' not found in backend config"
        )

    @settings(max_examples=100)
    @given(
        deployment_id=deployment_id_strategy,
        bucket_name=bucket_name_strategy,
        lock_table_name=lock_table_name_strategy,
        region=backend_region_strategy,
    )
    def test_backend_config_contains_region(
        self,
        deployment_id: str,
        bucket_name: str,
        lock_table_name: str,
        region: str,
    ):
        """The backend config string must contain the AWS region."""
        # Feature: cicd-deployment-pipeline, Property 7: Terraform backend configuration includes correct deployment-specific values

        config = PipelineService._build_terraform_backend_config(
            deployment_id, bucket_name, lock_table_name, region
        )
        assert f"region={region}" in config, (
            f"Region '{region}' not found in backend config"
        )


# ---------------------------------------------------------------------------
# Property 13: Destroy pipeline uses offboarding job from template metadata
# ---------------------------------------------------------------------------

# We need the Template and related models for building test templates.
Template = _template_mod.Template
TemplateMetadata = _template_mod.TemplateMetadata
Job = _template_mod.Job
Framework = _template_mod.Framework
DeploymentPattern = _template_mod.DeploymentPattern

# Re-import PipelineService with mock boto3 for _extract_job testing
sys.modules["boto3"] = _mock_boto3
sys.modules["models.deployment"] = _deployment_mod
sys.modules["models.template"] = _template_mod

_ps_spec2 = importlib.util.spec_from_file_location(
    "pipeline_service_p13", os.path.abspath(_pipeline_service_path)
)
_pipeline_service_mod2 = importlib.util.module_from_spec(_ps_spec2)
_ps_spec2.loader.exec_module(_pipeline_service_mod2)

if _had_boto3:
    sys.modules["boto3"] = _original_boto3
else:
    if "boto3" in sys.modules:
        del sys.modules["boto3"]

PipelineServiceP13 = _pipeline_service_mod2.PipelineService

# ---------------------------------------------------------------------------
# Hypothesis strategies for Property 13
# ---------------------------------------------------------------------------

# Event name strategy: lowercase alphanumeric with underscores, like real event names
event_name_strategy = st.from_regex(r"[a-z][a-z0-9_]{4,49}", fullmatch=True)

# Job name strategy for extra jobs (not onboarding/offboarding)
extra_job_name_strategy = st.from_regex(r"[a-z][a-z0-9_]{2,19}", fullmatch=True).filter(
    lambda s: s not in ("onboarding", "offboarding")
)

# Template ID strategy
template_id_strategy = st.from_regex(r"[a-z][a-z0-9\-]{2,29}", fullmatch=True)


def _make_template_with_offboarding(
    template_id: str,
    onboarding_incoming: str,
    onboarding_outgoing: str,
    offboarding_incoming: str,
    offboarding_outgoing: str,
    extra_jobs: list = None,
) -> Template:
    """Build a Template with onboarding and offboarding jobs."""
    jobs = [
        Job(name="onboarding", incoming_event=onboarding_incoming, outgoing_event=onboarding_outgoing),
        Job(name="offboarding", incoming_event=offboarding_incoming, outgoing_event=offboarding_outgoing),
    ]
    if extra_jobs:
        jobs.extend(extra_jobs)

    metadata = TemplateMetadata(
        id=template_id,
        name="Test Template",
        description="A test template for property testing",
        version="1.0.0",
        pattern_type="single_agent",
        frameworks=[
            Framework(id="test_fw", name="Test Framework", path="frameworks/test", description="Test")
        ],
        deployment_patterns=[
            DeploymentPattern(id="test_dp", name="Test Pattern", description="Test pattern", path="patterns/test")
        ],
        parameters=[],
        jobs=jobs,
    )
    return Template(metadata=metadata, path="/tmp/templates/test")


class TestDestroyUsesOffboardingJob:
    """Property 13: Destroy pipeline uses offboarding job from template metadata.

    For any template with an offboarding job defined, calling
    `_extract_job(template, "offboarding")` returns the correct job with
    matching incoming_event and outgoing_event values, not hardcoded event names.

    **Validates: Requirements 8.1**
    """

    # Feature: cicd-deployment-pipeline, Property 13: Destroy pipeline uses offboarding job from template metadata

    @settings(max_examples=100)
    @given(
        template_id=template_id_strategy,
        onboarding_incoming=event_name_strategy,
        onboarding_outgoing=event_name_strategy,
        offboarding_incoming=event_name_strategy,
        offboarding_outgoing=event_name_strategy,
    )
    def test_extract_offboarding_job_returns_correct_events(
        self,
        template_id: str,
        onboarding_incoming: str,
        onboarding_outgoing: str,
        offboarding_incoming: str,
        offboarding_outgoing: str,
    ):
        """For any template with an offboarding job, _extract_job returns
        the offboarding job with the correct incoming and outgoing event names."""
        # Feature: cicd-deployment-pipeline, Property 13: Destroy pipeline uses offboarding job from template metadata
        # **Validates: Requirements 8.1**

        template = _make_template_with_offboarding(
            template_id,
            onboarding_incoming,
            onboarding_outgoing,
            offboarding_incoming,
            offboarding_outgoing,
        )

        # Use a mock SFN client — we only test _extract_job, not AWS calls
        sys.modules["boto3"] = _mock_boto3
        service = PipelineServiceP13(state_machine_arn="arn:aws:states:us-east-1:123456789012:stateMachine:test")
        if _had_boto3:
            sys.modules["boto3"] = _original_boto3
        else:
            if "boto3" in sys.modules:
                del sys.modules["boto3"]

        result = service._extract_job(template, "offboarding")

        assert result is not None, "Offboarding job should be found"
        assert result["name"] == "offboarding"
        assert result["incoming_event"] == offboarding_incoming, (
            f"Expected incoming_event '{offboarding_incoming}', got '{result['incoming_event']}'"
        )
        assert result["outgoing_event"] == offboarding_outgoing, (
            f"Expected outgoing_event '{offboarding_outgoing}', got '{result['outgoing_event']}'"
        )

    @settings(max_examples=100)
    @given(
        template_id=template_id_strategy,
        onboarding_incoming=event_name_strategy,
        onboarding_outgoing=event_name_strategy,
        offboarding_incoming=event_name_strategy,
        offboarding_outgoing=event_name_strategy,
    )
    def test_offboarding_job_is_distinct_from_onboarding(
        self,
        template_id: str,
        onboarding_incoming: str,
        onboarding_outgoing: str,
        offboarding_incoming: str,
        offboarding_outgoing: str,
    ):
        """The offboarding job extracted is not the onboarding job — it uses
        the offboarding event names, not the onboarding ones."""
        # Feature: cicd-deployment-pipeline, Property 13: Destroy pipeline uses offboarding job from template metadata
        # **Validates: Requirements 8.1**

        template = _make_template_with_offboarding(
            template_id,
            onboarding_incoming,
            onboarding_outgoing,
            offboarding_incoming,
            offboarding_outgoing,
        )

        sys.modules["boto3"] = _mock_boto3
        service = PipelineServiceP13(state_machine_arn="arn:aws:states:us-east-1:123456789012:stateMachine:test")
        if _had_boto3:
            sys.modules["boto3"] = _original_boto3
        else:
            if "boto3" in sys.modules:
                del sys.modules["boto3"]

        onboarding = service._extract_job(template, "onboarding")
        offboarding = service._extract_job(template, "offboarding")

        assert onboarding is not None
        assert offboarding is not None
        assert onboarding["name"] == "onboarding"
        assert offboarding["name"] == "offboarding"
        assert onboarding["incoming_event"] == onboarding_incoming
        assert offboarding["incoming_event"] == offboarding_incoming

    @settings(max_examples=100)
    @given(
        template_id=template_id_strategy,
        onboarding_incoming=event_name_strategy,
        onboarding_outgoing=event_name_strategy,
        offboarding_incoming=event_name_strategy,
        offboarding_outgoing=event_name_strategy,
        extra_job_names=st.lists(extra_job_name_strategy, min_size=0, max_size=3),
    )
    def test_offboarding_extraction_unaffected_by_extra_jobs(
        self,
        template_id: str,
        onboarding_incoming: str,
        onboarding_outgoing: str,
        offboarding_incoming: str,
        offboarding_outgoing: str,
        extra_job_names: list,
    ):
        """Even when extra jobs exist in the template, _extract_job still
        returns the correct offboarding job with the right event names."""
        # Feature: cicd-deployment-pipeline, Property 13: Destroy pipeline uses offboarding job from template metadata
        # **Validates: Requirements 8.1**

        extra_jobs = [
            Job(
                name=name,
                incoming_event=f"{name}_request",
                outgoing_event=f"{name}_success",
            )
            for name in extra_job_names
        ]

        template = _make_template_with_offboarding(
            template_id,
            onboarding_incoming,
            onboarding_outgoing,
            offboarding_incoming,
            offboarding_outgoing,
            extra_jobs=extra_jobs,
        )

        sys.modules["boto3"] = _mock_boto3
        service = PipelineServiceP13(state_machine_arn="arn:aws:states:us-east-1:123456789012:stateMachine:test")
        if _had_boto3:
            sys.modules["boto3"] = _original_boto3
        else:
            if "boto3" in sys.modules:
                del sys.modules["boto3"]

        result = service._extract_job(template, "offboarding")

        assert result is not None
        assert result["name"] == "offboarding"
        assert result["incoming_event"] == offboarding_incoming
        assert result["outgoing_event"] == offboarding_outgoing
