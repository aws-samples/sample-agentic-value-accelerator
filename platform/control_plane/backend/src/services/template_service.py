"""
Template service for loading and selecting templates
"""

import os
from pathlib import Path
from typing import Dict, List, Optional
import logging

logger = logging.getLogger(__name__)


class TemplateService:
    """Service for managing project templates"""

    def __init__(self, templates_dir: str = "templates"):
        """
        Initialize template service

        Args:
            templates_dir: Path to templates directory
        """
        self.templates_dir = Path(templates_dir)
        if not self.templates_dir.is_absolute():
            # Relative to backend/src directory
            self.templates_dir = Path(__file__).parent.parent.parent / templates_dir

    def select_template(self, framework: str) -> str:
        """
        Select template name based on framework

        Args:
            framework: Framework name ('langraph' or 'strands')

        Returns:
            Template name

        Raises:
            ValueError: If framework is invalid
        """
        template_map = {
            "langraph": "langraph-agentcore",
            "strands": "strands-agentcore"
        }

        template_name = template_map.get(framework)
        if not template_name:
            raise ValueError(f"Invalid framework: {framework}")

        return template_name

    def load_template(self, template_name: str, iac_type: str = "terraform") -> Dict[str, bytes]:
        """
        Load template files from disk, filtering by IaC type

        Args:
            template_name: Name of the template
            iac_type: Infrastructure as Code type ('terraform', 'cdk', or 'cloudformation')

        Returns:
            Dictionary mapping relative paths to file contents (bytes)

        Raises:
            FileNotFoundError: If template not found
            ValueError: If invalid IaC type
        """
        if iac_type not in ["terraform", "cdk", "cloudformation"]:
            raise ValueError(f"Invalid IaC type: {iac_type}")

        template_path = self.templates_dir / template_name

        if not template_path.exists():
            raise FileNotFoundError(f"Template not found: {template_name}")

        logger.info(f"Loading template: {template_name} (IaC: {iac_type}) from {template_path}")

        files = {}
        for file_path in template_path.rglob("*"):
            if file_path.is_file():
                # Get relative path from template root
                relative_path = file_path.relative_to(template_path)
                relative_str = str(relative_path)

                # Filter IaC files: only include the selected IaC type
                if relative_str.startswith("iac/"):
                    # Check if this is the selected IaC type directory
                    iac_dir = relative_str.split("/")[1] if len(relative_str.split("/")) > 1 else None
                    if iac_dir != iac_type:
                        # Skip files from other IaC types
                        continue

                # Read file as bytes
                with open(file_path, "rb") as f:
                    files[relative_str] = f.read()

        logger.info(f"Loaded {len(files)} files from template {template_name} (IaC: {iac_type})")

        return files

    def list_templates(self) -> List[str]:
        """
        List available templates

        Returns:
            List of template names
        """
        if not self.templates_dir.exists():
            return []

        templates = [
            d.name for d in self.templates_dir.iterdir()
            if d.is_dir() and not d.name.startswith(".")
        ]

        return sorted(templates)

    def validate_template(self, template_name: str) -> bool:
        """
        Validate that a template exists and has required files

        Args:
            template_name: Name of the template

        Returns:
            True if valid, False otherwise
        """
        template_path = self.templates_dir / template_name

        if not template_path.exists():
            return False

        # Check for required files/directories
        required_items = [
            "iac",
            "src",
            "requirements.txt",
            "Dockerfile",
            "README.md"
        ]

        for item in required_items:
            if not (template_path / item).exists():
                logger.warning(f"Template {template_name} missing required item: {item}")
                return False

        return True
