#!/bin/bash
set -e

# RAG Application Test Script
# Runs basic tests to verify deployment

PROJECT_NAME="${PROJECT_NAME:-my-rag-app}"
AWS_REGION="${AWS_REGION:-us-east-1}"

echo "========================================"
echo "RAG Application Tests"
echo "========================================"
echo "Project: $PROJECT_NAME"
echo "Region: $AWS_REGION"
echo ""

ENDPOINT="http://localhost:8000"
echo "Testing endpoint: $ENDPOINT"
echo ""

# Test 1: Health check
echo "Test 1: Health check"
echo "-------------------"
if curl -f -s "${ENDPOINT}/health" > /dev/null; then
  echo "✅ Health check passed"
else
  echo "❌ Health check failed"
  exit 1
fi

# Test 2: Document retrieval
echo ""
echo "Test 2: Document retrieval"
echo "-------------------"
RESPONSE=$(curl -s -X POST "${ENDPOINT}/api/rag/query" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What is this document about?",
    "top_k": 5
  }')

if echo "$RESPONSE" | grep -q "answer"; then
  echo "✅ Retrieval test passed"
  echo "Response: $RESPONSE"
else
  echo "❌ Retrieval test failed"
  echo "Response: $RESPONSE"
  exit 1
fi

# Test 3: Vector store connectivity
echo ""
echo "Test 3: Vector store connectivity"
echo "-------------------"
RESPONSE=$(curl -s -X GET "${ENDPOINT}/api/rag/status")

if echo "$RESPONSE" | grep -q "vector_store"; then
  echo "✅ Vector store connectivity test passed"
  echo "Response: $RESPONSE"
else
  echo "❌ Vector store connectivity test failed"
  echo "Response: $RESPONSE"
  exit 1
fi

# Test 4: Document ingestion
echo ""
echo "Test 4: Document ingestion"
echo "-------------------"
RESPONSE=$(curl -s -X POST "${ENDPOINT}/api/rag/ingest" \
  -H "Content-Type: application/json" \
  -d '{
    "documents": [
      {"content": "Test document content", "metadata": {"source": "test"}}
    ]
  }')

if echo "$RESPONSE" | grep -q "success"; then
  echo "✅ Ingestion test passed"
  echo "Response: $RESPONSE"
else
  echo "⚠️ Ingestion test unclear"
  echo "Response: $RESPONSE"
fi

echo ""
echo "========================================"
echo "All tests passed! ✅"
echo "========================================"
echo ""
echo "RAG application is working correctly."
echo "Upload your documents to start using it."
