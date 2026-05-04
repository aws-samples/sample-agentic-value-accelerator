# SPDX-License-Identifier: Apache-2.0
# Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.

import base64
import json
import mimetypes
import re
import asyncio
from functools import lru_cache
from typing import Dict, Any
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
    """Retrieves customer data from Amazon S3 bucket with request-scoped caching."""

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
        self._cache: Dict[str, Any] = {}  # Request-scoped cache for parallel agent execution

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

    async def aget_customer_profile(self, customer_id: str) -> dict:
        """Async retrieve customer profile from Amazon S3."""
        return await asyncio.to_thread(self.get_customer_profile, customer_id)

    async def aget_transaction_history(self, customer_id: str) -> dict:
        """Async retrieve customer transaction history from Amazon S3."""
        return await asyncio.to_thread(self.get_transaction_history, customer_id)

    async def aget_credit_history(self, customer_id: str) -> dict:
        """Async retrieve customer credit history from Amazon S3."""
        return await asyncio.to_thread(self.get_credit_history, customer_id)

    async def aget_compliance_records(self, customer_id: str) -> dict:
        """Async retrieve customer compliance records from Amazon S3."""
        return await asyncio.to_thread(self.get_compliance_records, customer_id)

    def _get_json_object(self, key: str) -> dict:
        """Retrieve and parse JSON object from S3 with caching to avoid redundant fetches in parallel execution."""
        # Check cache first
        if key in self._cache:
            logger.debug("s3_cache_hit", key=key)
            return self._cache[key]

        # Cache miss - fetch from S3
        try:
            response = self.client.get_object(Bucket=self.bucket_name, Key=key)
            content = response["Body"].read().decode("utf-8")
            data = json.loads(content)
            self._cache[key] = data  # Cache for subsequent parallel agent requests
            return data
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "Unknown")
            if error_code == "NoSuchKey":
                logger.warning("s3_object_not_found", bucket=self.bucket_name, key=key)
                result = {"error": "Data not found", "key": key}
                self._cache[key] = result  # Cache error to avoid retry
                return result
            logger.error("s3_client_error", error=str(e), bucket=self.bucket_name, key=key)
            raise
        except json.JSONDecodeError as e:
            logger.error("json_decode_error", error=str(e), key=key)
            result = {"error": "Invalid JSON format", "key": key}
            self._cache[key] = result  # Cache error to avoid retry
            return result

    def get_object_by_key(self, key: str) -> dict:
        """Fetch an arbitrary S3 object by key.

        Key is validated to prevent path traversal; it must stay under data_prefix
        unless the caller provided a fully-qualified prefix already.
        """
        if not key:
            return {"error": "key cannot be empty"}
        if ".." in key or key.startswith("/") or "\\" in key:
            return {"error": "invalid key: path traversal not allowed"}
        # Scope arbitrary keys to the data_prefix when a bare path is supplied.
        resolved_key = key if key.startswith(self.data_prefix + "/") else f"{self.data_prefix}/{key}"
        return self._get_binary_object(resolved_key)

    def _get_binary_object(self, key: str) -> dict:
        """Retrieve any S3 object and return as base64-encoded content.

        Returns a dict with:
          - key: the S3 key
          - content_type: MIME type (from S3 metadata or guessed from extension)
          - size_bytes: content length
          - content_base64: base64-encoded body (suitable for LLM ingestion via
            content blocks or decoding in downstream tools)
        """
        try:
            response = self.client.get_object(Bucket=self.bucket_name, Key=key)
            body = response["Body"].read()
            content_type = response.get("ContentType") or mimetypes.guess_type(key)[0] or "application/octet-stream"
            return {
                "key": key,
                "content_type": content_type,
                "size_bytes": len(body),
                "content_base64": base64.b64encode(body).decode("ascii"),
            }
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "Unknown")
            if error_code == "NoSuchKey":
                logger.warning("s3_object_not_found", bucket=self.bucket_name, key=key)
                return {"error": "Document not found", "key": key}
            logger.error("s3_client_error", error=str(e), bucket=self.bucket_name, key=key)
            return {"error": str(e), "key": key}


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
        default="",
        description="The unique customer identifier (e.g., 'CUST001'). Required for data_types 'profile', 'transactions', 'credit_history', 'compliance'. Ignored when data_type='document' (use 'key' instead).",
        alias="customerId",
    )
    data_type: str = Field(
        description="Type of data to retrieve. Options: 'profile', 'transactions', 'credit_history', 'compliance', 'document'",
        alias="dataType",
    )
    key: str = Field(
        default="",
        description="When data_type='document', the S3 key of the document to fetch (e.g., 'APP001/documents/tax_return.pdf'). Binary files are returned as base64.",
    )

    model_config = {"populate_by_name": True}


