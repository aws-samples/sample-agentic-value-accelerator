"""
Bootstrap engine for creating projects from templates
"""

import json
import uuid
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime
import logging

from models.template import Template, TemplateMetadata
from services.template_catalog import TemplateCatalog
from services.template_validator import TemplateValidator
from services.substitution_service import SubstitutionService
from services.zip_service import ZipService
from services.documentation_generator import DocumentationGenerator

logger = logging.getLogger(__name__)


class BootstrapEngine:
    """Orchestrates project bootstrapping from templates"""

    def __init__(self, templates_dir: str = "templates"):
        """
        Initialize bootstrap engine

        Args:
            templates_dir: Path to templates directory
        """
        self.catalog = TemplateCatalog(templates_dir)
        self.validator = TemplateValidator()
        self.substitution_service = SubstitutionService()
        self.zip_service = ZipService()
        self.doc_generator = DocumentationGenerator()

    def bootstrap_project(
        self,
        template_id: str,
        project_name: str,
        parameters: Dict[str, Any],
        framework_id: Optional[str] = None,
        deployment_pattern_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Bootstrap a new project from template

        Args:
            template_id: Template identifier
            project_name: Name of the new project
            parameters: User-provided parameter values
            framework_id: Selected framework (if template supports multiple)
            deployment_pattern_id: Selected deployment pattern (if template supports multiple)

        Returns:
            Dict with bootstrap results

        Raises:
            ValueError: If validation fails or template not found
        """
        logger.info(f"Bootstrapping project '{project_name}' from template '{template_id}'")

        # 1. Get template
        template = self.catalog.get_template(template_id)
        if not template:
            raise ValueError(f"Template not found: {template_id}")

        # 2. Select framework
        selected_framework = self._select_framework(template, framework_id)

        # 3. Select deployment pattern
        selected_pattern = self._select_deployment_pattern(template, deployment_pattern_id)

        # 4. Add standard parameters
        all_parameters = {
            "PROJECT_NAME": project_name,
            **parameters
        }

        # 5. Validate parameters
        validation_result = self.validator.validate_parameters(
            [p.dict() for p in template.metadata.parameters],
            all_parameters
        )
        if not validation_result.valid:
            raise ValueError(f"Parameter validation failed: {', '.join(validation_result.errors)}")

        # 6. Load template files with filtering
        template_files = self._load_template_files(
            Path(template.path),
            selected_framework,
            selected_pattern
        )

        logger.info(f"Loaded {len(template_files)} files from template")

        # 7. Substitute parameters
        processed_files = self.substitution_service.substitute_variables(
            template_files,
            all_parameters
        )

        logger.info(f"Substituted parameters in {len(processed_files)} files")

        # 8. Generate documentation
        docs = self.doc_generator.generate_all_docs(
            template,
            all_parameters,
            selected_framework.id if selected_framework else None,
            selected_pattern.id if selected_pattern else None
        )

        # Add documentation to processed files
        for doc_name, doc_content in docs.items():
            processed_files[doc_name] = doc_content.encode('utf-8')

        logger.info(f"Generated {len(docs)} documentation files")

        # 9. Create zip
        zip_data = self.zip_service.create_zip(processed_files)

        logger.info(f"Created zip archive: {len(zip_data)} bytes")

        return {
            "template_id": template_id,
            "template_name": template.metadata.name,
            "project_name": project_name,
            "framework": selected_framework.id if selected_framework else None,
            "deployment_pattern": selected_pattern.id if selected_pattern else None,
            "file_count": len(processed_files),
            "zip_size": len(zip_data),
            "zip_data": zip_data
        }

    def _select_framework(self, template: Template, framework_id: Optional[str]):
        """
        Select framework from template

        Args:
            template: Template instance
            framework_id: User-selected framework ID

        Returns:
            Framework configuration or None

        Raises:
            ValueError: If framework selection is invalid
        """
        frameworks = template.metadata.frameworks

        if not frameworks:
            return None

        if len(frameworks) == 1:
            # Only one framework - use it
            return frameworks[0]

        if not framework_id:
            raise ValueError(
                f"Template supports multiple frameworks, please select one: "
                f"{', '.join(f.id for f in frameworks)}"
            )

        framework = template.get_framework(framework_id)
        if not framework:
            raise ValueError(
                f"Framework '{framework_id}' not supported by template. "
                f"Available: {', '.join(f.id for f in frameworks)}"
            )

        return framework

    def _select_deployment_pattern(self, template: Template, pattern_id: Optional[str]):
        """
        Select deployment pattern from template

        Args:
            template: Template instance
            pattern_id: User-selected pattern ID

        Returns:
            DeploymentPattern configuration or None

        Raises:
            ValueError: If pattern selection is invalid
        """
        patterns = template.metadata.deployment_patterns

        if not patterns:
            return None

        if len(patterns) == 1:
            # Only one pattern - use it
            return patterns[0]

        if not pattern_id:
            raise ValueError(
                f"Template supports multiple deployment patterns, please select one: "
                f"{', '.join(p.id for p in patterns)}"
            )

        pattern = template.get_deployment_pattern(pattern_id)
        if not pattern:
            raise ValueError(
                f"Deployment pattern '{pattern_id}' not supported by template. "
                f"Available: {', '.join(p.id for p in patterns)}"
            )

        return pattern

    def _load_template_files(
        self,
        template_path: Path,
        framework,
        deployment_pattern
    ) -> Dict[str, bytes]:
        """
        Load template files with framework/pattern filtering

        Args:
            template_path: Path to template directory
            framework: Selected framework configuration
            deployment_pattern: Selected deployment pattern configuration

        Returns:
            Dict mapping relative paths to file contents
        """
        files = {}

        for file_path in template_path.rglob("*"):
            if file_path.is_file():
                relative_path = file_path.relative_to(template_path)
                relative_str = str(relative_path)

                # Skip template.json
                if relative_str == "template.json":
                    continue

                # Filter framework files
                if relative_str.startswith("src/"):
                    if framework:
                        # Only include selected framework's files
                        framework_dir = framework.path
                        if not relative_str.startswith(framework_dir + "/"):
                            continue
                        # Adjust path to remove framework directory level
                        # src/langraph/agent.py -> src/agent.py
                        parts = relative_str.split("/", 2)
                        if len(parts) == 3:
                            relative_str = f"src/{parts[2]}"

                # Filter IaC files
                if relative_str.startswith("iac/"):
                    if deployment_pattern:
                        # Only include selected pattern's files
                        pattern_dir = deployment_pattern.path
                        if not relative_str.startswith(pattern_dir + "/"):
                            continue
                        # Adjust path to remove pattern directory level
                        # iac/terraform/main.tf -> iac/main.tf
                        parts = relative_str.split("/", 2)
                        if len(parts) == 3:
                            relative_str = f"iac/{parts[2]}"

                # Read file
                with open(file_path, "rb") as f:
                    files[relative_str] = f.read()

        return files
