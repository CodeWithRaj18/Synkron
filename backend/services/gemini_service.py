
import logging
import json
import os
from typing import Any, Dict

import requests
from fastapi import HTTPException, status

from models.response_models import AssignTasksResponse
from utils.json_formatter import parse_json_from_text

# Logger setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger("gemini_service")

class GeminiService:
    def __init__(self) -> None:
        logger.info("GeminiService initialized")
        self.api_key = os.getenv("GEMINI_API_KEY")
        self.model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

    def _build_prompt(self, merged_context: Dict[str, Any]) -> str:
        logger.info("_build_prompt called", extra={"merged_keys": list(merged_context.keys())})
        return f"""
You are an AI task assignment agent for a software engineering organization.

Analyze the datasets and generate intelligent task decomposition and assignment.
Requirements:
1. Infer project goals and break projects into practical tasks.
2. Analyze employee skills and current workload/capacity if available.
3. Assign each task to the best employee.
4. Provide concise but specific reasoning for each assignment.
5. Return STRICT JSON only. No markdown, no prose.

Required JSON schema:
{{
  "projects": [
    {{
      "project_name": "string",
      "tasks": [
        {{
          "task_name": "string",
          "assigned_to": "string",
          "employee_id": "string or null",
          "reason": "single sentence summary",
          "reason_points": ["bullet reason 1", "bullet reason 2", "bullet reason 3"]
        }}
      ]
    }}
  ]
}}

If a field is unavailable in source datasets, keep values null/empty where appropriate.

Input datasets JSON:
{json.dumps(merged_context, ensure_ascii=False)}
""".strip()

    def _call_gemini(self, prompt: str) -> str:
        logger.info("_call_gemini called")
        if not self.api_key:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="GEMINI_API_KEY is not configured in environment variables",
            )

        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.model}:generateContent?key={self.api_key}"
        )

        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.2,
                "response_mime_type": "application/json",
            },
        }

        try:
            response = requests.post(url, json=payload, timeout=60)
            response.raise_for_status()
        except requests.RequestException as exc:
            logger.error("Failed to call Gemini API", extra={"error": str(exc)})
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to call Gemini API: {str(exc)}",
            ) from exc

        body = response.json()
        try:
            return body["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError, TypeError) as exc:
            logger.error("Unexpected Gemini response shape", extra={"error": str(exc)})
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Unexpected Gemini response shape",
            ) from exc

    def generate_assignments(self, merged_context: Dict[str, Any]) -> AssignTasksResponse:
        logger.info("generate_assignments called", extra={"merged_keys": list(merged_context.keys())})
        prompt = self._build_prompt(merged_context)
        raw_text = self._call_gemini(prompt)

        try:
            parsed = parse_json_from_text(raw_text)
        except ValueError as exc:
            logger.error("Gemini returned invalid JSON", extra={"error": str(exc)})
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Gemini returned invalid JSON: {str(exc)}",
            ) from exc

        try:
            return AssignTasksResponse.model_validate(parsed)
        except Exception as exc:
            logger.error("Gemini JSON did not match expected schema", extra={"error": str(exc)})
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Gemini JSON did not match expected schema: {str(exc)}",
            ) from exc
