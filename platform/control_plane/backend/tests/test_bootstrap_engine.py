"""
Unit tests for BootstrapEngine service
"""

import pytest
import json
from pathlib import Path
import tempfile
import shutil

from src.services.bootstrap_engine import BootstrapEngine
from src.models.template import TemplateMetadata


class TestBootstrapEngine:
    """Test suite for BootstrapEngine"""

    @pytest.fixture
    def temp_templates_dir(self):
        """Create temporary templates directory"""
        temp_dir = tempfile.mkdtemp()

        # Create multi-framework template
        template_dir = Path(temp_dir) / "multi-framework"
        template_dir.mkdir()

        metadata = {
            "id": "multi-framework",
            "name": "Multi Framework Template",
            "description": "Template with multiple frameworks",
            "version": "1.0.0",
            "pattern_type": "single_agent",
            "frameworks": [
                {
                    "id": "langraph",
                    "name": "LangGraph",
                    "path": "src/langraph"
                },
                {
                    "id": "strands",
                    "name": "Strands",
                    "path": "src/strands"
                }
            ],
            "deployment_patterns": [
                {
                    "id": "terraform",
                    "name": "Terraform",
                    "description": "Terraform IaC",
                    "path": "iac/terraform"
                },
                {
                    "id": "cdk",
                    "name": "CDK",
                    "description": "AWS CDK",
                    "path": "iac/cdk"
                }
            ],
            "parameters": [
                {
                    "name": "project_name",
                    "type": "string",
                    "description": "Project name",
                    "required": True,
                    "pattern": "^[a-z][a-z0-9-]+$"
                },
                {
                    "name": "aws_region",
                    "type": "string",
                    "description": "AWS region",
                    "required": False,
                    "default": "us-east-1"
                }
            ],
            "example_use_cases": [],
            "tags": []
        }

        with open(template_dir / "template.json", "w") as f:
            json.dump(metadata, f)

        # Create framework directories with files
        (template_dir / "src" / "langraph").mkdir(parents=True)
        (template_dir / "src" / "langraph" / "agent.py").write_text("# LangGraph agent\nproject_name = '${PROJECT_NAME}'")
        (template_dir / "src" / "strands").mkdir(parents=True)
        (template_dir / "src" / "strands" / "agent.py").write_text("# Strands agent\nproject_name = '${PROJECT_NAME}'")

        # Create IaC directories with files
        (template_dir / "iac" / "terraform").mkdir(parents=True)
        (template_dir / "iac" / "terraform" / "main.tf").write_text("# Terraform\nproject = var.${PROJECT_NAME}")
        (template_dir / "iac" / "cdk").mkdir(parents=True)
        (template_dir / "iac" / "cdk" / "app.py").write_text("# CDK\nproject = '${PROJECT_NAME}'")

        # Create common files
        (template_dir / "README.md").write_text("# ${PROJECT_NAME}")
        (template_dir / "Dockerfile").write_text("FROM python:3.11")
        (template_dir / "requirements.txt").write_text("fastapi==0.109.0")

        yield temp_dir

        shutil.rmtree(temp_dir)

    @pytest.fixture
    def engine(self, temp_templates_dir):
        """Create bootstrap engine instance"""
        return BootstrapEngine(str(temp_templates_dir))

    def test_bootstrap_project_single_framework(self, engine):
        """Test bootstrapping project with single framework selection"""
        result = engine.bootstrap_project(
            template_id="multi-framework",
            project_name="test-project",
            parameters={"aws_region": "us-west-2"},
            framework_id="langraph",
            deployment_pattern_id="terraform"
        )

        assert result["project_name"] == "test-project"
        assert result["framework"] == "langraph"
        assert result["deployment_pattern"] == "terraform"
        assert result["file_count"] > 0
        assert "zip_data" in result

    def test_bootstrap_project_framework_filtering(self, engine):
        """Test that only selected framework files are included"""
        result = engine.bootstrap_project(
            template_id="multi-framework",
            project_name="test-project",
            parameters={},
            framework_id="langraph",
            deployment_pattern_id="terraform"
        )

        # Check that zip_data exists and is bytes
        assert isinstance(result["zip_data"], bytes)
        assert len(result["zip_data"]) > 0

        # Framework should be selected
        assert result["framework"] == "langraph"

    def test_bootstrap_project_pattern_filtering(self, engine):
        """Test that only selected deployment pattern files are included"""
        result = engine.bootstrap_project(
            template_id="multi-framework",
            project_name="test-project",
            parameters={},
            framework_id="strands",
            deployment_pattern_id="cdk"
        )

        assert result["deployment_pattern"] == "cdk"
        assert isinstance(result["zip_data"], bytes)

    def test_bootstrap_project_parameter_substitution(self, engine):
        """Test parameter substitution in files"""
        result = engine.bootstrap_project(
            template_id="multi-framework",
            project_name="my-cool-project",
            parameters={"aws_region": "eu-west-1"},
            framework_id="langraph",
            deployment_pattern_id="terraform"
        )

        assert result["project_name"] == "my-cool-project"
        assert "zip_data" in result

    def test_bootstrap_project_missing_required_parameter(self, engine):
        """Test bootstrap fails for missing required parameter"""
        # project_name is required but not provided
        with pytest.raises(ValueError) as exc_info:
            engine.bootstrap_project(
                template_id="multi-framework",
                project_name="",  # Empty project name
                parameters={},
                framework_id="langraph",
                deployment_pattern_id="terraform"
            )

        # Should raise error about project_name
        assert "project_name" in str(exc_info.value).lower()

    def test_bootstrap_project_invalid_parameter_pattern(self, engine):
        """Test bootstrap fails for parameter pattern mismatch"""
        with pytest.raises(ValueError) as exc_info:
            engine.bootstrap_project(
                template_id="multi-framework",
                project_name="Invalid-Project-Name",  # Uppercase not allowed
                parameters={},
                framework_id="langraph",
                deployment_pattern_id="terraform"
            )

        assert "pattern" in str(exc_info.value).lower()

    def test_bootstrap_project_template_not_found(self, engine):
        """Test bootstrap fails for non-existent template"""
        with pytest.raises(ValueError) as exc_info:
            engine.bootstrap_project(
                template_id="nonexistent",
                project_name="test-project",
                parameters={},
                framework_id="langraph",
                deployment_pattern_id="terraform"
            )

        assert "not found" in str(exc_info.value).lower()

    def test_bootstrap_project_invalid_framework(self, engine):
        """Test bootstrap fails for invalid framework"""
        with pytest.raises(ValueError) as exc_info:
            engine.bootstrap_project(
                template_id="multi-framework",
                project_name="test-project",
                parameters={},
                framework_id="invalid-framework",
                deployment_pattern_id="terraform"
            )

        assert "framework" in str(exc_info.value).lower()

    def test_bootstrap_project_invalid_pattern(self, engine):
        """Test bootstrap fails for invalid deployment pattern"""
        with pytest.raises(ValueError) as exc_info:
            engine.bootstrap_project(
                template_id="multi-framework",
                project_name="test-project",
                parameters={},
                framework_id="langraph",
                deployment_pattern_id="invalid-pattern"
            )

        assert "pattern" in str(exc_info.value).lower()

    def test_bootstrap_project_multiple_frameworks_no_selection(self, engine):
        """Test bootstrap fails when template has multiple frameworks but none selected"""
        with pytest.raises(ValueError) as exc_info:
            engine.bootstrap_project(
                template_id="multi-framework",
                project_name="test-project",
                parameters={},
                framework_id=None,  # No framework selected
                deployment_pattern_id="terraform"
            )

        assert "multiple frameworks" in str(exc_info.value).lower()
        assert "select" in str(exc_info.value).lower()

    def test_bootstrap_project_multiple_patterns_no_selection(self, engine):
        """Test bootstrap fails when template has multiple patterns but none selected"""
        with pytest.raises(ValueError) as exc_info:
            engine.bootstrap_project(
                template_id="multi-framework",
                project_name="test-project",
                parameters={},
                framework_id="langraph",
                deployment_pattern_id=None  # No pattern selected
            )

        assert "multiple" in str(exc_info.value).lower() and "pattern" in str(exc_info.value).lower()
        assert "select" in str(exc_info.value).lower()
