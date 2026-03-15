import csv
import json
import logging
import os
import re
from io import BytesIO
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import HTTPException, UploadFile, status

from models.response_models import ParsedDataset
from utils.json_formatter import clean_for_json, parse_json_from_text

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger("excel_parser")

_ALLOWED_EXTENSIONS = {".xlsx", ".xls", ".csv", ".json", ".pdf", ".docx", ".txt"}
_DELIMITER_CANDIDATES = [",", "\t", ";", "|"]
_MAX_ROWS = int(os.getenv("DATASET_PARSE_MAX_ROWS", "5000"))
_MAX_TEXT_CHARS = int(os.getenv("DATASET_PARSE_MAX_TEXT_CHARS", "120000"))
_CSV_ENCODINGS = ["utf-8", "utf-8-sig", "cp1252", "latin1"]


def _safe_filename(filename: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", filename.strip())
    return safe[:220] or "uploaded_file"




def _validate_extension(filename: str) -> str:
    extension = Path(filename).suffix.lower()
    if extension not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Unsupported file format for '{filename}'. Allowed: "
                ".xlsx, .xls, .csv, .json, .pdf, .docx, .txt"
            ),
        )
    return extension


def _extract_text_from_pdf(file_bytes: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="pypdf is not installed. Please run: pip install pypdf",
        ) from exc

    reader = PdfReader(BytesIO(file_bytes))
    texts = [page.extract_text() or "" for page in reader.pages]
    return "\n".join(texts)


def _extract_text_from_docx(file_bytes: bytes) -> str:
    try:
        from docx import Document
    except ImportError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="python-docx is not installed. Please run: pip install python-docx",
        ) from exc

    doc = Document(BytesIO(file_bytes))
    lines = [paragraph.text for paragraph in doc.paragraphs if paragraph.text and paragraph.text.strip()]
    return "\n".join(lines)


def _extract_text(file_bytes: bytes, extension: str) -> str:
    if extension == ".txt":
        return file_bytes.decode("utf-8", errors="replace")
    if extension == ".pdf":
        return _extract_text_from_pdf(file_bytes)
    if extension == ".docx":
        return _extract_text_from_docx(file_bytes)
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Text extraction not supported for extension '{extension}'",
    )


def _records_to_dataset(file_name: str, records: list[dict[str, Any]], columns: list[str]) -> ParsedDataset:
    trimmed_records = records[:_MAX_ROWS]
    cleaned_rows = [clean_for_json(row) for row in trimmed_records]
    return ParsedDataset(file_name=file_name, columns=columns, rows=cleaned_rows)


def _read_dataframe(file_bytes: bytes, extension: str) -> pd.DataFrame:
    if extension == ".csv":
        last_error: Exception | None = None
        for encoding in _CSV_ENCODINGS:
            try:
                return pd.read_csv(BytesIO(file_bytes), encoding=encoding, low_memory=False)
            except Exception as exc:
                last_error = exc
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse CSV with supported encodings: {str(last_error)}",
        ) from last_error
    stream = BytesIO(file_bytes)
    return pd.read_excel(stream)


def _parse_tabular(file_name: str, file_bytes: bytes, extension: str) -> ParsedDataset:
    dataframe = _read_dataframe(file_bytes, extension)
    dataframe = dataframe.where(pd.notna(dataframe), None)
    columns = [str(column) for column in dataframe.columns.tolist()]
    records = dataframe.to_dict(orient="records")
    return _records_to_dataset(file_name, records, columns)


def _parse_json(file_name: str, file_bytes: bytes) -> ParsedDataset:
    try:
        payload = json.loads(file_bytes.decode("utf-8-sig"))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse JSON from '{file_name}': {str(exc)}",
        ) from exc

    if isinstance(payload, list):
        records = [item if isinstance(item, dict) else {"value": item} for item in payload]
    elif isinstance(payload, dict):
        if payload and all(isinstance(value, list) for value in payload.values()):
            candidate_key = max(payload.keys(), key=lambda key: len(payload[key]))
            candidate = payload[candidate_key]
            records = [item if isinstance(item, dict) else {"value": item} for item in candidate]
        else:
            records = [payload]
    else:
        records = [{"value": payload}]

    columns: list[str] = []
    for row in records:
        for key in row.keys():
            text_key = str(key)
            if text_key not in columns:
                columns.append(text_key)
    if not columns:
        columns = ["value"]

    return _records_to_dataset(file_name, records, columns)