@tool(args_schema=S3RetrieverInput)
def s3_retriever_tool(customer_id: str = "", data_type: str = "profile", key: str = "") -> str:
    """
    Retrieve data from S3 storage.

    For structured JSON data (profile, transactions, credit_history, compliance), pass
    customer_id and the desired data_type. The tool returns the JSON content as a string.

    For documents (PDFs, images, binary files), pass data_type='document' and the S3 key
    in the `key` argument. The tool returns a JSON envelope with base64-encoded content:
    {"key": "...", "content_type": "application/pdf", "size_bytes": 12345, "content_base64": "..."}

    Args:
        customer_id: Customer/entity identifier for structured data lookups (e.g., 'CUST001')
        data_type: One of 'profile', 'transactions', 'credit_history', 'compliance', 'document'
        key: S3 key for document lookups (only used when data_type='document')

    Returns:
        JSON string. For structured data_types: the decoded JSON object. For 'document':
        an envelope containing content_base64 and metadata.
    """
    retriever = _get_retriever()

    if data_type == "document":
        if not key:
            return json.dumps({"error": "data_type='document' requires a non-empty key"})
        try:
            return json.dumps(retriever.get_object_by_key(key), indent=2)
        except Exception as e:
            logger.error("s3_document_error", key=key, error=str(e))
            return json.dumps({"error": str(e), "key": key})

    structured_methods = {
        "profile": retriever.get_customer_profile,
        "transactions": retriever.get_transaction_history,
        "credit_history": retriever.get_credit_history,
        "compliance": retriever.get_compliance_records,
    }

    if data_type not in structured_methods:
        return json.dumps({
            "error": f"Invalid data_type: {data_type}",
            "valid_options": list(structured_methods.keys()) + ["document"],
        })

    if not customer_id:
        return json.dumps({"error": f"data_type='{data_type}' requires customer_id"})

    try:
        data = structured_methods[data_type](customer_id)
        return json.dumps(data, indent=2)
    except Exception as e:
        logger.error("s3_retrieval_error", customer_id=customer_id, data_type=data_type, error=str(e))
        return json.dumps({"error": str(e)})


class ExtractPdfTextInput(BaseModel):
    """Input schema for extract_pdf_text."""
    s3_key: str = Field(description="S3 key of the PDF to extract")
    max_pages: int = Field(default=20, description="Cap on pages to extract")


@tool(args_schema=ExtractPdfTextInput)
def extract_pdf_text(s3_key: str, max_pages: int = 20) -> str:
    """
    Download a PDF from S3 and return plain text for agent analysis.

    Use this instead of passing raw base64 PDF content into an agent's
    prompt — LLMs cannot reliably decode base64 and parse PDF bytes.
    This tool uses pypdf to extract real text per page.

    Args:
        s3_key: S3 key of the PDF (e.g. 'applications/APP001/documents/tax_return/x.pdf').
        max_pages: Cap on pages returned (default 20).

    Returns:
        JSON string with s3_key, page_count, pages_extracted, pages[] and truncated.
    """
    import base64
    import io

    if not s3_key:
        return json.dumps({"error": "s3_key is required"})

    try:
        envelope = _get_retriever().get_object_by_key(s3_key)
    except Exception as e:
        return json.dumps({"error": f"failed to fetch s3 object: {e}", "s3_key": s3_key})

    if "error" in envelope:
        return json.dumps({"error": envelope["error"], "s3_key": s3_key})

    content_b64 = envelope.get("content_base64", "")
    if not content_b64:
        return json.dumps({"error": "object had no base64 content", "s3_key": s3_key})

    try:
        pdf_bytes = base64.b64decode(content_b64)
    except Exception as e:
        return json.dumps({"error": f"base64 decode failed: {e}", "s3_key": s3_key})

    try:
        from pypdf import PdfReader
    except ImportError:
        return json.dumps({
            "error": "pypdf not installed in runtime; add pypdf>=4.0.0 to requirements.txt",
            "s3_key": s3_key,
        })

    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        total_pages = len(reader.pages)
        pages_out = []
        for idx, page in enumerate(reader.pages):
            if idx >= max_pages:
                break
            try:
                text = page.extract_text() or ""
            except Exception as pe:
                text = f"[text extraction failed on page {idx + 1}: {pe}]"
            pages_out.append({"page": idx + 1, "text": text})
        return json.dumps({
            "s3_key": s3_key,
            "page_count": total_pages,
            "pages_extracted": len(pages_out),
            "pages": pages_out,
            "truncated": total_pages > max_pages,
        }, indent=2)
    except Exception as e:
        return json.dumps({"error": f"pdf parse failed: {e}", "s3_key": s3_key})
