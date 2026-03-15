
import logging
from typing import Any, Dict

from models.response_models import AnalyzeProjectsResponse, AssignTasksResponse, ParsedDataset
from services.dataset_merger import merge_datasets
from services.gemini_analysis_service import GeminiAnalysisService
from services.gemini_service import GeminiService
from services.real_estate_agent_service import RealEstateAgentService

# Logger setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger("agent_assignment")

def assign_tasks_from_datasets(datasets: list[ParsedDataset]) -> AssignTasksResponse:
    logger.info("assign_tasks_from_datasets called", extra={"num_datasets": len(datasets)})
    merged_context = merge_datasets(datasets)
    gemini_service = GeminiService()
    return gemini_service.generate_assignments(merged_context)

def analyze_projects_from_extracted_json(extracted_data: Dict[str, Any]) -> AnalyzeProjectsResponse:
    logger.info("analyze_projects_from_extracted_json called", extra={"extracted_keys": list(extracted_data.keys())})
    analysis_service = GeminiAnalysisService()
    return analysis_service.analyze_projects(extracted_data)


def analyze_real_estate_from_extracted_json(extracted_data: Dict[str, Any]):
    logger.info("analyze_real_estate_from_extracted_json called", extra={"extracted_keys": list(extracted_data.keys())})
    service = RealEstateAgentService()
    return service.analyze(extracted_data)


def recommend_real_estate_from_inquiry(
    *,
    extracted_data: Dict[str, Any],
    preferred_locations: list[str],
    bhk_values: list[int],
    budget_min: float | None,
    budget_max: float | None,
    require_rera: bool,
    require_apartment: bool,
    require_ready_to_move: bool,
    min_listing_domain_score: float | None,
):
    logger.info(
        "recommend_real_estate_from_inquiry called",
        extra={
            "extracted_keys": list(extracted_data.keys()),
            "num_locations": len(preferred_locations),
            "num_bhk": len(bhk_values),
            "budget_min": budget_min,
            "budget_max": budget_max,
        },
    )
    service = RealEstateAgentService()
    return service.recommend_places(
        extracted_data=extracted_data,
        preferred_locations=preferred_locations,
        bhk_values=bhk_values,
        budget_min=budget_min,
        budget_max=budget_max,
        require_rera=require_rera,
        require_apartment=require_apartment,
        require_ready_to_move=require_ready_to_move,
        min_listing_domain_score=min_listing_domain_score,
    )
