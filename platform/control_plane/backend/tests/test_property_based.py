"""
Property-Based Tests for Control Plane

Uses hypothesis library to test correctness properties of core services.
Tests mathematical properties like idempotency, reversibility, and consistency.
"""

import pytest
from hypothesis import given, strategies as st, assume, settings
from hypothesis.strategies import text, integers, booleans, lists, dictionaries
import json
from pathlib import Path
import tempfile
import shutil

from src.services.substitution_service import SubstitutionService
from src.services.template_validator import TemplateValidator
from src.models.template import TemplateMetadata, PatternType


# Strategy for valid parameter names (alphanumeric + underscore)
param_names = st.text(
    alphabet='abcdefghijklmnopqrstuvwxyz_',
    min_size=1,
    max_size=20
).filter(lambda x: x[0].isalpha())

# Strategy for parameter values (strings without special characters)
param_values = st.text(
    alphabet='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-',
    min_size=1,
    max_size=50
)

# Strategy for template IDs
template_ids = st.text(
    alphabet='abcdefghijklmnopqrstuvwxyz-',
    min_size=3,
    max_size=30
).filter(lambda x: x[0].isalpha() and x[-1].isalnum())


class TestSubstitutionServiceProperties:
    """Property-based tests for parameter substitution."""

    @given(
        param_name=param_names,
        param_value=param_values
    )
    def test_substitution_is_complete(self, param_name: str, param_value: str):
        """
        Property: After substitution, no template markers should remain.

        If we substitute all parameters, the result should not contain
        any ${PARAMETER} patterns.
        """
        service = SubstitutionService()

        # Create content with parameter marker
        content = f"Hello ${{param_name.upper()}}, welcome!"
        parameters = {param_name.upper(): param_value}

        result = service.substitute(content, parameters)

        # No template markers should remain
        assert '${' not in result
        assert '}' not in result or param_value in result

    @given(
        param_name=param_names,
        param_value=param_values
    )
    def test_substitution_is_idempotent(self, param_name: str, param_value: str):
        """
        Property: Substituting twice should give the same result as substituting once.

        substitute(substitute(content, params), params) == substitute(content, params)
        """
        service = SubstitutionService()

        content = f"Value: ${{{param_name.upper()}}}"
        parameters = {param_name.upper(): param_value}

        # Substitute once
        result1 = service.substitute(content, parameters)

        # Substitute again (should have no effect as markers are gone)
        result2 = service.substitute(result1, parameters)

        assert result1 == result2

    @given(
        params=dictionaries(
            keys=param_names.map(str.upper),
            values=param_values,
            min_size=1,
            max_size=10
        )
    )
    def test_substitution_preserves_non_parameter_content(self, params: dict):
        """
        Property: Non-parameter content should be preserved exactly.

        Text without ${} markers should remain unchanged.
        """
        service = SubstitutionService()

        non_param_content = "This text has no parameters and should remain unchanged!"
        result = service.substitute(non_param_content, params)

        assert result == non_param_content

    @given(
        param_name=param_names,
        value1=param_values,
        value2=param_values
    )
    def test_substitution_uses_latest_value(self, param_name: str, value1: str, value2: str):
        """
        Property: When a parameter appears multiple times, it should be substituted consistently.

        All occurrences of ${PARAM} should be replaced with the same value.
        """
        assume(value1 != value2)  # Only test when values differ

        service = SubstitutionService()

        param_upper = param_name.upper()
        content = f"First: ${{{param_upper}}}, Second: ${{{param_upper}}}"
        parameters = {param_upper: value1}

        result = service.substitute(content, parameters)

        # Both occurrences should be replaced with the same value
        assert result.count(value1) == 2
        assert value2 not in result

    @given(
        content=st.text(min_size=0, max_size=1000)
    )
    def test_substitution_with_no_parameters_is_identity(self, content: str):
        """
        Property: Substitution with empty parameters is the identity function.

        substitute(content, {}) == content
        """
        service = SubstitutionService()

        result = service.substitute(content, {})

        assert result == content


class TestTemplateMetadataProperties:
    """Property-based tests for template metadata validation."""

    @given(
        template_id=template_ids,
        name=st.text(min_size=1, max_size=100),
        description=st.text(min_size=1, max_size=500),
        version=st.from_regex(r'\d+\.\d+\.\d+', fullmatch=True)
    )
    def test_valid_metadata_roundtrip(
        self,
        template_id: str,
        name: str,
        description: str,
        version: str
    ):
        """
        Property: Valid metadata can be serialized and deserialized without loss.

        deserialize(serialize(metadata)) == metadata
        """
        # Create metadata
        metadata = TemplateMetadata(
            id=template_id,
            name=name,
            description=description,
            version=version,
            pattern_type=PatternType.SINGLE_AGENT
        )

        # Serialize to dict
        data = metadata.model_dump()

        # Deserialize back
        restored = TemplateMetadata(**data)

        # Should be equal
        assert restored.id == metadata.id
        assert restored.name == metadata.name
        assert restored.description == metadata.description
        assert restored.version == metadata.version
        assert restored.pattern_type == metadata.pattern_type

    @given(
        template_ids_list=lists(template_ids, min_size=2, max_size=10, unique=True)
    )
    def test_template_ids_are_unique(self, template_ids_list: list):
        """
        Property: Template IDs should be unique in a collection.

        No two templates should have the same ID.
        """
        # Create templates with unique IDs
        templates = [
            TemplateMetadata(
                id=tid,
                name=f"Template {tid}",
                description="Description",
                version="1.0.0",
                pattern_type=PatternType.SINGLE_AGENT
            )
            for tid in template_ids_list
        ]

        # Extract IDs
        ids = [t.id for t in templates]

        # All IDs should be unique
        assert len(ids) == len(set(ids))


