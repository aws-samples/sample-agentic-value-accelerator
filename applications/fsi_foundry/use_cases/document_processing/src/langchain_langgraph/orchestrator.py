"""Document Processing Orchestrator."""
import json, uuid
from typing import TypedDict, Annotated, Literal
from datetime import datetime
from langchain_core.messages import HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from base.langgraph import LangGraphOrchestrator
from use_cases.document_processing.agents import DocumentClassifier, DataExtractor, ValidationAgent
from use_cases.document_processing.agents.document_classifier import classify_document
from use_cases.document_processing.agents.data_extractor import extract_data
from use_cases.document_processing.agents.validation_agent import validate_document
from use_cases.document_processing.models import (ProcessingRequest, ProcessingResponse, ProcessingType,
    DocumentClassification, DocumentType, ExtractedData, ValidationResult, ValidationStatus)

from pydantic import BaseModel, Field

class DocumentProcessingSynthesisSchema(BaseModel):
    """Structured synthesis for document processing."""
    document_type: str = Field(default="general", description="Classified document type")
    classification_confidence: str = Field(default="0.8", description="Classification confidence as decimal string")
    extracted_fields: list[str] = Field(default_factory=list, description="List of extracted data fields")
    validation_status: str = Field(default="pending", description="Validation status: valid, invalid, or pending")
    validation_issues: list[str] = Field(default_factory=list, description="List of validation issues found")
    summary: str = Field(..., description="Executive summary of document processing")


class DocumentProcessingState(TypedDict):
    messages: Annotated[list, add_messages]
    document_id: str
    processing_type: str
    document_classifier_result: dict | None
    data_extractor_result: dict | None
    validation_agent_result: dict | None
    final_summary: str | None

class DocumentProcessingOrchestrator(LangGraphOrchestrator):
    name = "document_processing_orchestrator"
    state_schema = DocumentProcessingState
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

    def build_graph(self) -> StateGraph:
        workflow = StateGraph(DocumentProcessingState)
        workflow.add_node("parallel_assessment", self._parallel_node)
        workflow.add_node("document_classifier", self._classifier_node)
        workflow.add_node("data_extractor", self._extractor_node)
        workflow.add_node("validation_agent", self._validation_node)
        workflow.add_node("synthesize", self._synthesize_node)
        workflow.set_conditional_entry_point(self._router, {
            "parallel_assessment": "parallel_assessment", "document_classifier": "document_classifier",
            "data_extractor": "data_extractor", "validation_agent": "validation_agent"})
        workflow.add_edge("parallel_assessment", "synthesize")
        for n in ["document_classifier", "data_extractor", "validation_agent"]:
            workflow.add_conditional_edges(n, self._router, {"synthesize": "synthesize"})
        workflow.add_edge("synthesize", END)
        return workflow.compile()

    def _router(self, state) -> Literal["parallel_assessment", "document_classifier", "data_extractor", "validation_agent", "synthesize"]:
        pt = state.get("processing_type", "full")
        cd = state.get("document_classifier_result") is not None
        ed = state.get("data_extractor_result") is not None
        vd = state.get("validation_agent_result") is not None
        if pt == "classification_only": return "synthesize" if cd else "document_classifier"
        if pt == "extraction_only": return "synthesize" if ed else "data_extractor"
        if pt == "validation_only": return "synthesize" if vd else "validation_agent"
        if not cd and not ed and not vd: return "parallel_assessment"
        return "synthesize"

    async def _parallel_node(self, state):
        import asyncio
        did, ctx = state["document_id"], self._extract_context(state)
        cr, er, vr = await asyncio.gather(classify_document(did, ctx), extract_data(did, ctx), validate_document(did, ctx))
        return {**state, "document_classifier_result": cr, "data_extractor_result": er, "validation_agent_result": vr,
            "messages": state["messages"] + [AIMessage(content=f"Classification: {json.dumps(cr, indent=2)}"),
                AIMessage(content=f"Extraction: {json.dumps(er, indent=2)}"), AIMessage(content=f"Validation: {json.dumps(vr, indent=2)}")]}

    async def _classifier_node(self, state):
        r = await classify_document(state["document_id"], self._extract_context(state))
        return {**state, "document_classifier_result": r, "messages": state["messages"] + [AIMessage(content=f"Classification: {json.dumps(r, indent=2)}")]}

    async def _extractor_node(self, state):
        r = await extract_data(state["document_id"], self._extract_context(state))
        return {**state, "data_extractor_result": r, "messages": state["messages"] + [AIMessage(content=f"Extraction: {json.dumps(r, indent=2)}")]}

    async def _validation_node(self, state):
        r = await validate_document(state["document_id"], self._extract_context(state))
        return {**state, "validation_agent_result": r, "messages": state["messages"] + [AIMessage(content=f"Validation: {json.dumps(r, indent=2)}")]}

    async def _synthesize_node(self, state):
        """Synthesize findings using with_structured_output."""
        sections = []
        for key, val in state.items():
            if val is not None and key not in ("messages", "document_id", "processing_type", "final_summary"):
                if isinstance(val, (dict, list)):
                    sections.append(f"## {key}\n{json.dumps(val, indent=2)}")
        prompt = f"""Based on the following assessments, produce a structured response. Use actual findings — not defaults.

{chr(10).join(sections)}"""
        try:
            llm = self._create_llm()
            structured_llm = llm.with_structured_output(DocumentProcessingSynthesisSchema)
            result = await structured_llm.ainvoke(prompt)
            structured = result.model_dump() if hasattr(result, "model_dump") else result
        except Exception as e:
            import structlog; structlog.get_logger().warning("structured_synthesis_fallback", error=str(e))
            summary = await self.synthesize({}, prompt)
            structured = {"summary": summary}
        return {**state, "final_summary": json.dumps(structured),
                "messages": state["messages"] + [AIMessage(content=f"Final: {json.dumps(structured)}")],}

    def _extract_context(self, state):
        if state.get("messages"):
            last = state["messages"][-1]
            if hasattr(last, "content"): return last.content
        return None


async def run_document_processing(request):
    """Run the assessment workflow."""
    orchestrator = DocumentProcessingOrchestrator()
    initial_state = {
        "messages": [HumanMessage(content=f"Begin assessment for: {request.document_id}")],
        "document_id": request.document_id,
        "processing_type": request.processing_type.value if hasattr(request.processing_type, 'value') else str(request.processing_type),
    }
    for key in [k for k in DocumentProcessingState.__annotations__ if k not in initial_state]:
        initial_state[key] = None
    if hasattr(request, 'additional_context') and request.additional_context:
        initial_state["messages"].append(HumanMessage(content=f"Context: {request.additional_context}"))
    final_state = await orchestrator.arun(initial_state)

    classification = None; validation = None
    summary = "Assessment completed"
    try:
        structured = json.loads(final_state.get('final_summary', '{}'))
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
        raw_analysis={"classification": final_state.get("document_classifier_result"), "extraction": final_state.get("data_extractor_result"), "validation": final_state.get("validation_agent_result")},
    )
