export type ParsedDataset = {
  file_name: string;
  columns: string[];
  rows: Array<Record<string, unknown>>;
};

export type UploadDatasetsResponse = {
  datasets: ParsedDataset[];
};

export type AssignTasksRequest = {
  datasets: ParsedDataset[];
};

export type TaskAssignment = {
  task_name: string;
  assigned_to: string;
  employee_id?: string | null;
  reason: string;
  reason_points?: string[];
};

export type ProjectAssignments = {
  project_name: string;
  tasks: TaskAssignment[];
};

export type AssignTasksResponse = {
  projects: ProjectAssignments[];
};

export type AnalyzeProjectsRequest = {
  extracted_data: Record<string, unknown>;
};

export type AssignedEmployee = {
  employee_name: string;
  employee_id: string;
  role: string;
  age?: number | null;
  experience_years?: number | null;
  reason: string;
};

export type AnalyzedTask = {
  task_name: string;
  assigned_employee: AssignedEmployee;
};

export type RoadmapTask = {
  task_name: string;
  completed: boolean;
};

export type RoadmapMilestone = {
  week: number;
  milestone: string;
  tasks: RoadmapTask[];
};

export type AnalyzedProject = {
  project_name: string;
  summary: string;
  requirements: string[];
  specification: string[];
  tools_required: string[];
  priority: 'high' | 'medium' | 'low' | string;
  deadline_weeks: number;
  tasks: AnalyzedTask[];
  roadmap: RoadmapMilestone[];
};

export type AnalyzeProjectsResponse = {
  projects: AnalyzedProject[];
};

export type RealEstateTask = {
  task: string;
  department: string;
};

export type LegalDocument = {
  title: string;
  purpose: string;
  content: string;
};

export type MarketInsight = {
  target_column: string;
  predicted_price: number;
  r2_score: number;
  mae: number;
  rmse: number;
  test_samples: number;
  model_used: string;
  top_feature_coefficients: Record<string, number>;
  summary: string;
};

export type RealEstateAnalysisResponse = {
  project_name: string;
  tasks: RealEstateTask[];
  legal_documents: LegalDocument[];
  market_insights: MarketInsight | null;
};

export type RecommendedPlace = {
  project_name: string;
  location: string;
  latitude: number;
  longitude: number;
  bhk: string;
  price_inr: number | null;
  amenities: string[];
  rera_approved: boolean | null;
  possession_months: number | null;
  score: number;
  reason: string;
};

export type RealEstateRecommendationResponse = {
  parsed_requirements: Record<string, unknown>;
  recommendations: RecommendedPlace[];
};

export type RealEstateHardInputFilters = {
  preferred_locations: string[];
  bhk_values: number[];
  budget_min?: number;
  budget_max?: number;
  require_rera: boolean;
  require_apartment: boolean;
  require_ready_to_move: boolean;
  min_listing_domain_score?: number;
};

export type FilePlanItem = {
  path: string;
  description: string;
};

export type GenerateCodeRequest = {
  project_id: string;
  project: AnalyzedProject;
};

export type GenerateCodeEvent =
  | {
      type: 'status';
      message: string;
    }
  | {
      type: 'file_plan';
      files: FilePlanItem[];
    }
  | {
      type: 'token';
      file_path: string;
      chunk: string;
    }
  | {
      type: 'file_complete';
      file_path: string;
    }
  | {
      type: 'done';
      files: Record<string, string>;
    }
  | {
      type: 'error';
      message: string;
    };

export type UpdatedDataChange = {
  file_name: string;
  dataset_type: string;
  rows_added: number;
  columns_detected: number;
  summary: string;
};

export type UpdatedDataSection = {
  new_datasets: ParsedDataset[];
  changes: UpdatedDataChange[];
};

export type AnalysisSnapshot = {
  version: string;
  exported_at: string;
  base_data: {
    datasets: ParsedDataset[];
  };
  updated_data: UpdatedDataSection;
  analysis: AnalyzeProjectsResponse | null;
};

export type DocumentationStreamEvent =
  | {
      type: 'status';
      message: string;
    }
  | {
      type: 'token';
      chunk: string;
    }
  | {
      type: 'done';
    };

export type SaveDocumentationRequest = {
  title: string;
  content: string;
};

export type SaveDocumentationResponse = {
  saved: boolean;
  path: string;
  bytes_written: number;
};
