import {
  DocumentationStreamEvent,
  GenerateCodeEvent,
  GenerateCodeRequest,
  AnalyzeProjectsRequest,
  AnalyzeProjectsResponse,
  AssignTasksRequest,
  AssignTasksResponse,
  RealEstateRecommendationResponse,
  RealEstateAnalysisResponse,
  SaveDocumentationRequest,
  SaveDocumentationResponse,
  UploadDatasetsResponse,
} from '../types/types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(errorBody || 'Request failed');
  }
  return (await response.json()) as T;
}

export async function uploadDatasets(files: File[]): Promise<UploadDatasetsResponse> {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));

  const response = await fetch(`${BASE_URL}/agent/upload-datasets`, {
    method: 'POST',
    body: formData,
  });

  return handleResponse<UploadDatasetsResponse>(response);
}

export async function generateAssignments(
  payload: AssignTasksRequest,
): Promise<AssignTasksResponse> {
  const response = await fetch(`${BASE_URL}/agent/assign-tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return handleResponse<AssignTasksResponse>(response);
}

export async function analyzeProjects(
  payload: AnalyzeProjectsRequest,
): Promise<AnalyzeProjectsResponse> {
  const response = await fetch(`${BASE_URL}/agent/analyze-projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return handleResponse<AnalyzeProjectsResponse>(response);
}

export async function analyzeRealEstate(
  payload: AnalyzeProjectsRequest,
): Promise<RealEstateAnalysisResponse> {
  const response = await fetch(`${BASE_URL}/agent/real-estate/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return handleResponse<RealEstateAnalysisResponse>(response);
}

export async function recommendRealEstate(
  payload: {
    preferred_locations: string[];
    bhk_values: number[];
    budget_min?: number;
    budget_max?: number;
    require_rera: boolean;
    require_apartment: boolean;
    require_ready_to_move: boolean;
    min_listing_domain_score?: number;
    extracted_data: Record<string, unknown>;
  },
): Promise<RealEstateRecommendationResponse> {
  const response = await fetch(`${BASE_URL}/agent/real-estate/recommend`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return handleResponse<RealEstateRecommendationResponse>(response);
}

export async function streamGenerateCode(
  payload: GenerateCodeRequest,
  onEvent: (event: GenerateCodeEvent) => void,
): Promise<void> {
  const response = await fetch(`${BASE_URL}/agent/generate-code/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(errorBody || 'Streaming request failed');
  }

  if (!response.body) {
    throw new Error('No response body available for streaming');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';

    for (const eventBlock of events) {
      const dataLine = eventBlock
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.startsWith('data:'));

      if (!dataLine) {
        continue;
      }

      const raw = dataLine.slice(5).trim();
      if (!raw) {
        continue;
      }

      try {
        onEvent(JSON.parse(raw) as GenerateCodeEvent);
      } catch {
        // Ignore malformed events and keep stream alive.
      }
    }
  }
}

export async function streamGenerateDocumentation(
  payload: {
    prompt: string;
    files: File[];
  },
  onEvent: (event: DocumentationStreamEvent) => void,
): Promise<void> {
  const processEventBlock = (eventBlock: string) => {
    const dataLine = eventBlock
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith('data:'));

    if (!dataLine) {
      return;
    }

    const raw = dataLine.slice(5).trim();
    if (!raw) {
      return;
    }

    try {
      onEvent(JSON.parse(raw) as DocumentationStreamEvent);
    } catch {
      // Ignore malformed events and keep stream alive.
    }
  };

  const formData = new FormData();
  formData.append('prompt', payload.prompt);
  payload.files.forEach((file) => formData.append('files', file));

  const response = await fetch(`${BASE_URL}/agent/documentation/stream`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(errorBody || 'Documentation streaming request failed');
  }

  if (!response.body) {
    throw new Error('No response body available for documentation streaming');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';

    for (const eventBlock of events) {
      processEventBlock(eventBlock);
    }
  }

  if (buffer.trim()) {
    processEventBlock(buffer);
  }
}

export async function saveGeneratedDocumentation(
  payload: SaveDocumentationRequest,
): Promise<SaveDocumentationResponse> {
  const response = await fetch(`${BASE_URL}/agent/documentation/save`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return handleResponse<SaveDocumentationResponse>(response);
}
