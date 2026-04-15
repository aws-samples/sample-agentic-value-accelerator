"""
Zip service for creating project archives
"""

import zipfile
import io
from typing import Dict
import logging

logger = logging.getLogger(__name__)


class ZipService:
    """Service for creating zip archives"""

    def create_zip(self, files: Dict[str, bytes]) -> bytes:
        """
        Create zip archive from files

        Args:
            files: Dictionary mapping file paths to file contents (bytes)

        Returns:
            Zip file contents as bytes

        Raises:
            Exception: If zip creation fails
        """
        logger.info(f"Creating zip archive with {len(files)} files")

        try:
            # Create in-memory zip file
            zip_buffer = io.BytesIO()

            with zipfile.ZipFile(
                zip_buffer,
                mode="w",
                compression=zipfile.ZIP_DEFLATED,
                compresslevel=6
            ) as zip_file:

                # Add files to zip
                for file_path, content in files.items():
                    zip_file.writestr(file_path, content)

            # Get zip contents
            zip_data = zip_buffer.getvalue()

            logger.info(f"Created zip archive: {len(zip_data)} bytes")

            return zip_data

        except Exception as e:
            logger.error(f"Failed to create zip: {e}")
            raise Exception(f"Zip creation failed: {str(e)}")

    def validate_zip(self, zip_data: bytes) -> bool:
        """
        Validate that zip data is valid

        Args:
            zip_data: Zip file contents

        Returns:
            True if valid, False otherwise
        """
        try:
            zip_buffer = io.BytesIO(zip_data)
            with zipfile.ZipFile(zip_buffer, mode="r") as zip_file:
                # Check if zip is valid
                bad_file = zip_file.testzip()
                return bad_file is None
        except Exception as e:
            logger.error(f"Zip validation failed: {e}")
            return False

    def list_files(self, zip_data: bytes) -> list[str]:
        """
        List files in zip archive

        Args:
            zip_data: Zip file contents

        Returns:
            List of file paths in the archive
        """
        try:
            zip_buffer = io.BytesIO(zip_data)
            with zipfile.ZipFile(zip_buffer, mode="r") as zip_file:
                return zip_file.namelist()
        except Exception as e:
            logger.error(f"Failed to list zip contents: {e}")
            return []
