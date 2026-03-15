
import logging
import json
from typing import Any, Dict, List

# Logger setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger("prompt_builder")

def _list_block(values: List[str], fallback: str = "Not specified") -> str:
    cleaned = [str(item).strip() for item in values if str(item).strip()]
    if not cleaned:
        return f"- {fallback}"
    return "\n".join(f"- {item}" for item in cleaned)

def build_architecture_prompt(project: Dict[str, Any]) -> str:
    logger.info("build_architecture_prompt called", extra={"project_keys": list(project.keys())})
    project_name = str(project.get("project_name", "Untitled Project")).strip() or "Untitled Project"
    summary = str(project.get("summary", "")).strip() or "No summary provided."
    requirements = project.get("requirements", [])
    specification = project.get("specification", [])
    tools_required = project.get("tools_required", [])

    expected_architecture = [
        "Backend API service",
        "Frontend application",
        "Data persistence layer",
        "Validation and error handling",
        "Configuration and environment management",
    ]

    return f"""
You are a senior software architect.

Create an implementation plan for this project and return STRICT JSON only.
No markdown. No prose outside JSON.

Project Name:
{project_name}

Project Summary:
{summary}

Requirements:
{_list_block(requirements)}

Specification:
{_list_block(specification)}

Required Tools:
{_list_block(tools_required)}

Expected Architecture:
{_list_block(expected_architecture)}

Return JSON with exact shape:
{{
  "system_architecture": ["..."],
  "backend_modules": ["..."],
  "frontend_modules": ["..."],
  "database_schema": ["..."],
  "files": [
    {{"path": "backend/main.py", "description": "FastAPI app entry"}}
  ]
}}

Keep paths realistic for a Python FastAPI backend and React frontend codebase.
""".strip()

def build_file_generation_prompt(
    project: Dict[str, Any],
    file_path: str,
    file_description: str,
    planned_files: List[Dict[str, Any]],
) -> str:
    logger.info("build_file_generation_prompt called", extra={"file_path": file_path, "project_keys": list(project.keys())})
    project_name = str(project.get("project_name", "Untitled Project")).strip() or "Untitled Project"
    summary = str(project.get("summary", "")).strip() or "No summary provided."
    requirements = project.get("requirements", [])
    specification = project.get("specification", [])
    tools_required = project.get("tools_required", [])

    compact_file_plan = [
        {
            "path": str(item.get("path", "")).strip(),
            "description": str(item.get("description", "")).strip(),
        }
        for item in planned_files
        if str(item.get("path", "")).strip()
    ]

    return f"""
You are generating production-ready source code for one file.
Return code only. Do not include markdown fences.

Project Name: {project_name}
Project Summary: {summary}

Requirements:
{_list_block(requirements)}

Specification:
{_list_block(specification)}

Required Tools:
{_list_block(tools_required)}

Target File:
{file_path}

File Purpose:
{file_description}

Repository File Plan (JSON):
{json.dumps(compact_file_plan, ensure_ascii=False)}

Rules:
1. Generate only content for the target file.
2. Include imports and complete definitions needed in this file.
3. Keep code consistent with FastAPI backend and React frontend split.
4. Use clear naming and practical defaults.
""".strip()
