
import logging
import json
import re
from typing import Any

# Logger setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger("json_formatter")


def _strip_code_fences(raw: str) -> str:
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?", "", raw).strip()
        raw = re.sub(r"```$", "", raw).strip()
    return raw


def _extract_balanced_json_candidates(raw: str) -> list[str]:
    candidates: list[str] = []
    stack: list[str] = []
    start_idx: int | None = None
    in_string = False
    escaped = False

    for idx, ch in enumerate(raw):
        if escaped:
            escaped = False
            continue

        if ch == "\\":
            escaped = True
            continue

        if ch == '"':
            in_string = not in_string
            continue

        if in_string:
            continue

        if ch in "[{":
            if not stack:
                start_idx = idx
            stack.append(ch)
            continue

        if ch in "]}":
            if not stack:
                continue
            open_ch = stack[-1]
            if (open_ch == "{" and ch == "}") or (open_ch == "[" and ch == "]"):
                stack.pop()
                if not stack and start_idx is not None:
                    candidates.append(raw[start_idx : idx + 1])
                    start_idx = None
            else:
                stack.clear()
                start_idx = None

    return candidates


def _light_json_repair(candidate: str) -> str:
    repaired = candidate
    repaired = re.sub(r",\s*([}\]])", r"\1", repaired)
    repaired = repaired.replace("\u00a0", " ")
    return repaired



def clean_for_json(value: Any) -> Any:
    logger.info("clean_for_json called", extra={"type": type(value).__name__})
    if isinstance(value, dict):
        return {str(key): clean_for_json(val) for key, val in value.items()}
    if isinstance(value, list):
        return [clean_for_json(item) for item in value]
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            return str(value)
    if isinstance(value, float) and (value != value):
        return None
    return value



def parse_json_from_text(text: str) -> Any:
    """Safely extract JSON object/array from model output."""
    logger.info("parse_json_from_text called", extra={"text_preview": text[:40]})
    raw = _strip_code_fences(text.strip())

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    candidates = _extract_balanced_json_candidates(raw)
    if not candidates:
        candidates = re.findall(r"\{[\s\S]*\}|\[[\s\S]*\]", raw)

    for candidate in candidates:
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            repaired_candidate = _light_json_repair(candidate)
            try:
                return json.loads(repaired_candidate)
            except json.JSONDecodeError:
                continue

    raise ValueError("Unable to parse valid JSON from Gemini response")
