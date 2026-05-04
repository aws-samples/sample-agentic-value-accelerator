# SPDX-License-Identifier: Apache-2.0
"""
S3 Retriever Tools for Strands Agents.

Two tools in this module:
  * s3_retriever_tool — fetches structured JSON or raw binary+base64.
  * extract_pdf_text — downloads a PDF from S3 and returns its plain text
    using pypdf. This exists so document-review agents can read actual
    extracted text instead of trying to mentally parse base64 PDF bytes
    (which is unreliable — the LLM cannot decode FlateDecode or binary
    structures).
"""

import base64
import io
import json
from strands.tools.decorator import tool
from tools.s3_retriever import S3Retriever, _get_retriever
import structlog

logger = structlog.get_logger()


@tool
def s3_retriever_tool(customer_id: str = "", data_type: str = "profile", key: str = "") -> str:
    """
    Retrieve data from S3 storage.

    For structured JSON data, pass customer_id and data_type (one of 'profile',
    'transactions', 'credit_history', 'compliance'). Returns the decoded JSON as
    a string.

    For documents (PDFs, images, binary files), pass data_type='document' and the
    S3 key in the `key` argument. Returns a JSON envelope with base64-encoded
    content: {"key": "...", "content_type": "application/pdf",
    "size_bytes": 12345, "content_base64": "..."}

    Args:
        customer_id: Customer/entity identifier (e.g., 'CUST001'). Required for
                     structured data_types, ignored when data_type='document'.
        data_type: One of 'profile', 'transactions', 'credit_history',
                   'compliance', 'document'.
        key: S3 key to fetch when data_type='document'.

    Returns:
        JSON string containing the requested data.
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


@tool
def extract_pdf_text(s3_key: str, max_pages: int = 20) -> str:
    """
    Download a PDF from S3 and return its plain text content for analysis.

    Use this tool when an agent needs to read the contents of a PDF
    document (tax return, bank statement, invoice, report, etc.). It
    downloads the file, decodes base64, runs pypdf text extraction, and
    returns per-page text as a JSON envelope the agent can parse.

    DO NOT pass raw base64 PDF content to the agent's prompt and ask it
    to parse the bytes — that doesn't work. Always use this tool.

    Args:
        s3_key: The S3 key of the PDF (e.g.
                'applications/APP001/documents/tax_return/2023_1120S.pdf').
        max_pages: Cap on pages to extract (default 20) so very large PDFs
                   don't blow up the agent's context window. Pages beyond
                   this cap are skipped and reported.

    Returns:
        JSON string with:
          - s3_key: the key fetched
          - page_count: total pages in the PDF
          - pages_extracted: number actually returned
          - pages: list of {page: int, text: str} in page order
          - truncated: bool — True if page_count > max_pages
          - error: present only on failure; excludes the other keys
    """
    if not s3_key:
        return json.dumps({"error": "s3_key is required"})

    try:
        envelope = _get_retriever().get_object_by_key(s3_key)
    except Exception as e:
        logger.error("pdf_fetch_error", s3_key=s3_key, error=str(e))
        return json.dumps({"error": f"failed to fetch s3 object: {e}", "s3_key": s3_key})

    if "error" in envelope:
        return json.dumps({"error": envelope["error"], "s3_key": s3_key})

    content_b64 = envelope.get("content_base64", "")
    if not content_b64:
        return json.dumps({"error": "object had no base64 content", "s3_key": s3_key})

    try:
        pdf_bytes = base64.b64decode(content_b64)
    except Exception as e:
        logger.error("pdf_b64_decode_error", s3_key=s3_key, error=str(e))
        return json.dumps({"error": f"base64 decode failed: {e}", "s3_key": s3_key})

    try:
        # Lazy import so modules that never call this tool don't need pypdf.
        from pypdf import PdfReader
    except ImportError as e:
        logger.error("pypdf_missing", error=str(e))
        return json.dumps({
            "error": (
                "pypdf is not installed in this runtime. Add `pypdf>=4.0.0` "
                "to foundations/src/requirements/requirements.txt and rebuild "
                "the container."
            ),
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
        logger.error("pdf_parse_error", s3_key=s3_key, error=str(e))
        return json.dumps({"error": f"pdf parse failed: {e}", "s3_key": s3_key})
