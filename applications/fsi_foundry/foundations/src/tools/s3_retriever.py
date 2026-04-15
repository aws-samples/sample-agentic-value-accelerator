# SPDX-License-Identifier: Apache-2.0
# Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.

import json
import re
import boto3
import structlog
from pydantic import BaseModel, Field
from botocore.exceptions import ClientError
from langchain_core.tools import tool
from config.settings import settings

logger = structlog.get_logger()

# Regex pattern for valid customer IDs (alphanumeric, underscore, hyphen only)
VALID_CUSTOMER_ID_PATTERN = re.compile(r'^[A-Za-z0-9_-]+$')


def _validate_customer_id(customer_id: str) -> None:
    """
    Validate customer_id to prevent path traversal attacks.
    
    Args:
        customer_id: The customer identifier to validate
        
    Raises:
        ValueError: If customer_id is empty, contains path traversal sequences,
                   or contains invalid characters
    """
    if not customer_id:
        raise ValueError("customer_id cannot be empty")
    
    if '..' in customer_id:
        raise ValueError("customer_id cannot contain path traversal sequences (..)")
    
    if '/' in customer_id or '\\' in customer_id:
        raise ValueError("customer_id cannot contain path separators (/ or \\)")
    
    if not VALID_CUSTOMER_ID_PATTERN.match(customer_id):
        raise ValueError(
            "customer_id contains invalid characters. "
            "Only alphanumeric characters, underscores, and hyphens are allowed."
        )


class S3Retriever:
    """Retrieves customer data from Amazon S3 bucket."""

    def __init__(
        self,
        bucket_name: str | None = None,
        region: str | None = None,
        data_prefix: str | None = None,
    ):
        self.bucket_name = bucket_name or settings.s3_bucket_name
        self.region = region or settings.aws_region
        # Use settings.data_prefix if available, otherwise default to kyc banking customers
        if data_prefix is not None:
            self.data_prefix = data_prefix
        elif settings.data_prefix:
            self.data_prefix = settings.data_prefix
        else:
            self.data_prefix = "samples/kyc_banking"
        self._client = None

    @property
    def client(self):
        """
        Lazy initialization of Amazon S3 client using default credential chain.
        
        Credentials are resolved via the default boto3 credential chain:
        - IAM role (for Amazon EC2, AWS Lambda, Amazon ECS)
        - Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
        - Shared credentials file (~/.aws/credentials)
        - AWS config file (~/.aws/config)
        
        See: https://boto3.amazonaws.com/v1/documentation/api/latest/guide/credentials.html
        """
        if self._client is None:
            self._client = boto3.client(
                "s3",
                region_name=self.region,
                # Credentials resolved via default credential chain
            )
        return self._client

    def get_customer_profile(self, customer_id: str) -> dict:
        """Retrieve customer profile from Amazon S3."""
        _validate_customer_id(customer_id)
        key = f"{self.data_prefix}/{customer_id}/profile.json"
        return self._get_json_object(key)

    def get_transaction_history(self, customer_id: str) -> dict:
        """Retrieve customer transaction history from Amazon S3."""
        _validate_customer_id(customer_id)
        key = f"{self.data_prefix}/{customer_id}/transactions.json"
        return self._get_json_object(key)

    def get_credit_history(self, customer_id: str) -> dict:
        """Retrieve customer credit history from Amazon S3."""
        _validate_customer_id(customer_id)
        key = f"{self.data_prefix}/{customer_id}/credit_history.json"
        return self._get_json_object(key)

    def get_compliance_records(self, customer_id: str) -> dict:
        """Retrieve customer compliance records from Amazon S3."""
        _validate_customer_id(customer_id)
        key = f"{self.data_prefix}/{customer_id}/compliance.json"
        return self._get_json_object(key)

    def _get_json_object(self, key: str) -> dict:
        """Retrieve and parse JSON object from S3."""
        try:
            response = self.client.get_object(Bucket=self.bucket_name, Key=key)
            content = response["Body"].read().decode("utf-8")
            return json.loads(content)
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "Unknown")
            if error_code == "NoSuchKey":
                logger.warning("s3_object_not_found", bucket=self.bucket_name, key=key)
                return {"error": "Data not found", "key": key}
            logger.error("s3_client_error", error=str(e), bucket=self.bucket_name, key=key)
            raise
        except json.JSONDecodeError as e:
            logger.error("json_decode_error", error=str(e), key=key)
            return {"error": "Invalid JSON format", "key": key}


# Lazy-initialized global retriever instance
_retriever: S3Retriever | None = None


def _get_retriever() -> S3Retriever:
    """Get or create the global S3Retriever instance (lazy initialization)."""
    global _retriever
    if _retriever is None:
        _retriever = S3Retriever()
    return _retriever


class S3RetrieverInput(BaseModel):
    """Input schema for the S3 retriever tool."""
    customer_id: str = Field(
        description="The unique customer identifier (e.g., 'CUST001')",
        alias="customerId",
    )
    data_type: str = Field(
        description="Type of data to retrieve. Options: 'profile', 'transactions', 'credit_history', 'compliance'",
        alias="dataType",
    )

    model_config = {"populate_by_name": True}


@tool(args_schema=S3RetrieverInput)
def s3_retriever_tool(customer_id: str, data_type: str) -> str:
    """
    Retrieve customer data from S3 storage.

    Args:
        customer_id: The unique customer identifier (e.g., 'CUST001')
        data_type: Type of data to retrieve. Options: 'profile', 'transactions',
                   'credit_history', 'compliance'

    Returns:
        JSON string containing the requested customer data
    """
    retrieval_methods = {
        "profile": _get_retriever().get_customer_profile,
        "transactions": _get_retriever().get_transaction_history,
        "credit_history": _get_retriever().get_credit_history,
        "compliance": _get_retriever().get_compliance_records,
    }

    if data_type not in retrieval_methods:
        return json.dumps({
            "error": f"Invalid data_type: {data_type}",
            "valid_options": list(retrieval_methods.keys()),
        })

    try:
        data = retrieval_methods[data_type](customer_id)
        return json.dumps(data, indent=2)
    except Exception as e:
        logger.error("s3_retrieval_error", customer_id=customer_id, data_type=data_type, error=str(e))
        return json.dumps({"error": str(e)})
