
import asyncio
import json
import logging
from typing import List, Optional

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import StreamingResponse

from models.response_models import (
    AnalyzeProjectsRequest,
    AnalyzeProjectsResponse,
    AssignTasksRequest,
    AssignTasksResponse,
    GenerateCodeRequest,
    DocumentationSaveRequest,
    DocumentationSaveResponse,
    RealEstateRecommendationRequest,
    RealEstateRecommendationResponse,
    RealEstateAnalysisResponse,
    UploadDatasetsResponse,
)
from services.agent_assignment import (
    analyze_projects_from_extracted_json,
    recommend_real_estate_from_inquiry,
    analyze_real_estate_from_extracted_json,
    assign_tasks_from_datasets,
)
from services.code_generation_service import CodeGenerationService
from services.documentation_engine import DocumentationEngine
from services.excel_parser import parse_upload_file

router = APIRouter(prefix="/agent", tags=["agent"])

# Logger setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger("agent_routes")



@router.post("/upload-datasets", response_model=UploadDatasetsResponse)
async def upload_datasets(files: List[UploadFile] = File(...)) -> UploadDatasetsResponse:
    logger.info("upload_datasets called", extra={"uploaded_files": [file.filename for file in files]})
    parsed_datasets = await asyncio.gather(*(parse_upload_file(file) for file in files))

    return UploadDatasetsResponse(datasets=parsed_datasets)



@router.post("/assign-tasks", response_model=AssignTasksResponse)
def assign_tasks(payload: AssignTasksRequest) -> AssignTasksResponse:
    logger.info("assign_tasks called", extra={"num_datasets": len(payload.datasets)})
    return assign_tasks_from_datasets(payload.datasets)



@router.post("/analyze-projects", response_model=AnalyzeProjectsResponse)
def analyze_projects(payload: AnalyzeProjectsRequest) -> AnalyzeProjectsResponse:
    logger.info("analyze_projects called", extra={"extracted_keys": list(payload.extracted_data.keys())})
    return analyze_projects_from_extracted_json(payload.extracted_data)


@router.post("/real-estate/analyze", response_model=RealEstateAnalysisResponse)
def analyze_real_estate(payload: AnalyzeProjectsRequest) -> RealEstateAnalysisResponse:
    logger.info("analyze_real_estate called", extra={"extracted_keys": list(payload.extracted_data.keys())})
    return analyze_real_estate_from_extracted_json(payload.extracted_data)


@router.post("/real-estate/recommend", response_model=RealEstateRecommendationResponse)
def recommend_real_estate(payload: RealEstateRecommendationRequest) -> RealEstateRecommendationResponse:
    logger.info(
        "recommend_real_estate called",
        extra={
            "num_locations": len(payload.preferred_locations),
            "num_bhk": len(payload.bhk_values),
            "budget_min": payload.budget_min,
            "budget_max": payload.budget_max,
        },
    )
    return recommend_real_estate_from_inquiry(
        extracted_data=payload.extracted_data,
        preferred_locations=payload.preferred_locations,
        bhk_values=payload.bhk_values,
        budget_min=payload.budget_min,
        budget_max=payload.budget_max,
        require_rera=payload.require_rera,
        require_apartment=payload.require_apartment,
        require_ready_to_move=payload.require_ready_to_move,
        min_listing_domain_score=payload.min_listing_domain_score,
    )



@router.post("/generate-code/stream")
def generate_code_stream(payload: GenerateCodeRequest) -> StreamingResponse:
    logger.info("generate_code_stream called", extra={"project_id": payload.project_id})
    codegen_service = CodeGenerationService()
    stream = codegen_service.stream_project_code(project_id=payload.project_id, project=payload.project)
    return StreamingResponse(stream, media_type="text/event-stream")


@router.post("/documentation/stream")
async def generate_documentation_stream(
    prompt: str = Form(...),
    files: Optional[List[UploadFile]] = File(default=None),
) -> StreamingResponse:
    logger.info(
        "generate_documentation_stream called",
        extra={"prompt_len": len(prompt), "num_files": len(files or [])},
    )
    doc_engine = DocumentationEngine()

    async def event_stream():
        yield f'data: {{"type":"status","message":"Preparing documentation context..."}}\n\n'
        async for chunk in doc_engine.stream_documentation_from_inputs(user_prompt=prompt, files=files or []):
            escaped = json.dumps({"type": "token", "chunk": chunk}, ensure_ascii=False)
            yield f"data: {escaped}\n\n"
        yield 'data: {"type":"done"}\n\n'

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/documentation/save", response_model=DocumentationSaveResponse)
def save_documentation(payload: DocumentationSaveRequest) -> DocumentationSaveResponse:
    logger.info("save_documentation called", extra={"title": payload.title, "content_len": len(payload.content)})
    doc_engine = DocumentationEngine()
    path, bytes_written = doc_engine.save_document(payload.title, payload.content)
    return DocumentationSaveResponse(saved=True, path=path, bytes_written=bytes_written)
