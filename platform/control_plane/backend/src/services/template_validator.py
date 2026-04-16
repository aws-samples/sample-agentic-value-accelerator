"""
Template validator service for validating template structure and metadata
"""

import json
import jsonschema
from pathlib import Path
from typing import Dict, Any
import logging

from models.template import TemplateMetadata, ValidationResult

logger = logging.getLogger(__name__)


class TemplateValidator:
    """Service for validating templates"""

    def __init__(self, schema_path: str = None):
        """
        Initialize template validator

        Args:
            schema_path: Path to template metadata JSON schema
        """
        if schema_path is None:
            # Default to schemas directory
            schema_path = Path(__file__).parent.parent.parent / "schemas" / "template_metadata_schema.json"

        self.schema_path = Path(schema_path)
        self.schema = self._load_schema()

    def _load_schema(self) -> Dict[str, Any]:
        """
        Load JSON schema from file

        Returns:
            JSON schema dict

        Raises:
            FileNotFoundError: If schema file not found
        """
        if not self.schema_path.exists():
            raise FileNotFoundError(f"Schema file not found: {self.schema_path}")

        with open(self.schema_path, "r") as f:
            return json.load(f)

    def validate_metadata(self, metadata: Dict[str, Any]) -> ValidationResult:
        """
        Validate template metadata against JSON schema

        Args:
            metadata: Template metadata dict

        Returns:
            ValidationResult with errors/warnings
        """
        result = ValidationResult(valid=True)

        try:
            # Validate against JSON schema
            jsonschema.validate(instance=metadata, schema=self.schema)
            logger.info("Template metadata passed JSON schema validation")
        except jsonschema.ValidationError as e:
            result.add_error(f"Schema validation failed: {e.message}")
            logger.error(f"Schema validation error: {e.message}")
        except jsonschema.SchemaError as e:
            result.add_error(f"Invalid schema: {e.message}")
            logger.error(f"Schema error: {e.message}")

        # Additional semantic validations
        if result.valid:
            self._validate_semantic(metadata, result)

        return result

    def _validate_semantic(self, metadata: Dict[str, Any], result: ValidationResult):
        """
        Perform semantic validations beyond JSON schema

        Args:
            metadata: Template metadata dict
            result: ValidationResult to populate
        """
        # Check framework paths are unique
        if "frameworks" in metadata:
            paths = [f["path"] for f in metadata["frameworks"]]
            if len(paths) != len(set(paths)):
                result.add_error("Duplicate framework paths found")

        # Check deployment pattern paths are unique
        if "deployment_patterns" in metadata:
            paths = [p["path"] for p in metadata["deployment_patterns"]]
            if len(paths) != len(set(paths)):
                result.add_error("Duplicate deployment pattern paths found")

        # Check parameter names are unique
        if "parameters" in metadata:
            names = [p["name"] for p in metadata["parameters"]]
            if len(names) != len(set(names)):
                result.add_error("Duplicate parameter names found")

        # Warn if no example use cases
        if not metadata.get("example_use_cases"):
            result.add_warning("No example use cases provided")

        # Validate jobs have non-empty event names
        for job in metadata.get("jobs", []):
            if not job.get("incoming_event"):
                result.add_error(f"Job '{job.get('name', 'unknown')}' has empty incoming_event")
            if not job.get("outgoing_event"):
                result.add_error(f"Job '{job.get('name', 'unknown')}' has empty outgoing_event")

        # Warn if usecase has dependencies (validated at catalog level)
        if metadata.get("type") == "usecase" and metadata.get("dependencies"):
            for dep in metadata["dependencies"]:
                result.add_warning(f"Dependency '{dep}' declared — verify it exists in the catalog")

    def validate_structure(self, template_path: Path, metadata: TemplateMetadata) -> ValidationResult:
        """
        Validate template directory structure

        Args:
            template_path: Path to template directory
            metadata: Parsed template metadata

        Returns:
            ValidationResult with errors/warnings
        """
        result = ValidationResult(valid=True)

        if not template_path.exists():
            result.add_error(f"Template directory not found: {template_path}")
            return result

        # Check required directories
        required_dirs = ["src", "iac"]
        for dir_name in required_dirs:
            dir_path = template_path / dir_name
            if not dir_path.exists():
                result.add_error(f"Required directory missing: {dir_name}/")

        # Check required files
        required_files = ["template.json", "README.md", "requirements.txt", "Dockerfile"]
        for file_name in required_files:
            file_path = template_path / file_name
            if not file_path.exists():
                result.add_error(f"Required file missing: {file_name}")

        # Validate framework paths exist
        for framework in metadata.frameworks:
            framework_path = template_path / framework.path
            if not framework_path.exists():
                result.add_error(f"Framework path does not exist: {framework.path}")

        # Validate deployment pattern paths exist
        for pattern in metadata.deployment_patterns:
            pattern_path = template_path / pattern.path
            if not pattern_path.exists():
                result.add_error(f"Deployment pattern path does not exist: {pattern.path}")

        # Check for common mistakes
        self._validate_common_issues(template_path, result)

        return result

    def _validate_common_issues(self, template_path: Path, result: ValidationResult):
        """
        Check for common template issues

        Args:
            template_path: Path to template directory
            result: ValidationResult to populate
        """
        # Warn if .git directory present
        if (template_path / ".git").exists():
            result.add_warning("Template contains .git directory - should be excluded")

        # Warn if __pycache__ present
        if (template_path / "__pycache__").exists():
            result.add_warning("Template contains __pycache__ directory - should be excluded")

        # Check for placeholder files
        placeholder_patterns = ["${", "{{"]
        readme_path = template_path / "README.md"
        if readme_path.exists():
            content = readme_path.read_text()
            has_placeholders = any(p in content for p in placeholder_patterns)
            if not has_placeholders:
                result.add_warning("README.md contains no placeholders - may need parameterization")

    def validate_parameters(
        self,
        parameter_definitions: list,
        provided_values: Dict[str, Any]
    ) -> ValidationResult:
        """
        Validate user-provided parameter values against definitions

        Args:
            parameter_definitions: List of parameter definitions from metadata
            provided_values: Dict of parameter values from user

        Returns:
            ValidationResult with errors/warnings
        """
        result = ValidationResult(valid=True)

        # Check required parameters are provided
        for param_def in parameter_definitions:
            name = param_def["name"]
            required = param_def.get("required", False)

            if required and name not in provided_values:
                result.add_error(f"Required parameter missing: {name}")
                continue

            # Skip validation if parameter not provided and not required
            if name not in provided_values:
                continue

            value = provided_values[name]

            # Validate type
            param_type = param_def["type"]
            if not self._validate_parameter_type(value, param_type):
                result.add_error(f"Parameter '{name}' has invalid type (expected {param_type})")
                continue

            # Validate pattern (for strings)
            if param_type == "string" and "pattern" in param_def:
                import re
                if not re.match(param_def["pattern"], str(value)):
                    result.add_error(f"Parameter '{name}' does not match pattern: {param_def['pattern']}")

            # Validate range (for integers)
            if param_type == "integer":
                if "minimum" in param_def and value < param_def["minimum"]:
                    result.add_error(f"Parameter '{name}' below minimum: {param_def['minimum']}")
                if "maximum" in param_def and value > param_def["maximum"]:
                    result.add_error(f"Parameter '{name}' above maximum: {param_def['maximum']}")

            # Validate enum
            if "enum" in param_def and value not in param_def["enum"]:
                result.add_error(f"Parameter '{name}' not in allowed values: {param_def['enum']}")

        return result

    def _validate_parameter_type(self, value: Any, expected_type: str) -> bool:
        """
        Validate parameter value type

        Args:
            value: Parameter value
            expected_type: Expected type string

        Returns:
            True if type matches
        """
        type_map = {
            "string": str,
            "integer": int,
            "boolean": bool,
            "array": list,
            "object": dict
        }

        expected_python_type = type_map.get(expected_type)
        if expected_python_type is None:
            return False

        return isinstance(value, expected_python_type)

    def validate_template(self, template_path: Path) -> ValidationResult:
        """
        Perform complete template validation

        Args:
            template_path: Path to template directory

        Returns:
            ValidationResult with all validation results
        """
        result = ValidationResult(valid=True)

        # Load and validate metadata
        metadata_path = template_path / "template.json"
        if not metadata_path.exists():
            result.add_error("template.json not found")
            return result

        try:
            with open(metadata_path, "r") as f:
                metadata_dict = json.load(f)
        except json.JSONDecodeError as e:
            result.add_error(f"Invalid JSON in template.json: {e}")
            return result

        # Validate metadata against schema
        metadata_result = self.validate_metadata(metadata_dict)
        result.errors.extend(metadata_result.errors)
        result.warnings.extend(metadata_result.warnings)
        result.valid = result.valid and metadata_result.valid

        if not result.valid:
            return result

        # Parse metadata with Pydantic
        try:
            metadata = TemplateMetadata(**metadata_dict)
        except Exception as e:
            result.add_error(f"Failed to parse metadata: {e}")
            return result

        # Validate structure
        structure_result = self.validate_structure(template_path, metadata)
        result.errors.extend(structure_result.errors)
        result.warnings.extend(structure_result.warnings)
        result.valid = result.valid and structure_result.valid

        return result
