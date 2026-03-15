
import logging
import json
import os
import time
from typing import Generator

import requests
from fastapi import HTTPException, status

# Logger setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger("ollama_streaming_client")

class OllamaStreamingClient:
    def __init__(self, base_url: str = "http://localhost:11434", model: str = "deepseek-coder:6.7b") -> None:
        logger.info("OllamaStreamingClient initialized", extra={"base_url": base_url, "model": model})
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.max_retries = int(os.getenv("OLLAMA_MAX_RETRIES", "2"))
        self.retry_backoff_seconds = float(os.getenv("OLLAMA_RETRY_BACKOFF_SECONDS", "1.5"))

    def _should_retry(self, exc: requests.RequestException) -> bool:
        response = getattr(exc, "response", None)
        if response is None:
            return True
        return int(getattr(response, "status_code", 0)) >= 500

    @property
    def _generate_url(self) -> str:
        logger.info("_generate_url called", extra={"url": f"{self.base_url}/api/generate"})
        return f"{self.base_url}/api/generate"

    def generate_text(self, prompt: str) -> str:
        logger.info("generate_text called", extra={"prompt_preview": prompt[:40]})
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
        }

        for attempt in range(self.max_retries + 1):
            try:
                response = requests.post(self._generate_url, json=payload, timeout=240)
                response.raise_for_status()
                body = response.json()
                return str(body.get("response", ""))
            except requests.RequestException as exc:
                is_last_attempt = attempt >= self.max_retries
                if is_last_attempt or not self._should_retry(exc):
                    logger.error("Failed to call Ollama", extra={"error": str(exc), "attempt": attempt + 1})
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail=f"Failed to call Ollama: {str(exc)}",
                    ) from exc
                sleep_seconds = self.retry_backoff_seconds * (attempt + 1)
                logger.warning(
                    "Transient Ollama error, retrying",
                    extra={"attempt": attempt + 1, "sleep_seconds": sleep_seconds, "error": str(exc)},
                )
                time.sleep(sleep_seconds)
            except ValueError as exc:
                logger.error("Ollama returned invalid JSON", extra={"error": str(exc)})
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Ollama returned invalid JSON.",
                ) from exc

        return ""

    def stream_generate(self, prompt: str) -> Generator[str, None, None]:
        logger.info("stream_generate called", extra={"prompt_preview": prompt[:40]})
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": True,
        }

        for attempt in range(self.max_retries + 1):
            try:
                with requests.post(self._generate_url, json=payload, stream=True, timeout=900) as response:
                    response.raise_for_status()

                    for raw_line in response.iter_lines(decode_unicode=True):
                        if not raw_line:
                            continue

                        try:
                            row = json.loads(raw_line)
                        except json.JSONDecodeError:
                            logger.error("stream_generate JSON decode error", extra={"raw_line": raw_line})
                            continue

                        chunk = str(row.get("response", ""))
                        if chunk:
                            logger.info("stream_generate yielded chunk", extra={"chunk_len": len(chunk)})
                            yield chunk

                        if bool(row.get("done", False)):
                            logger.info("stream_generate done signal received")
                            return
                return
            except requests.RequestException as exc:
                is_last_attempt = attempt >= self.max_retries
                if is_last_attempt or not self._should_retry(exc):
                    logger.error("Failed while streaming from Ollama", extra={"error": str(exc), "attempt": attempt + 1})
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail=f"Failed while streaming from Ollama: {str(exc)}",
                    ) from exc
                sleep_seconds = self.retry_backoff_seconds * (attempt + 1)
                logger.warning(
                    "Transient Ollama streaming error, retrying",
                    extra={"attempt": attempt + 1, "sleep_seconds": sleep_seconds, "error": str(exc)},
                )
                time.sleep(sleep_seconds)
