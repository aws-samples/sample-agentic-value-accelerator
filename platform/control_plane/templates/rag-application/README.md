# ${PROJECT_NAME} - RAG Application

A Retrieval Augmented Generation (RAG) system for building knowledge-based AI applications.

## Overview

This RAG application enables you to:
- **Ingest Documents**: Load and process your knowledge base
- **Create Embeddings**: Generate vector representations
- **Store in Vector DB**: Index for efficient retrieval
- **Query with Context**: Retrieve relevant documents
- **Generate Answers**: Use LLM with retrieved context

## Architecture

```
┌─────────────┐
│   Query     │
└──────┬──────┘
       │
   ┌───▼────┐
   │Embedder│
   └───┬────┘
       │
   ┌───▼──────────┐
   │Vector Search │
   │  (Top K)     │
   └───┬──────────┘
       │
   ┌───▼────────┐
   │  Context   │
   │ Retrieval  │
   └───┬────────┘
       │
   ┌───▼────────┐
   │    LLM     │
   │ Generation │
   └───┬────────┘
       │
   ┌───▼────┐
   │Response│
   └────────┘
```

## Quick Start

### Prerequisites

- Python 3.11+
- AWS CLI configured
- Vector store access (OpenSearch, Pinecone, or PostgreSQL with pgvector)
- Documents to index

### Installation

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Configure environment:
   ```bash
   cp .env.example .env
   # Edit .env with:
   # - Vector store credentials
   # - AWS credentials
   # - Model configuration
   ```

3. Ingest documents:
   ```bash
   python -m src.ingestion.ingest_docs --source ./data/documents/
   ```

4. Run application:
   ```bash
   python -m src.main
   ```

## Configuration

### Vector Store: ${VECTOR_STORE}

Configure your vector store in `.env`:

```bash
VECTOR_STORE=${VECTOR_STORE}
```

**OpenSearch:**
```bash
OPENSEARCH_ENDPOINT=your-opensearch-endpoint
OPENSEARCH_INDEX=your-index
```

**Pinecone:**
```bash
PINECONE_API_KEY=your-api-key
PINECONE_ENVIRONMENT=your-environment
PINECONE_INDEX=your-index
```

**PostgreSQL (pgvector):**
```bash
DATABASE_URL=postgresql://user:pass@host:5432/db
```

### Embedding Model

```bash
EMBEDDING_MODEL=${EMBEDDING_MODEL}
CHUNK_SIZE=${CHUNK_SIZE}
CHUNK_OVERLAP=200
```

## Usage

### Query the System

```python
from src.rag_pipeline import RAGPipeline

rag = RAGPipeline()

# Ask a question
result = rag.query("What is the return policy?")

print(result['answer'])
print(f"Sources: {result['sources']}")
```

### Ingest New Documents

```python
from src.ingestion.document_processor import DocumentProcessor

processor = DocumentProcessor()

# Ingest documents
processor.ingest_directory("./data/new_documents/")
```

## Customization

### 1. Document Processing

Edit `src/ingestion/document_processor.py`:

```python
# TODO: Customize document processing
# - Add custom document loaders
# - Implement preprocessing logic
# - Configure chunking strategy
# - Add metadata extraction
```

### 2. Retrieval Strategy

Edit `src/retrieval/retriever.py`:

```python
# TODO: Customize retrieval
# - Adjust similarity threshold
# - Implement hybrid search
# - Add reranking
# - Configure MMR (Maximal Marginal Relevance)
```

### 3. Generation

Edit `src/generation/generator.py`:

```python
# TODO: Customize generation
# - Adjust prompts
# - Configure temperature
# - Add citation formatting
# - Implement streaming
```

## Document Types Supported

- PDF documents
- Text files (.txt, .md)
- Word documents (.docx)
- HTML pages
- CSV files

TODO: Add support for your document types in `src/ingestion/loaders/`

## Monitoring

View RAG performance in Langfuse:
- Query latency
- Retrieval quality
- Generation metrics
- Token usage
- User feedback

## Best Practices

1. **Chunk Size**: Adjust based on document type (${CHUNK_SIZE} default)
2. **Top K**: Retrieve 3-5 documents for best balance
3. **Metadata**: Add metadata to improve filtering
4. **Reranking**: Consider adding reranker for better results
5. **Caching**: Cache embeddings for frequently accessed documents

## Troubleshooting

### No Relevant Documents Found
- Check embedding model compatibility
- Verify documents are indexed
- Adjust similarity threshold
- Review query phrasing

### Slow Queries
- Add caching
- Optimize vector store
- Reduce Top K value
- Use approximate nearest neighbor

### Poor Answer Quality
- Increase context window
- Improve chunk strategy
- Add reranking
- Fine-tune prompts

## Example Use Cases

This RAG template is ideal for:

1. **Customer Support**: Query product documentation
2. **Research**: Search academic papers
3. **Legal**: Find relevant case law
4. **Technical Docs**: Developer documentation assistant
5. **HR Systems**: Employee handbook Q&A

## Next Steps

1. ✅ Template generated with infrastructure
2. TODO: Add your documents to `data/documents/`
3. TODO: Run ingestion pipeline
4. TODO: Customize prompts in `src/generation/`
5. TODO: Test queries and refine
6. TODO: Deploy to AWS
7. TODO: Monitor with Langfuse

## Support

For issues and questions, see the AVA documentation.
