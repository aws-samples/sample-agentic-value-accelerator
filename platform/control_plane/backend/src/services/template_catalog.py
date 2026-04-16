"""
Template catalog service for managing available templates
"""

import json
from pathlib import Path
from typing import List, Optional, Dict, Any
import logging

from models.template import Template, TemplateMetadata, PatternType
from services.template_validator import TemplateValidator

logger = logging.getLogger(__name__)


class TemplateCatalog:
    """Service for managing the template catalog"""

    def __init__(self, templates_dir: str = "templates", extra_dirs: Optional[List[str]] = None):
        """
        Initialize template catalog

        Args:
            templates_dir: Path to templates directory
            extra_dirs: Additional directories to scan for templates
        """
        self.templates_dir = Path(templates_dir)
        if not self.templates_dir.is_absolute():
            # Relative to backend directory
            self.templates_dir = Path(__file__).parent.parent.parent.parent / templates_dir

        self.extra_dirs = []
        for d in (extra_dirs or []):
            p = Path(d)
            if not p.is_absolute():
                p = Path(__file__).parent.parent.parent.parent / d
            self.extra_dirs.append(p)

        self._templates: Dict[str, Template] = {}
        self._load_templates()

    def _load_templates(self):
        """Load all templates from directories"""
        dirs_to_scan = [self.templates_dir] + self.extra_dirs

        for scan_dir in dirs_to_scan:
            if not scan_dir.exists():
                logger.warning(f"Templates directory not found: {scan_dir}")
                continue

            logger.info(f"Loading templates from: {scan_dir}")

            for template_dir in scan_dir.iterdir():
                if not template_dir.is_dir() or template_dir.name.startswith("."):
                    continue

                try:
                    template = self._load_template(template_dir)
                    if template:
                        self._templates[template.metadata.id] = template
                        logger.info(f"Loaded template: {template.metadata.id}")
                except Exception as e:
                    logger.error(f"Failed to load template from {template_dir}: {e}")

        logger.info(f"Loaded {len(self._templates)} templates")

    def _load_template(self, template_path: Path) -> Optional[Template]:
        """
        Load a single template

        Args:
            template_path: Path to template directory

        Returns:
            Template instance or None if invalid
        """
        metadata_path = template_path / "template.json"
        if not metadata_path.exists():
            logger.warning(f"No template.json found in {template_path}")
            return None

        try:
            with open(metadata_path, "r") as f:
                metadata_dict = json.load(f)

            metadata = TemplateMetadata(**metadata_dict)
            return Template(metadata=metadata, path=str(template_path))
        except Exception as e:
            logger.error(f"Failed to parse template metadata: {e}")
            return None

    def list_templates(
        self,
        pattern_type: Optional[str] = None,
        framework: Optional[str] = None,
        deployment_pattern: Optional[str] = None,
        template_type: Optional[str] = None
    ) -> List[Template]:
        """
        List templates with optional filtering

        Args:
            pattern_type: Filter by pattern type
            framework: Filter by framework support
            deployment_pattern: Filter by deployment pattern support

        Returns:
            List of matching templates
        """
        templates = list(self._templates.values())

        # Filter by pattern type
        if pattern_type:
            try:
                pattern_enum = PatternType(pattern_type)
                templates = [t for t in templates if t.metadata.pattern_type == pattern_enum]
            except ValueError:
                logger.warning(f"Invalid pattern type: {pattern_type}")
                return []

        # Filter by type (foundation/usecase)
        if template_type:
            templates = [t for t in templates if t.metadata.type == template_type]

        # Filter by framework
        if framework:
            templates = [t for t in templates if t.supports_framework(framework)]

        # Filter by deployment pattern
        if deployment_pattern:
            templates = [t for t in templates if t.supports_deployment_pattern(deployment_pattern)]

        # Sort foundations first, then alphabetically by name
        templates.sort(key=lambda t: (t.metadata.type != "foundation", t.metadata.name))

        return templates

    def get_template(self, template_id: str) -> Optional[Template]:
        """
        Get a specific template by ID

        Args:
            template_id: Template identifier

        Returns:
            Template or None if not found
        """
        return self._templates.get(template_id)

    def get_foundations(self) -> List[Template]:
        """Get all foundation templates"""
        return self.list_templates(template_type="foundation")

    def get_usecases(self) -> List[Template]:
        """Get all usecase templates"""
        return self.list_templates(template_type="usecase")

    def search_templates(self, query: str) -> List[Template]:
        """
        Search templates by keyword

        Args:
            query: Search query

        Returns:
            List of matching templates
        """
        query_lower = query.lower()
        results = []

        for template in self._templates.values():
            # Search in name, description, tags, use cases
            searchable = [
                template.metadata.name.lower(),
                template.metadata.description.lower(),
                *[tag.lower() for tag in template.metadata.tags],
                *[uc.lower() for uc in template.metadata.example_use_cases]
            ]

            if any(query_lower in text for text in searchable):
                results.append(template)

        # Sort by relevance (name matches first)
        results.sort(key=lambda t: (
            query_lower not in t.metadata.name.lower(),
            t.metadata.name
        ))

        return results

    def validate_template(self, template_id: str) -> Dict[str, Any]:
        """
        Validate a template

        Args:
            template_id: Template identifier

        Returns:
            Validation result dict
        """
        template = self.get_template(template_id)
        if not template:
            return {
                "valid": False,
                "errors": [f"Template not found: {template_id}"],
                "warnings": []
            }

        validator = TemplateValidator()
        result = validator.validate_template(Path(template.path))

        return {
            "valid": result.valid,
            "errors": result.errors,
            "warnings": result.warnings
        }

    def reload(self):
        """Reload all templates from disk"""
        self._templates.clear()
        self._load_templates()

    def get_statistics(self) -> Dict[str, Any]:
        """
        Get catalog statistics

        Returns:
            Statistics dict
        """
        templates = list(self._templates.values())

        # Count by pattern type
        pattern_counts = {}
        for pattern_type in PatternType:
            count = sum(1 for t in templates if t.metadata.pattern_type == pattern_type)
            if count > 0:
                pattern_counts[pattern_type.value] = count

        # Collect all frameworks
        frameworks = set()
        for template in templates:
            for framework in template.metadata.frameworks:
                frameworks.add(framework.id)

        # Collect all deployment patterns
        deployment_patterns = set()
        for template in templates:
            for pattern in template.metadata.deployment_patterns:
                deployment_patterns.add(pattern.id)

        return {
            "total_templates": len(templates),
            "pattern_types": pattern_counts,
            "frameworks": sorted(list(frameworks)),
            "deployment_patterns": sorted(list(deployment_patterns))
        }
