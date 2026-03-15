
import logging
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

# Logger setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger("response_models")

class ParsedDataset(BaseModel):
    file_name: str
    columns: List[str]
    rows: List[Dict[str, Any]]

    def __init__(self, **data):
        super().__init__(**data)
        logger.info("ParsedDataset initialized", extra={"file_name": self.file_name, "num_rows": len(self.rows)})

class UploadDatasetsResponse(BaseModel):
    datasets: List[ParsedDataset]

    def __init__(self, **data):
        super().__init__(**data)
        logger.info("UploadDatasetsResponse initialized", extra={"num_datasets": len(self.datasets)})

class MergedDataset(BaseModel):
    type: str
    file_name: str
    columns: List[str]
    data: List[Dict[str, Any]]

    def __init__(self, **data):
        super().__init__(**data)
        logger.info("MergedDataset initialized", extra={"file_name": self.file_name, "type": self.type})

class AssignTasksRequest(BaseModel):
    datasets: List[ParsedDataset] = Field(default_factory=list)

    def __init__(self, **data):
        super().__init__(**data)
        logger.info("AssignTasksRequest initialized", extra={"num_datasets": len(self.datasets)})

class AnalyzeProjectsRequest(BaseModel):
    extracted_data: Dict[str, Any] = Field(default_factory=dict)

    def __init__(self, **data):
        super().__init__(**data)
        logger.info("AnalyzeProjectsRequest initialized", extra={"extracted_keys": list(self.extracted_data.keys())})

class TaskAssignment(BaseModel):
    task_name: str
    assigned_to: str
    employee_id: Optional[str] = None
    reason: str
    reason_points: List[str] = Field(default_factory=list)

    def __init__(self, **data):
        super().__init__(**data)
        logger.info("TaskAssignment initialized", extra={"task_name": self.task_name, "assigned_to": self.assigned_to})

class ProjectAssignments(BaseModel):
    project_name: str
    tasks: List[TaskAssignment] = Field(default_factory=list)

    def __init__(self, **data):
        super().__init__(**data)
        logger.info("ProjectAssignments initialized", extra={"project_name": self.project_name, "num_tasks": len(self.tasks)})

class AssignTasksResponse(BaseModel):
    projects: List[ProjectAssignments] = Field(default_factory=list)

    def __init__(self, **data):
        super().__init__(**data)
        logger.info("AssignTasksResponse initialized", extra={"num_projects": len(self.projects)})

class AssignedEmployee(BaseModel):
    employee_name: str = ""
    employee_id: str = ""
    role: str = ""
    age: Optional[int] = None
    experience_years: Optional[float] = None
    reason: str = ""

    def __init__(self, **data):
        super().__init__(**data)
        logger.info("AssignedEmployee initialized", extra={"employee_name": self.employee_name, "role": self.role})

class AnalyzedTask(BaseModel):
    task_name: str = ""
    assigned_employee: AssignedEmployee = Field(default_factory=AssignedEmployee)

    def __init__(self, **data):
        super().__init__(**data)
        logger.info("AnalyzedTask initialized", extra={"task_name": self.task_name})

class RoadmapTask(BaseModel):
    task_name: str = ""
    completed: bool = False

    def __init__(self, **data):
        super().__init__(**data)
        logger.info("RoadmapTask initialized", extra={"task_name": self.task_name, "completed": self.completed})

class RoadmapMilestone(BaseModel):
    week: int
    milestone: str = ""
    tasks: List[RoadmapTask | str] = Field(default_factory=list)

    def __init__(self, **data):
        super().__init__(**data)
        logger.info("RoadmapMilestone initialized", extra={"week": self.week, "milestone": self.milestone})

class AnalyzedProject(BaseModel):
    project_name: str = ""
    summary: str = ""
    requirements: List[str] = Field(default_factory=list)
    specification: List[str] = Field(default_factory=list)
    tools_required: List[str] = Field(default_factory=list)
    priority: str = "medium"
    deadline_weeks: int = 1
    tasks: List[AnalyzedTask] = Field(default_factory=list)
    roadmap: List[RoadmapMilestone] = Field(default_factory=list)

    def __init__(self, **data):
        super().__init__(**data)
        logger.info("AnalyzedProject initialized", extra={"project_name": self.project_name, "priority": self.priority})

class AnalyzeProjectsResponse(BaseModel):
    projects: List[AnalyzedProject] = Field(default_factory=list)

    def __init__(self, **data):
        super().__init__(**data)
        logger.info("AnalyzeProjectsResponse initialized", extra={"num_projects": len(self.projects)})

class CodePlanFile(BaseModel):
    path: str
    description: str = ""

    def __init__(self, **data):
        super().__init__(**data)
        logger.info("CodePlanFile initialized", extra={"path": self.path})

class GenerateCodeRequest(BaseModel):
    project_id: str
    project: Dict[str, Any] = Field(default_factory=dict)

    def __init__(self, **data):
        super().__init__(**data)
        logger.info("GenerateCodeRequest initialized", extra={"project_id": self.project_id})


class DocumentationSaveRequest(BaseModel):
    title: str = "documentation"
    content: str = ""


class DocumentationSaveResponse(BaseModel):
    saved: bool
    path: str
    bytes_written: int


class RealEstateTask(BaseModel):
    task: str
    department: str


class LegalDocument(BaseModel):
    title: str
    purpose: str
    content: str


class MarketInsight(BaseModel):
    target_column: str
    predicted_price: float
    r2_score: float
    mae: float
    rmse: float
    test_samples: int
    model_used: str
    top_feature_coefficients: Dict[str, float] = Field(default_factory=dict)
    summary: str = ""


class RealEstateAnalysisResponse(BaseModel):
    project_name: str
    tasks: List[RealEstateTask] = Field(default_factory=list)
    legal_documents: List[LegalDocument] = Field(default_factory=list)
    market_insights: Optional[MarketInsight] = None


class RealEstateRecommendationRequest(BaseModel):
    preferred_locations: List[str] = Field(default_factory=list)
    bhk_values: List[int] = Field(default_factory=list)
    budget_min: Optional[float] = None
    budget_max: Optional[float] = None
    require_rera: bool = False
    require_apartment: bool = True
    require_ready_to_move: bool = False
    min_listing_domain_score: Optional[float] = None
    extracted_data: Dict[str, Any] = Field(default_factory=dict)


class RecommendedPlace(BaseModel):
    project_name: str
    location: str
    latitude: float
    longitude: float
    bhk: str = ""
    price_inr: Optional[float] = None
    amenities: List[str] = Field(default_factory=list)
    rera_approved: Optional[bool] = None
    possession_months: Optional[int] = None
    score: float = 0.0
    reason: str = ""


class RealEstateRecommendationResponse(BaseModel):
    parsed_requirements: Dict[str, Any] = Field(default_factory=dict)
    recommendations: List[RecommendedPlace] = Field(default_factory=list)
