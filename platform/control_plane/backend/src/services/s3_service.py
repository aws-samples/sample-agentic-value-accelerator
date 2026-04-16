"""
S3 service for uploading and managing project archives
"""

import boto3
from botocore.exceptions import ClientError
from datetime import datetime, timedelta
import logging
from typing import Optional

from core.config import settings

logger = logging.getLogger(__name__)


class S3Service:
    """Service for S3 operations"""

    def __init__(self):
        """Initialize S3 service"""
        self.s3_client = boto3.client("s3", region_name=settings.AWS_REGION)
        self.bucket_name = settings.S3_BUCKET_NAME

    def upload_project(self, zip_data: bytes, project_name: str) -> tuple[str, str]:
        """
        Upload project zip to S3

        Args:
            zip_data: Zip file contents as bytes
            project_name: Name of the project

        Returns:
            Tuple of (s3_key, presigned_url)

        Raises:
            Exception: If upload fails
        """
        # Generate S3 key
        timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
        s3_key = f"projects/{project_name}/{timestamp}/{project_name}.zip"

        logger.info(f"Uploading project to S3: {s3_key}")

        try:
            # Upload to S3
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=s3_key,
                Body=zip_data,
                ContentType="application/zip",
                ServerSideEncryption="AES256",
                Metadata={
                    "project-name": project_name,
                    "created-at": datetime.utcnow().isoformat()
                }
            )

            logger.info(f"Successfully uploaded to S3: {s3_key}")

            # Generate presigned URL
            presigned_url = self.generate_presigned_url(s3_key)

            return s3_key, presigned_url

        except ClientError as e:
            logger.error(f"Failed to upload to S3: {e}")
            raise Exception(f"S3 upload failed: {str(e)}")

    def generate_presigned_url(
        self,
        s3_key: str,
        expiration: int = 604800  # 7 days in seconds
    ) -> str:
        """
        Generate presigned URL for S3 object

        Args:
            s3_key: S3 object key
            expiration: URL expiration time in seconds (default: 7 days)

        Returns:
            Presigned URL

        Raises:
            Exception: If URL generation fails
        """
        try:
            presigned_url = self.s3_client.generate_presigned_url(
                "get_object",
                Params={
                    "Bucket": self.bucket_name,
                    "Key": s3_key
                },
                ExpiresIn=expiration
            )

            logger.info(f"Generated presigned URL for {s3_key}")

            return presigned_url

        except ClientError as e:
            logger.error(f"Failed to generate presigned URL: {e}")
            raise Exception(f"Presigned URL generation failed: {str(e)}")

    def delete_project(self, s3_key: str) -> bool:
        """
        Delete project from S3

        Args:
            s3_key: S3 object key

        Returns:
            True if successful

        Raises:
            Exception: If deletion fails
        """
        try:
            self.s3_client.delete_object(
                Bucket=self.bucket_name,
                Key=s3_key
            )

            logger.info(f"Deleted S3 object: {s3_key}")

            return True

        except ClientError as e:
            logger.error(f"Failed to delete from S3: {e}")
            raise Exception(f"S3 deletion failed: {str(e)}")

    def check_bucket_accessible(self) -> bool:
        """
        Check if S3 bucket is accessible

        Returns:
            True if accessible, False otherwise
        """
        try:
            self.s3_client.head_bucket(Bucket=self.bucket_name)
            return True
        except ClientError:
            return False

    def get_expiration_time(self, expiration_seconds: int = 604800) -> datetime:
        """
        Calculate expiration datetime

        Args:
            expiration_seconds: Expiration time in seconds (default: 7 days)

        Returns:
            Expiration datetime
        """
        return datetime.utcnow() + timedelta(seconds=expiration_seconds)
