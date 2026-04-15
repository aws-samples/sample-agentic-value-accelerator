"""
Unit tests for TemplateCatalog service
"""

import pytest
import json
from pathlib import Path
import tempfile
import shutil

from src.services.template_catalog import TemplateCatalog
from src.models.template import PatternType


class TestTemplateCatalog:
    """Test suite for TemplateCatalog"""

    @pytest.fixture
    def temp_templates_dir(self):
        """Create temporary templates directory with test templates"""
        temp_dir = tempfile.mkdtemp()

        # Create template 1: single-agent with langraph
        template1_dir = Path(temp_dir) / "template1"
        template1_dir.mkdir()

        template1_metadata = {
            "id": "template1",
            "name": "Template One",
            "description": "First test template for single agent",
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
            "parameters": [],
            "example_use_cases": ["Single agent use case"],
            "tags": ["single", "langraph"]
        }

        with open(template1_dir / "template.json", "w") as f:
            json.dump(template1_metadata, f)

        # Create required structure
        (template1_dir / "src" / "langraph").mkdir(parents=True)
        (template1_dir / "iac" / "terraform").mkdir(parents=True)
        (template1_dir / "README.md").write_text("# Template 1")
        (template1_dir / "Dockerfile").write_text("FROM python:3.11")
        (template1_dir / "requirements.txt").write_text("fastapi==0.109.0")

        # Create template 2: rag with multiple frameworks
        template2_dir = Path(temp_dir) / "template2"
        template2_dir.mkdir()

        template2_metadata = {
            "id": "template2",
            "name": "Template Two",
            "description": "Second test template for RAG applications",
            "version": "2.0.0",
            "pattern_type": "rag",
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
            "parameters": [],
            "example_use_cases": ["RAG application", "Knowledge base"],
            "tags": ["rag", "retrieval"]
        }

        with open(template2_dir / "template.json", "w") as f:
            json.dump(template2_metadata, f)

        # Create required structure
        (template2_dir / "src" / "langraph").mkdir(parents=True)
        (template2_dir / "src" / "strands").mkdir(parents=True)
        (template2_dir / "iac" / "terraform").mkdir(parents=True)
        (template2_dir / "iac" / "cdk").mkdir(parents=True)
        (template2_dir / "README.md").write_text("# Template 2")
        (template2_dir / "Dockerfile").write_text("FROM python:3.11")
        (template2_dir / "requirements.txt").write_text("fastapi==0.109.0")

        yield temp_dir

        # Cleanup
        shutil.rmtree(temp_dir)

    @pytest.fixture
    def catalog(self, temp_templates_dir):
        """Create catalog instance with test templates"""
        return TemplateCatalog(str(temp_templates_dir))

    def test_catalog_initialization(self, catalog):
        """Test catalog initializes and loads templates"""
        assert catalog is not None
        assert len(catalog._templates) == 2

    def test_list_all_templates(self, catalog):
        """Test listing all templates"""
        templates = catalog.list_templates()

        assert len(templates) == 2
        assert templates[0].metadata.name == "Template One"
        assert templates[1].metadata.name == "Template Two"

    def test_list_templates_filter_by_pattern_type(self, catalog):
        """Test filtering templates by pattern type"""
        templates = catalog.list_templates(pattern_type="single_agent")

        assert len(templates) == 1
        assert templates[0].metadata.id == "template1"
        assert templates[0].metadata.pattern_type == PatternType.SINGLE_AGENT

    def test_list_templates_filter_by_framework(self, catalog):
        """Test filtering templates by framework"""
        # Both templates support langraph
        templates = catalog.list_templates(framework="langraph")
        assert len(templates) == 2

        # Only template2 supports strands
        templates = catalog.list_templates(framework="strands")
        assert len(templates) == 1
        assert templates[0].metadata.id == "template2"

    def test_list_templates_filter_by_deployment_pattern(self, catalog):
        """Test filtering templates by deployment pattern"""
        # Both templates support terraform
        templates = catalog.list_templates(deployment_pattern="terraform")
        assert len(templates) == 2

        # Only template2 supports cdk
        templates = catalog.list_templates(deployment_pattern="cdk")
        assert len(templates) == 1
        assert templates[0].metadata.id == "template2"

    def test_list_templates_multiple_filters(self, catalog):
        """Test filtering with multiple criteria"""
        templates = catalog.list_templates(
            pattern_type="rag",
            framework="strands",
            deployment_pattern="cdk"
        )

        assert len(templates) == 1
        assert templates[0].metadata.id == "template2"

    def test_get_template_by_id(self, catalog):
        """Test getting specific template by ID"""
        template = catalog.get_template("template1")

        assert template is not None
        assert template.metadata.id == "template1"
        assert template.metadata.name == "Template One"

    def test_get_template_not_found(self, catalog):
        """Test getting non-existent template returns None"""
        template = catalog.get_template("nonexistent")

        assert template is None

    def test_search_templates_by_name(self, catalog):
        """Test searching templates by name"""
        results = catalog.search_templates("Template One")

        assert len(results) == 1
        assert results[0].metadata.id == "template1"

    def test_search_templates_by_description(self, catalog):
        """Test searching templates by description"""
        results = catalog.search_templates("RAG applications")

        assert len(results) == 1
        assert results[0].metadata.id == "template2"

    def test_search_templates_by_tag(self, catalog):
        """Test searching templates by tag"""
        results = catalog.search_templates("rag")

        assert len(results) == 1
        assert results[0].metadata.id == "template2"

    def test_search_templates_by_use_case(self, catalog):
        """Test searching templates by use case"""
        results = catalog.search_templates("Knowledge base")

        assert len(results) == 1
        assert results[0].metadata.id == "template2"

    def test_search_templates_case_insensitive(self, catalog):
        """Test search is case-insensitive"""
        results = catalog.search_templates("TEMPLATE ONE")

        assert len(results) == 1
        assert results[0].metadata.id == "template1"

    def test_search_templates_no_results(self, catalog):
        """Test search with no matches"""
        results = catalog.search_templates("nonexistent")

        assert len(results) == 0

    def test_validate_template_valid(self, catalog):
        """Test validating a valid template"""
        result = catalog.validate_template("template1")

        assert result["valid"] is True
        assert len(result["errors"]) == 0

    def test_validate_template_not_found(self, catalog):
        """Test validating non-existent template"""
        result = catalog.validate_template("nonexistent")

        assert result["valid"] is False
        assert len(result["errors"]) > 0
        assert "not found" in result["errors"][0].lower()

    def test_get_statistics(self, catalog):
        """Test catalog statistics"""
        stats = catalog.get_statistics()

        assert stats["total_templates"] == 2
        assert "single_agent" in stats["pattern_types"]
        assert "rag" in stats["pattern_types"]
        assert stats["pattern_types"]["single_agent"] == 1
        assert stats["pattern_types"]["rag"] == 1
        assert "langraph" in stats["frameworks"]
        assert "strands" in stats["frameworks"]
        assert "terraform" in stats["deployment_patterns"]
        assert "cdk" in stats["deployment_patterns"]

    def test_reload_catalog(self, catalog, temp_templates_dir):
        """Test reloading catalog"""
        # Initial state
        assert len(catalog._templates) == 2

        # Add new template
        template3_dir = Path(temp_templates_dir) / "template3"
        template3_dir.mkdir()

        template3_metadata = {
            "id": "template3",
            "name": "Template Three",
            "description": "Third template",
            "version": "1.0.0",
            "pattern_type": "single_agent",
            "frameworks": [{"id": "langraph", "name": "LangGraph", "path": "src/langraph"}],
            "deployment_patterns": [{"id": "terraform", "name": "Terraform", "description": "IaC", "path": "iac/terraform"}],
            "parameters": [],
            "example_use_cases": [],
            "tags": []
        }

        with open(template3_dir / "template.json", "w") as f:
            json.dump(template3_metadata, f)

        (template3_dir / "src" / "langraph").mkdir(parents=True)
        (template3_dir / "iac" / "terraform").mkdir(parents=True)
        (template3_dir / "README.md").write_text("# Template 3")
        (template3_dir / "Dockerfile").write_text("FROM python:3.11")
        (template3_dir / "requirements.txt").write_text("")

        # Reload
        catalog.reload()

        # Verify new template is loaded
        assert len(catalog._templates) == 3
        assert catalog.get_template("template3") is not None
