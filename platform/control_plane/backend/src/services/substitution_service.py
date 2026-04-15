"""
Variable substitution service for templates
"""

import re
import json
from typing import Dict, Any
import logging

logger = logging.getLogger(__name__)


class SubstitutionService:
    """Service for substituting variables in template files"""

    # Binary file extensions that should not be processed
    BINARY_EXTENSIONS = {
        ".png", ".jpg", ".jpeg", ".gif", ".ico", ".pdf",
        ".zip", ".tar", ".gz", ".bz2",
        ".exe", ".dll", ".so", ".dylib"
    }

    def __init__(self):
        """Initialize substitution service"""
        self.variable_pattern = re.compile(r'\$\{([A-Z_]+)\}')

    def substitute_variables(
        self,
        template_files: Dict[str, bytes],
        variables: Dict[str, Any]
    ) -> Dict[str, bytes]:
        """
        Substitute variables in template files

        Args:
            template_files: Dictionary of file paths to file contents (bytes)
            variables: Dictionary of variable names to values

        Returns:
            Dictionary of file paths to processed contents (bytes)
        """
        logger.info(f"Substituting variables in {len(template_files)} files")
        logger.debug(f"Variables: {list(variables.keys())}")

        processed_files = {}

        for file_path, content in template_files.items():
            # Check if file should be processed
            if self._is_binary_file(file_path):
                # Binary file - don't process
                processed_files[file_path] = content
                continue

            try:
                # Decode to string
                text_content = content.decode('utf-8')

                # Substitute variables
                processed_content = self._substitute_in_text(text_content, variables)

                # Encode back to bytes
                processed_files[file_path] = processed_content.encode('utf-8')

            except UnicodeDecodeError:
                # File is not UTF-8 text - treat as binary
                logger.warning(f"Could not decode {file_path}, treating as binary")
                processed_files[file_path] = content

        logger.info(f"Processed {len(processed_files)} files")

        return processed_files

    def _substitute_in_text(self, text: str, variables: Dict[str, Any]) -> str:
        """
        Substitute variables in text content

        Args:
            text: Text content
            variables: Variables to substitute

        Returns:
            Processed text
        """
        def replacer(match):
            var_name = match.group(1)
            value = variables.get(var_name)

            if value is None:
                logger.warning(f"Variable not found: {var_name}")
                return match.group(0)  # Leave as-is

            # Convert value to string based on type
            if isinstance(value, dict):
                # JSON-encode dictionaries (for tags, etc.)
                return json.dumps(value)
            elif isinstance(value, (list, tuple)):
                return json.dumps(value)
            elif isinstance(value, bool):
                return str(value).lower()
            else:
                return str(value)

        return self.variable_pattern.sub(replacer, text)

    def _is_binary_file(self, file_path: str) -> bool:
        """
        Check if file should be treated as binary

        Args:
            file_path: Path to file

        Returns:
            True if binary, False otherwise
        """
        # Check extension
        ext = "." + file_path.split(".")[-1] if "." in file_path else ""
        return ext.lower() in self.BINARY_EXTENSIONS

    def extract_variables(self, text: str) -> set[str]:
        """
        Extract variable names from text

        Args:
            text: Text content

        Returns:
            Set of variable names found
        """
        matches = self.variable_pattern.findall(text)
        return set(matches)

    def validate_variables(
        self,
        template_files: Dict[str, bytes],
        variables: Dict[str, Any]
    ) -> Dict[str, list[str]]:
        """
        Validate that all required variables are provided

        Args:
            template_files: Template files
            variables: Provided variables

        Returns:
            Dictionary of file paths to missing variable names
        """
        missing_by_file = {}

        for file_path, content in template_files.items():
            if self._is_binary_file(file_path):
                continue

            try:
                text_content = content.decode('utf-8')
                required_vars = self.extract_variables(text_content)
                missing_vars = required_vars - set(variables.keys())

                if missing_vars:
                    missing_by_file[file_path] = list(missing_vars)

            except UnicodeDecodeError:
                continue

        return missing_by_file
