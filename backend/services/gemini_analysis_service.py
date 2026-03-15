
import logging
import json
import os
from typing import Any, Dict, Tuple

from fastapi import HTTPException, status

from models.response_models import AnalyzeProjectsResponse, RoadmapTask
from utils.json_formatter import clean_for_json, parse_json_from_text

# Logger setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger("gemini_analysis_service")

class GeminiAnalysisService:
    def __init__(self) -> None:
        logger.info("GeminiAnalysisService initialized")
        self.api_key = os.getenv("GEMINI_API_KEY")
        self.model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
        self.max_input_chars = int(os.getenv("GEMINI_ANALYSIS_MAX_INPUT_CHARS", "350000"))

    @staticmethod
    def _to_compact_json(payload: Dict[str, Any]) -> str:
        # Only use custom keys in 'extra', avoid reserved LogRecord keys like 'filename', 'lineno', etc.
        logger.info("_to_compact_json called", extra={"payload_type": type(payload).__name__})
        return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))

    def _truncate_structure(
        self,
        value: Any,
        *,
        list_limit: int,
        string_limit: int,
        max_depth: int,
        depth: int = 0,
    ) -> Any:
        # Only use custom keys in 'extra', avoid reserved LogRecord keys like 'filename', 'lineno', etc.
        logger.info("_truncate_structure called", extra={"depth": depth, "value_type": type(value).__name__})
        if depth >= max_depth:
            if isinstance(value, dict):
                return {
                    "_truncated": True,
                    "_keys": list(value.keys())[:20],
                }
            if isinstance(value, list):
                return {
                    "_truncated": True,
                    "_items": len(value),
                }

        if isinstance(value, dict):
            return {
                str(key): self._truncate_structure(
                    val,
                    list_limit=list_limit,
                    string_limit=string_limit,
                    max_depth=max_depth,
                    depth=depth + 1,
                )
                for key, val in value.items()
            }

        if isinstance(value, list):
            return [
                self._truncate_structure(
                    item,
                    list_limit=list_limit,
                    string_limit=string_limit,
                    max_depth=max_depth,
                    depth=depth + 1,
                )
                for item in value[:list_limit]
            ]

        if isinstance(value, str) and len(value) > string_limit:
            return value[:string_limit] + "..."

        return value

    def _prepare_input_json(self, extracted_data: Dict[str, Any]) -> Tuple[str, bool]:
        # Only use custom keys in 'extra', avoid reserved LogRecord keys like 'filename', 'lineno', etc.
        logger.info("_prepare_input_json called", extra={"extracted_keys": list(extracted_data.keys())})
        cleaned = clean_for_json(extracted_data)
        serialized = self._to_compact_json(cleaned)
        if len(serialized) <= self.max_input_chars:
            return serialized, False

        for list_limit in [300, 200, 120, 80, 50, 30, 20, 10]:
            for string_limit in [3000, 2000, 1000, 600, 300]:
                truncated = self._truncate_structure(
                    cleaned,
                    list_limit=list_limit,
                    string_limit=string_limit,
                    max_depth=7,
                )
                serialized = self._to_compact_json(truncated)
                if len(serialized) <= self.max_input_chars:
                    return serialized, True

        fallback = {
            "_truncated": True,
            "_reason": "Input exceeded model payload guardrails",
            "_top_level_keys": list(cleaned.keys()) if isinstance(cleaned, dict) else [],
            "_sample": self._truncate_structure(
                cleaned,
                list_limit=5,
                string_limit=300,
                max_depth=4,
            ),
        }
        return self._to_compact_json(fallback), True

    def _build_prompt(self, extracted_data_json: str, input_was_truncated: bool) -> str:
        # Only use custom keys in 'extra', avoid reserved LogRecord keys like 'filename', 'lineno', etc.
        logger.info("_build_prompt called", extra={"input_was_truncated": input_was_truncated})
        truncation_note = (
            "Input data was truncated for model limits. Infer cautiously and avoid overfitting to missing rows."
            if input_was_truncated
            else "Input data is complete."
        )

        return f"""
You are an AI project manager agent.

Your task is to analyze extracted enterprise datasets and return STRICT JSON only.
No markdown. No prose before or after JSON.

Input constraints and adaptation rules:
1. Dataset schema may vary by source. Dynamically infer fields and relationships.
2. Employees can appear with different naming conventions (name, employee_name, id, employee_id, etc.).
3. Projects, tools, and history may be partial. Fill gaps with reasonable assumptions.
4. Keep assignments practical based on skills, capacity/availability, role fit, and historical context when available.
5. Ensure every task has exactly one assigned employee and clear reasoning.
6. Build a concise weekly roadmap per project.
7. Convert project deadlines into integer weeks (deadline_weeks >= 1).
8. Prioritize assignments by experience: higher-priority projects should be handled by more experienced employees.
9. Extract employee details when available (name, id, role, age, experience years) and use them in assignment decisions.
10. {truncation_note}

Return JSON with this exact shape:
{{
  "projects": [
    {{
      "project_name": "",
      "summary": "",
      "requirements": [],
      "specification": [],
      "tools_required": [],
      "priority": "high|medium|low",
      "deadline_weeks": 4,
      "tasks": [
        {{
          "task_name": "",
          "assigned_employee": {{
            "employee_name": "",
            "employee_id": "",
            "role": "",
            "age": 0,
            "experience_years": 0,
            "reason": ""
          }}
        }}
      ],
      "roadmap": [
        {{
          "week": 1,
          "milestone": "",
                    "tasks": [
                        {{
                            "task_name": "",
                            "completed": false
                        }}
                    ]
        }}
      ]
    }}
  ]
}}

Guidance:
- Provide a short summary for each project.
- Requirements should be concrete implementation requirements.
- Specification should list technical scope points (APIs, integration constraints, non-functional requirements, etc.).
- Tools should be relevant and not duplicated.
- Priority must be one of high, medium, low.
- If deadline is given as date/days/months, convert to deadline_weeks.
- Tasks should cover architecture, backend, frontend, testing, and deployment when applicable.
- Each weekly roadmap task must include a boolean completed field (default false).
- For high-priority projects, pick comparatively more experienced employees.
- Roadmap should be week-by-week with clear outcomes and tasks.

Input JSON:
{extracted_data_json}
""".strip()

    def _call_gemini(self, prompt: str) -> str:
        # Only use custom keys in 'extra', avoid reserved LogRecord keys like 'filename', 'lineno', etc.
        logger.info("_call_gemini called")
        if not self.api_key:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="GEMINI_API_KEY is not configured in environment variables",
            )

        try:
            from google import genai
            from google.genai import types
        except ImportError as exc:
            logger.error("google-genai SDK is not installed", extra={"error": str(exc)})
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="google-genai SDK is not installed. Please run: pip install google-genai",
            ) from exc

        try:
            client = genai.Client(api_key=self.api_key)
            
            response = client.models.generate_content(
                model=self.model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=0.2,
                    response_mime_type="application/json",
                ),
            )
            
            if response.text:
                return response.text
                
            logger.error("Gemini response contained no text.")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Gemini response contained no text.",
            )

        except Exception as exc:
            logger.error("Failed to call Gemini API", extra={"error": str(exc)})
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to call Gemini API: {str(exc)}",
            ) from exc

    def _repair_json_with_gemini(self, raw_text: str) -> str:
        repair_prompt = f"""
Convert the following model output into STRICT valid JSON only.
Rules:
- Return only JSON, no markdown, no commentary.
- Keep the original meaning and fields.
- Fix syntax issues like trailing commas, missing quotes, or stray text.

Model output:
{raw_text}
""".strip()
        return self._call_gemini(repair_prompt)

    @staticmethod
    def _normalize_priority(priority: str) -> str:
        # Only use custom keys in 'extra', avoid reserved LogRecord keys like 'filename', 'lineno', etc.
        logger.info("_normalize_priority called", extra={"priority": priority})
        normalized = (priority or "").strip().lower()
        if normalized in {"high", "medium", "low"}:
            return normalized
        if normalized in {"critical", "urgent", "p0", "p1"}:
            return "high"
        if normalized in {"normal", "moderate", "p2"}:
            return "medium"
        if normalized in {"minor", "nice-to-have", "p3", "p4"}:
            return "low"
        return "medium"

    def _normalize_analysis_response(self, response: AnalyzeProjectsResponse) -> AnalyzeProjectsResponse:
        # Only use custom keys in 'extra', avoid reserved LogRecord keys like 'filename', 'lineno', etc.
        logger.info("_normalize_analysis_response called", extra={"num_projects": len(response.projects)})
        for project in response.projects:
            project.priority = self._normalize_priority(project.priority)
            if project.deadline_weeks < 1:
                project.deadline_weeks = 1

            # Roadmap Sorting
            project.roadmap.sort(key=lambda milestone: milestone.week)
            for milestone in project.roadmap:
                if milestone.week < 1:
                    milestone.week = 1

                normalized_tasks: list[RoadmapTask] = []
                for task in milestone.tasks:
                    if isinstance(task, str):
                        normalized_tasks.append(RoadmapTask(task_name=task, completed=False))
                    else:
                        normalized_tasks.append(
                            RoadmapTask(
                                task_name=task.task_name,
                                completed=bool(task.completed),
                            )
                        )
                milestone.tasks = normalized_tasks

        return response

    def analyze_projects(self, extracted_data: Dict[str, Any]) -> AnalyzeProjectsResponse:
        # Only use custom keys in 'extra', avoid reserved LogRecord keys like 'filename', 'lineno', etc.
        logger.info("analyze_projects called", extra={"extracted_keys": list(extracted_data.keys())})
        prepared_json, input_was_truncated = self._prepare_input_json(extracted_data)
        prompt = self._build_prompt(prepared_json, input_was_truncated)
        raw_text = self._call_gemini(prompt)

        try:
            parsed = parse_json_from_text(raw_text)
        except ValueError as exc:
            logger.warning("Primary parse failed, attempting Gemini JSON repair", extra={"error": str(exc)})
            try:
                repaired_raw_text = self._repair_json_with_gemini(raw_text)
                parsed = parse_json_from_text(repaired_raw_text)
            except Exception as repair_exc:
                logger.error("Gemini returned invalid JSON", extra={"error": str(repair_exc)})
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Gemini returned invalid JSON: {str(exc)}",
                ) from repair_exc

        try:
            validated = AnalyzeProjectsResponse.model_validate(parsed)
            return self._normalize_analysis_response(validated)
        except Exception as exc:
            logger.error("Gemini JSON did not match expected schema", extra={"error": str(exc)})
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Gemini JSON did not match expected schema: {str(exc)}",
            ) from exc