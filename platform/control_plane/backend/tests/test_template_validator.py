"""
Unit tests for TemplateValidator service
"""

import pytest
import json
from pathlib import Path
import tempfile
import shutil

from src.services.template_validator import TemplateValidator
from src.models.template import TemplateMetadata, ValidationResult


class TestTemplateValidator:
    """Test suite for TemplateValidator"""

    @pytest.fixture
    def validator(self):
        """Create validator instance"""
        return TemplateValidator()

    @pytest.fixture
    def valid_metadata(self):
        """Valid template metadata"""
        return {
            "id": "test-template",
            "name": "Test Template",
            "description": "A test template for unit testing",
            "version": "1.0.0",
            "pattern_type": "single_agent",
            "frameworks": [
                {
                    "id": "langraph",
                    "name": "LangGraph",
                    "path": "src/langraph"
                }
            ],
            "deployment_patterns": [
                {
                    "id": "terraform",
                    "name": "Terraform",
                    "description": "Terraform IaC",
                    "path": "iac/terraform"
                }
            ],
            "parameters": [
                {
                    "name": "project_name",
                    "type": "string",
                    "description": "Project name",
                    "required": True,
                    "pattern": "^[a-z][a-z0-9-]+$"
                }
            ],
            "example_use_cases": ["Test use case"],
            "tags": ["test", "example"]
        }

    @pytest.fixture
    def temp_template_dir(self, valid_metadata):
        """Create temporary template directory"""
        temp_dir = tempfile.mkdtemp()

        # Create template.json
        with open(Path(temp_dir) / "template.json", "w") as f:
            json.dump(valid_metadata, f)

        # Create required files
        (Path(temp_dir) / "README.md").write_text("# Test Template")
        (Path(temp_dir) / "Dockerfile").write_text("FROM python:3.11")
        (Path(temp_dir) / "requirements.txt").write_text("fastapi==0.109.0")

        # Create required directories
        (Path(temp_dir) / "src" / "langraph").mkdir(parents=True)
        (Path(temp_dir) / "iac" / "terraform").mkdir(parents=True)

        # Add some files
        (Path(temp_dir) / "src" / "langraph" / "agent.py").write_text("# Agent code")
        (Path(temp_dir) / "iac" / "terraform" / "main.tf").write_text("# Terraform")

        yield temp_dir

        # Cleanup
        shutil.rmtree(temp_dir)

    def test_validate_valid_metadata(self, validator, valid_metadata):
        """Test validation of valid metadata"""
        result = validator.validate_metadata(valid_metadata)

        assert result.valid is True
        assert len(result.errors) == 0

    def test_validate_metadata_missing_required_field(self, validator, valid_metadata):
        """Test validation fails for missing required field"""
        del valid_metadata["name"]

        result = validator.validate_metadata(valid_metadata)

        assert result.valid is False
        assert len(result.errors) > 0
        assert any("name" in error.lower() for error in result.errors)

    def test_validate_metadata_invalid_pattern_type(self, validator, valid_metadata):
        """Test validation fails for invalid pattern type"""
        valid_metadata["pattern_type"] = "invalid_pattern"

        result = validator.validate_metadata(valid_metadata)

        assert result.valid is False
        assert len(result.errors) > 0

    def test_validate_metadata_invalid_version(self, validator, valid_metadata):
        """Test validation fails for invalid version format"""
        valid_metadata["version"] = "not-a-version"

        result = validator.validate_metadata(valid_metadata)

        assert result.valid is False
        assert len(result.errors) > 0

    def test_validate_metadata_duplicate_framework_paths(self, validator, valid_metadata):
        """Test validation catches duplicate framework paths"""
        valid_metadata["frameworks"].append({
            "id": "another",
            "name": "Another",
            "path": "src/langraph"  # Duplicate path
        })

        result = validator.validate_metadata(valid_metadata)

        assert result.valid is False
        assert any("duplicate" in error.lower() for error in result.errors)

    def test_validate_metadata_duplicate_parameter_names(self, validator, valid_metadata):
        """Test validation catches duplicate parameter names"""
        valid_metadata["parameters"].append({
            "name": "project_name",  # Duplicate name
            "type": "string",
            "description": "Another param",
            "required": False
        })

        result = validator.validate_metadata(valid_metadata)

        assert result.valid is False
        assert any("duplicate" in error.lower() for error in result.errors)

    def test_validate_structure_valid(self, validator, temp_template_dir, valid_metadata):
        """Test structure validation of valid template"""
        metadata = TemplateMetadata(**valid_metadata)
        result = validator.validate_structure(Path(temp_template_dir), metadata)

        assert result.valid is True
        assert len(result.errors) == 0

    def test_validate_structure_missing_directory(self, validator, temp_template_dir, valid_metadata):
        """Test structure validation fails for missing directory"""
        shutil.rmtree(Path(temp_template_dir) / "src")

        metadata = TemplateMetadata(**valid_metadata)
        result = validator.validate_structure(Path(temp_template_dir), metadata)

        assert result.valid is False
        assert any("src" in error.lower() for error in result.errors)

    def test_validate_structure_missing_file(self, validator, temp_template_dir, valid_metadata):
        """Test structure validation fails for missing required file"""
        (Path(temp_template_dir) / "README.md").unlink()

        metadata = TemplateMetadata(**valid_metadata)
        result = validator.validate_structure(Path(temp_template_dir), metadata)

        assert result.valid is False
        assert any("readme" in error.lower() for error in result.errors)

    def test_validate_structure_missing_framework_path(self, validator, temp_template_dir, valid_metadata):
        """Test structure validation fails for missing framework path"""
        shutil.rmtree(Path(temp_template_dir) / "src" / "langraph")

        metadata = TemplateMetadata(**valid_metadata)
        result = validator.validate_structure(Path(temp_template_dir), metadata)

        assert result.valid is False
        assert any("langraph" in error.lower() for error in result.errors)

    def test_validate_parameters_valid(self, validator, valid_metadata):
        """Test parameter validation with valid values"""
        param_defs = valid_metadata["parameters"]
        values = {"project_name": "my-project"}

        result = validator.validate_parameters(param_defs, values)

        assert result.valid is True
        assert len(result.errors) == 0

    def test_validate_parameters_missing_required(self, validator, valid_metadata):
        """Test parameter validation fails for missing required parameter"""
        param_defs = valid_metadata["parameters"]
        values = {}  # Missing required project_name

        result = validator.validate_parameters(param_defs, values)

        assert result.valid is False
        assert any("required" in error.lower() for error in result.errors)

    def test_validate_parameters_invalid_pattern(self, validator, valid_metadata):
        """Test parameter validation fails for pattern mismatch"""
        param_defs = valid_metadata["parameters"]
        values = {"project_name": "Invalid-Name-With-Uppercase"}  # Doesn't match pattern

        result = validator.validate_parameters(param_defs, values)

        assert result.valid is False
        assert any("pattern" in error.lower() for error in result.errors)

    def test_validate_parameters_invalid_type(self, validator):
        """Test parameter validation fails for wrong type"""
        param_defs = [
            {
                "name": "count",
                "type": "integer",
                "description": "Count",
                "required": True
            }
        ]
        values = {"count": "not-an-integer"}

        result = validator.validate_parameters(param_defs, values)

        assert result.valid is False
        assert any("type" in error.lower() for error in result.errors)

    def test_validate_parameters_enum_valid(self, validator):
        """Test parameter validation with valid enum value"""
        param_defs = [
            {
                "name": "region",
                "type": "string",
                "description": "AWS Region",
                "required": True,
                "enum": ["us-east-1", "us-west-2"]
            }
        ]
        values = {"region": "us-east-1"}

        result = validator.validate_parameters(param_defs, values)

        assert result.valid is True

    def test_validate_parameters_enum_invalid(self, validator):
        """Test parameter validation fails for invalid enum value"""
        param_defs = [
            {
                "name": "region",
                "type": "string",
                "description": "AWS Region",
                "required": True,
                "enum": ["us-east-1", "us-west-2"]
            }
        ]
        values = {"region": "invalid-region"}

        result = validator.validate_parameters(param_defs, values)

        assert result.valid is False
        assert any("allowed values" in error.lower() for error in result.errors)

    def test_validate_template_complete(self, validator, temp_template_dir):
        """Test complete template validation"""
        result = validator.validate_template(Path(temp_template_dir))

        assert result.valid is True
        assert len(result.errors) == 0

    def test_validate_template_missing_template_json(self, validator, temp_template_dir):
        """Test validation fails when template.json is missing"""
        (Path(temp_template_dir) / "template.json").unlink()

        result = validator.validate_template(Path(temp_template_dir))

        assert result.valid is False
        assert any("template.json" in error.lower() for error in result.errors)

    def test_validate_template_invalid_json(self, validator, temp_template_dir):
        """Test validation fails for invalid JSON"""
        (Path(temp_template_dir) / "template.json").write_text("{ invalid json")

        result = validator.validate_template(Path(temp_template_dir))

        assert result.valid is False
        assert any("json" in error.lower() for error in result.errors)