def _try_delimited_rows(lines: list[str]) -> tuple[list[str], list[dict[str, Any]]] | None:
    sample = lines[: min(25, len(lines))]
    if len(sample) < 2:
        return None

    for delimiter in _DELIMITER_CANDIDATES:
        split_counts = [len(line.split(delimiter)) for line in sample if delimiter in line]
        if not split_counts:
            continue
        common_count = max(set(split_counts), key=split_counts.count)
        if common_count < 2:
            continue

        reader = csv.reader(lines, delimiter=delimiter)
        parsed_rows = list(reader)
        if not parsed_rows or len(parsed_rows[0]) < 2:
            continue

        header = [cell.strip() or f"column_{index + 1}" for index, cell in enumerate(parsed_rows[0])]
        records: list[dict[str, Any]] = []
        for row in parsed_rows[1 : _MAX_ROWS + 1]:
            if not any(cell.strip() for cell in row):
                continue
            padded = row + [""] * (len(header) - len(row))
            records.append({header[index]: padded[index].strip() for index in range(len(header))})

        if records:
            return header, records

    return None


def _text_to_records(text: str) -> tuple[list[str], list[dict[str, Any]]]:
    limited_text = text[:_MAX_TEXT_CHARS]
    lines = [line.strip() for line in limited_text.splitlines() if line.strip()]
    delimited = _try_delimited_rows(lines)
    if delimited:
        return delimited

    chunks: list[dict[str, Any]] = []
    chunk_size = 1800
    for index in range(0, len(limited_text), chunk_size):
        block = limited_text[index : index + chunk_size].strip()
        if block:
            chunks.append({"section": len(chunks) + 1, "text": block})
        if len(chunks) >= _MAX_ROWS:
            break

    if not chunks:
        chunks = [{"section": 1, "text": ""}]

    return ["section", "text"], chunks


def _gemini_unstructured_extract(file_name: str, text: str) -> tuple[list[str], list[dict[str, Any]]] | None:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None

    trimmed_text = text[: min(len(text), 18000)]
    model = os.getenv("GEMINI_EXTRACTION_MODEL", os.getenv("GEMINI_MODEL", "gemini-2.5-flash"))

    try:
        from google import genai
        from google.genai import types
    except Exception:
        return None

    prompt = (
        "Extract structured rows from this document. Return JSON only with shape "
        '{"columns": ["..."], "rows": [{"...": "..."}]}. '
        "Use concise field names, cap to 200 rows, and preserve important values. "
        f"Document name: {file_name}\n\nDocument text:\n{trimmed_text}"
    )

    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=model,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.0,
                response_mime_type="application/json",
                max_output_tokens=2048,
            ),
        )
        raw_text = response.text or ""
        parsed = parse_json_from_text(raw_text)
        columns = parsed.get("columns", []) if isinstance(parsed, dict) else []
        rows = parsed.get("rows", []) if isinstance(parsed, dict) else []

        if not isinstance(columns, list) or not isinstance(rows, list):
            return None

        cast_columns = [str(column) for column in columns if str(column).strip()]
        cast_rows = [row for row in rows if isinstance(row, dict)]
        if not cast_rows:
            return None

        if not cast_columns:
            derived = list(cast_rows[0].keys()) if cast_rows else []
            cast_columns = [str(key) for key in derived]

        return cast_columns, cast_rows[:200]
    except Exception:
        return None


def _parse_unstructured(file_name: str, file_bytes: bytes, extension: str) -> ParsedDataset:
    text = _extract_text(file_bytes, extension)
    columns, records = _text_to_records(text)

    if columns == ["section", "text"] and len(records) <= 3:
        gemini_result = _gemini_unstructured_extract(file_name, text)
        if gemini_result:
            columns, records = gemini_result

    return _records_to_dataset(file_name, records, columns)


def _parse_from_bytes(file_name: str, file_bytes: bytes, extension: str) -> ParsedDataset:
    if extension in {".xlsx", ".xls", ".csv"}:
        return _parse_tabular(file_name, file_bytes, extension)
    if extension == ".json":
        return _parse_json(file_name, file_bytes)
    return _parse_unstructured(file_name, file_bytes, extension)


async def parse_upload_file(file: UploadFile) -> ParsedDataset:
    logger.info("parse_upload_file called", extra={"uploaded_filename": file.filename})
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must have a valid filename",
        )

    extension = _validate_extension(file.filename)
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File '{file.filename}' is empty",
        )

    try:
        parsed = _parse_from_bytes(file.filename, file_bytes, extension)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to parse file", extra={"uploaded_filename": file.filename, "error": str(exc)})
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse '{file.filename}': {str(exc)}",
        ) from exc

    logger.info("parse_upload_file completed", extra={"uploaded_filename": file.filename, "num_rows": len(parsed.rows)})
    return parsed
