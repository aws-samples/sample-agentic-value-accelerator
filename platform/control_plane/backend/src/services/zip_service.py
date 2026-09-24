"""
Zip service for creating project archives
"""

import zipfile
import io
import time
from typing import Dict
import logging

logger = logging.getLogger(__name__)

# Unix file modes stamped into archive entries.
#
# zipfile.writestr() with a plain filename records mode 0600, so every extracted file
# ends up readable only by the user that unzipped it (root, in CodeBuild). Anything that
# later runs as a non-root user cannot read those files: an agent container whose
# Dockerfile ends in `USER appuser` fails at startup with
#   PermissionError: [Errno 13] Permission denied: '/app/main.py'
# and shell scripts arrive non-executable (which is why the buildspec has to chmod +x
# deploy.sh). Stamping real modes fixes both at the source.
DEFAULT_FILE_MODE = 0o644
EXECUTABLE_FILE_MODE = 0o755
EXECUTABLE_SUFFIXES = (".sh", ".bash", ".zsh")
UNIX_CREATE_SYSTEM = 3  # required, or unzip ignores external_attr entirely


def _file_mode(path: str, content: bytes) -> int:
    """Executable for shell scripts and anything with a shebang, else read-only."""
    if path.endswith(EXECUTABLE_SUFFIXES):
        return EXECUTABLE_FILE_MODE
    if content[:2] == b"#!":
        return EXECUTABLE_FILE_MODE
    return DEFAULT_FILE_MODE


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

                # Add files to zip, stamping Unix permissions so extracted files stay
                # readable (and scripts executable) for users other than the extractor.
                now = time.localtime(time.time())[:6]
                for file_path, content in files.items():
                    info = zipfile.ZipInfo(filename=file_path, date_time=now)
                    info.create_system = UNIX_CREATE_SYSTEM
                    info.external_attr = _file_mode(file_path, content) << 16
                    # compress_type comes from the entry, not the ZipFile, when a
                    # ZipInfo is supplied — without this every entry would be stored.
                    info.compress_type = zipfile.ZIP_DEFLATED
                    zip_file.writestr(info, content)

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
