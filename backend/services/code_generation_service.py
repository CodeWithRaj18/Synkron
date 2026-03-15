
import logging
import json
import os
from typing import Any, Dict, Generator, List

from services.file_state_manager import FileStateManager
from services.ollama_streaming_client import OllamaStreamingClient
from services.prompt_builder import build_architecture_prompt, build_file_generation_prompt
from utils.json_formatter import parse_json_from_text

# Logger setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger("code_generation_service")

class CodeGenerationService:
    def __init__(self) -> None:
        logger.info("CodeGenerationService initialized")
        self.ollama_client = OllamaStreamingClient(
            base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
            model=os.getenv("OLLAMA_CODE_MODEL", "deepseek-coder:6.7b"),
        )

    @staticmethod
    def _event(payload: Dict[str, Any]) -> str:
        logger.info("_event called", extra={"payload_type": payload.get("type")})
        return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

    @staticmethod
    def _normalize_file_plan(plan_data: Dict[str, Any]) -> List[Dict[str, str]]:
        logger.info("_normalize_file_plan called", extra={"plan_keys": list(plan_data.keys())})
        files = plan_data.get("files", [])
        if not isinstance(files, list):
            return []

        normalized: List[Dict[str, str]] = []
        for item in files:
            if not isinstance(item, dict):
                continue

            path = str(item.get("path", "")).strip()
            if not path:
                continue

            normalized.append(
                {
                    "path": path,
                    "description": str(item.get("description", "")).strip(),
                }
            )

        logger.info("_normalize_file_plan completed", extra={"num_files": len(normalized)})
        return normalized

    @staticmethod
    def _default_file_plan(project: Dict[str, Any]) -> List[Dict[str, str]]:
        project_name = str(project.get("project_name", "project")).strip().lower().replace(" ", "-")
        return [
            {"path": "backend/main.py", "description": "FastAPI app entry and API bootstrap"},
            {"path": "backend/models.py", "description": "Pydantic request and response models"},
            {"path": "backend/routes.py", "description": "REST endpoints and route wiring"},
            {"path": "backend/services/core_service.py", "description": "Core business logic for project workflows"},
            {"path": "frontend/src/main.tsx", "description": "Frontend bootstrap and root mounting"},
            {"path": "frontend/src/pages/HomePage.tsx", "description": f"Main UI for {project_name}"},
            {"path": "frontend/src/services/api.ts", "description": "Frontend API client utilities"},
        ]

    def _enforce_plan_size(self, project: Dict[str, Any], file_plan: List[Dict[str, str]]) -> List[Dict[str, str]]:
        deduped: List[Dict[str, str]] = []
        seen_paths: set[str] = set()
        for item in file_plan:
            path = str(item.get("path", "")).strip()
            if not path or path in seen_paths:
                continue
            seen_paths.add(path)
            deduped.append({"path": path, "description": str(item.get("description", "")).strip()})

        if len(deduped) > 7:
            deduped = deduped[:7]

        if len(deduped) >= 6:
            return deduped

        defaults = self._default_file_plan(project)
        for default_item in defaults:
            if default_item["path"] in seen_paths:
                continue
            deduped.append(default_item)
            seen_paths.add(default_item["path"])
            if len(deduped) >= 7:
                break

        if len(deduped) < 6:
            deduped = defaults[:7]

        return deduped

    def stream_project_code(
        self,
        *,
        project_id: str,
        project: Dict[str, Any],
    ) -> Generator[str, None, None]:
        logger.info("stream_project_code called", extra={"project_id": project_id, "project_keys": list(project.keys())})
        state = FileStateManager()

        try:
            yield self._event({"type": "status", "message": "Generating architecture..."})
            try:
                architecture_prompt = build_architecture_prompt(project)
                architecture_raw = self.ollama_client.generate_text(architecture_prompt)
                architecture_data = parse_json_from_text(architecture_raw)
                file_plan = self._normalize_file_plan(architecture_data if isinstance(architecture_data, dict) else {})
            except Exception as architecture_exc:
                logger.warning(
                    "Architecture generation failed, using fallback plan",
                    extra={"error": str(architecture_exc)},
                )
                yield self._event({"type": "status", "message": "Architecture model was unstable. Using fallback 7-file structure."})
                file_plan = self._default_file_plan(project)

            file_plan = self._enforce_plan_size(project, file_plan)
            yield self._event({"type": "status", "message": f"Architecture finalized with {len(file_plan)} files."})

            yield self._event({"type": "file_plan", "files": file_plan})

            for file_item in file_plan:
                file_path = file_item["path"]
                description = file_item.get("description", "")
                state.ensure(file_path)

                yield self._event({"type": "status", "message": f"Generating {file_path}..."})
                logger.info("Generating file", extra={"file_path": file_path, "description": description})

                file_prompt = build_file_generation_prompt(
                    project=project,
                    file_path=file_path,
                    file_description=description,
                    planned_files=file_plan,
                )

                try:
                    for chunk in self.ollama_client.stream_generate(file_prompt):
                        state.append(file_path, chunk)
                        yield self._event(
                            {
                                "type": "token",
                                "project_id": project_id,
                                "file_path": file_path,
                                "chunk": chunk,
                            }
                        )
                except Exception as file_exc:
                    logger.error("File generation failed", extra={"file_path": file_path, "error": str(file_exc)})
                    fallback_stub = (
                        f"# Generation failed for {file_path}\n"
                        f"# Reason: {str(file_exc)}\n"
                        "# You can retry generation for this file.\n"
                    )
                    state.append(file_path, fallback_stub)
                    yield self._event(
                        {
                            "type": "status",
                            "message": f"Temporary model issue while generating {file_path}. Added fallback stub and continuing.",
                        }
                    )

                yield self._event({"type": "file_complete", "file_path": file_path})

            yield self._event({"type": "done", "files": state.dump()})

        except Exception as exc:
            logger.error("stream_project_code error", extra={"error": str(exc)})
            yield self._event({"type": "error", "message": str(exc)})
