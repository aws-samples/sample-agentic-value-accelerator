"""Document Processing Orchestrator (Strands Implementation)."""
import json, uuid
from datetime import datetime
from typing import Dict, Any
from base.strands import StrandsOrchestrator
from .agents import DocumentClassifier, DataExtractor, ValidationAgent
from .agents.document_classifier import classify_document
from .agents.data_extractor import extract_data
from .agents.validation_agent import validate_document
from utils.json_extract import extract_json
from utils.synthesis import build_structured_synthesis_prompt
from .models import (ProcessingRequest, ProcessingResponse, ProcessingType,
    DocumentClassification, DocumentType, ExtractedData, ValidationResult, ValidationStatus)

class DocumentProcessingOrchestrator(StrandsOrchestrator):
    name = "document_processing_orchestrator"
    system_prompt = """You are a Senior Document Processing Coordinator for financial services compliance.

Your role is to:
1. Coordinate specialist agents (Document Classifier, Data Extractor, Validation Agent)
2. Synthesize their findings into a comprehensive processing result
3. Ensure documents are properly classified, data extracted, and validated

When creating the final summary, consider:
- Document classification accuracy and confidence
- Data extraction completeness
- Validation status and any compliance issues
- Clear next steps for document handling

Be concise but thorough. Your summary will be used by compliance officers."""

    def __init__(self):
        super().__init__(agents={
            "document_classifier": DocumentClassifier(),
            "data_extractor": DataExtractor(),
            "validation_agent": ValidationAgent(),
        })

    def run_assessment(self, document_id: str, processing_type: str = "full", context: str | None = None) -> Dict[str, Any]:
        classification = extraction = validation = None
        input_text = self._build_input_text(document_id, context)
        if processing_type == "full":
            results = self.run_parallel(["document_classifier", "data_extractor", "validation_agent"], input_text)
            classification = {"agent": "document_classifier", "document_id": document_id, "classification": results["document_classifier"].output}
            extraction = {"agent": "data_extractor", "document_id": document_id, "extraction": results["data_extractor"].output}
            validation = {"agent": "validation_agent", "document_id": document_id, "validation": results["validation_agent"].output}
        elif processing_type == "classification_only":
            r = self.run_agent("document_classifier", input_text)
            classification = {"agent": "document_classifier", "document_id": document_id, "classification": r.output}
        elif processing_type == "extraction_only":
            r = self.run_agent("data_extractor", input_text)
            extraction = {"agent": "data_extractor", "document_id": document_id, "extraction": r.output}
        elif processing_type == "validation_only":
            r = self.run_agent("validation_agent", input_text)
            validation = {"agent": "validation_agent", "document_id": document_id, "validation": r.output}
        summary = self.synthesize({}, self._build_synthesis_prompt(classification, extraction, validation))
        return {"document_id": document_id, "classification": classification, "extraction": extraction, "validation": validation, "final_summary": summary}

    async def arun_assessment(self, document_id: str, processing_type: str = "full", context: str | None = None) -> Dict[str, Any]:
        import asyncio
        classification = extraction = validation = None
        if processing_type == "full":
            classification, extraction, validation = await asyncio.gather(
                classify_document(document_id, context), extract_data(document_id, context), validate_document(document_id, context))
        elif processing_type == "classification_only":
            classification = await classify_document(document_id, context)
        elif processing_type == "extraction_only":
            extraction = await extract_data(document_id, context)
        elif processing_type == "validation_only":
            validation = await validate_document(document_id, context)
        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(None, lambda: self.synthesize({}, self._build_synthesis_prompt(classification, extraction, validation)))
        return {"document_id": document_id, "classification": classification, "extraction": extraction, "validation": validation, "final_summary": summary}

    def _build_input_text(self, document_id: str, context: str | None = None) -> str:
        base = f"""Process document: {document_id}\n\nSteps:\n1. Retrieve document profile using s3_retriever_tool with data_type='profile'\n2. Analyze document content\n3. Provide complete assessment"""
        return base + (f"\n\nAdditional Context: {context}" if context else "")

    def _build_synthesis_prompt(self, *args, **kwargs) -> str:
        """Build structured synthesis prompt that returns JSON."""
        agent_results = {}
        for a in args:
            if isinstance(a, dict):
                for k, v in a.items():
                    if v is not None: agent_results[k] = v
        for k, v in kwargs.items():
            if v is not None: agent_results[k] = v
        return build_structured_synthesis_prompt(
            agent_results=agent_results,
            response_schema={"summary": "Executive summary", "fields": "All structured fields"},
            domain_context=self.system_prompt)



async def run_document_processing(request):
    """Run the assessment workflow."""
    orchestrator = DocumentProcessingOrchestrator()
    final_state = await orchestrator.arun_assessment(
        document_id=request.document_id,
        processing_type=request.processing_type.value if hasattr(request.processing_type, 'value') else str(request.processing_type),
        context=getattr(request, 'additional_context', None))

    classification = None; validation = None
    summary = "Assessment completed"
    try:
        structured = extract_json(final_state.get('final_summary', '{}'))
        summary = structured.get("summary", summary)

        if structured.get("document_type"):
            classification = DocumentClassification(document_type=structured.get("document_type", "general"),
                confidence=float(structured.get("classification_confidence", "0.8")),
                extracted_fields=structured.get("extracted_fields", []))
        if structured.get("validation_status"):
            validation = ValidationResult(status=ValidationStatus(structured.get("validation_status", "pending")),
                issues=structured.get("validation_issues", []), notes=[])
    except Exception:
        summary = str(final_state.get("final_summary", summary))

    return ProcessingResponse(
        document_id=request.document_id, processing_id=str(uuid.uuid4()), timestamp=datetime.utcnow(), classification=classification, validation=validation,
        summary=summary,
        raw_analysis={"classification": final_state.get("classification"), "extraction": final_state.get("extraction"), "validation": final_state.get("validation")},
    )
