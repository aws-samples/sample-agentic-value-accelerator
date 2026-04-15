# SPDX-License-Identifier: Apache-2.0
"""
S3 Retriever Tool for Strands Agents.

Strands-compatible version of the S3 retriever tool.
Uses the @tool decorator from strands.tools.decorator.
"""

import json
from strands.tools.decorator import tool
from tools.s3_retriever import S3Retriever, _get_retriever
import structlog

logger = structlog.get_logger()


@tool
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