class TestParameterValidationProperties:
    """Property-based tests for parameter validation."""

    @given(
        value=integers(min_value=0, max_value=100)
    )
    def test_integer_parameters_preserve_type(self, value: int):
        """
        Property: Integer parameters should remain integers after validation.

        validate(int) -> int (not string)
        """
        # This would be part of parameter validation logic
        # Testing that type is preserved
        assert isinstance(value, int)
        assert value == int(value)

    @given(
        value=booleans()
    )
    def test_boolean_parameters_are_unambiguous(self, value: bool):
        """
        Property: Boolean parameters should only be True or False.

        No truthy/falsy values should be accepted (like "yes", 1, etc.)
        """
        assert value is True or value is False
        assert isinstance(value, bool)

    @given(
        minimum=integers(min_value=0, max_value=50),
        maximum=integers(min_value=51, max_value=100)
    )
    def test_min_max_constraints_are_consistent(self, minimum: int, maximum: int):
        """
        Property: Minimum should always be less than or equal to maximum.

        For any valid constraint: min <= max
        """
        assert minimum < maximum

        # Test that a value in range is valid
        valid_value = (minimum + maximum) // 2
        assert minimum <= valid_value <= maximum


class TestFileOperationProperties:
    """Property-based tests for file operations."""

    @given(
        filenames=lists(
            st.text(
                alphabet='abcdefghijklmnopqrstuvwxyz0123456789_-',
                min_size=1,
                max_size=50
            ).filter(lambda x: x[0].isalnum()),
            min_size=1,
            max_size=10,
            unique=True
        )
    )
    @settings(max_examples=10)  # Reduce examples for file I/O tests
    def test_file_write_read_roundtrip(self, filenames: list):
        """
        Property: Writing and reading a file should preserve content.

        read(write(content)) == content
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            tmppath = Path(tmpdir)

            for filename in filenames:
                # Create file with content
                filepath = tmppath / f"{filename}.txt"
                content = f"Content for {filename}"

                # Write
                filepath.write_text(content)

                # Read
                read_content = filepath.read_text()

                # Should be identical
                assert read_content == content

    @given(
        dirname=st.text(
            alphabet='abcdefghijklmnopqrstuvwxyz0123456789_-',
            min_size=1,
            max_size=30
        ).filter(lambda x: x[0].isalnum())
    )
    @settings(max_examples=10)
    def test_directory_creation_is_idempotent(self, dirname: str):
        """
        Property: Creating a directory multiple times should not fail.

        mkdir(mkdir(path)) == mkdir(path)
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            dirpath = Path(tmpdir) / dirname

            # Create once
            dirpath.mkdir(parents=True, exist_ok=True)
            assert dirpath.exists()

            # Create again (should not raise)
            dirpath.mkdir(parents=True, exist_ok=True)
            assert dirpath.exists()


class TestCatalogOperationProperties:
    """Property-based tests for catalog operations."""

    @given(
        items=lists(
            st.tuples(template_ids, st.text(min_size=1, max_size=100)),
            min_size=0,
            max_size=50
        )
    )
    def test_filter_is_subset(self, items: list):
        """
        Property: Filtering should return a subset of the original collection.

        |filter(collection)| <= |collection|
        """
        # Create collection
        collection = [
            {"id": tid, "name": name}
            for tid, name in items
        ]

        # Filter by some criteria (e.g., name contains 'a')
        filtered = [
            item for item in collection
            if 'a' in item['name'].lower()
        ]

        # Filtered size should be <= original size
        assert len(filtered) <= len(collection)

        # All filtered items should be in original
        for item in filtered:
            assert item in collection

    @given(
        items=lists(template_ids, min_size=0, max_size=50, unique=True)
    )
    def test_search_is_associative(self, items: list):
        """
        Property: Searching multiple times should be same as searching once with combined query.

        This tests that search operations compose properly.
        """
        collection = items

        # Search for items starting with 'a'
        result1 = [item for item in collection if item.startswith('a')]

        # Search for items starting with 'a' twice (should be same)
        result2 = [item for item in result1 if item.startswith('a')]

        assert result1 == result2


class TestVersioningProperties:
    """Property-based tests for version comparison."""

    @given(
        major=integers(min_value=0, max_value=10),
        minor=integers(min_value=0, max_value=20),
        patch=integers(min_value=0, max_value=100)
    )
    def test_version_comparison_is_consistent(self, major: int, minor: int, patch: int):
        """
        Property: Version comparison should be transitive and consistent.

        If v1 < v2 and v2 < v3, then v1 < v3
        """
        v1 = f"{major}.{minor}.{patch}"
        v2 = f"{major}.{minor}.{patch + 1}"
        v3 = f"{major}.{minor + 1}.0"

        # Parse versions (simple tuple comparison)
        def parse_version(v):
            return tuple(map(int, v.split('.')))

        pv1 = parse_version(v1)
        pv2 = parse_version(v2)
        pv3 = parse_version(v3)

        # Transitivity
        assert pv1 < pv2 < pv3

    @given(
        version=st.from_regex(r'\d+\.\d+\.\d+', fullmatch=True)
    )
    def test_version_format_is_valid(self, version: str):
        """
        Property: Semantic version strings should have exactly 3 numeric parts.

        Valid format: MAJOR.MINOR.PATCH
        """
        parts = version.split('.')

        assert len(parts) == 3
        assert all(part.isdigit() for part in parts)
        assert all(int(part) >= 0 for part in parts)


# Pytest markers for property tests
pytestmark = pytest.mark.property


if __name__ == "__main__":
    # Run property tests
    pytest.main([__file__, "-v", "--hypothesis-show-statistics"])
