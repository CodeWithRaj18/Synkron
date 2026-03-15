
import logging
from typing import Dict

# Logger setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger("file_state_manager")

class FileStateManager:
    def __init__(self) -> None:
        self._files: Dict[str, str] = {}
        logger.info("FileStateManager initialized")

    def ensure(self, file_path: str) -> None:
        logger.info("ensure called", extra={"file_path": file_path})
        if file_path not in self._files:
            self._files[file_path] = ""

    def append(self, file_path: str, chunk: str) -> None:
        logger.info("append called", extra={"file_path": file_path, "chunk_len": len(chunk)})
        self.ensure(file_path)
        self._files[file_path] += chunk

    def get(self, file_path: str) -> str:
        logger.info("get called", extra={"file_path": file_path})
        return self._files.get(file_path, "")

    def dump(self) -> Dict[str, str]:
        logger.info("dump called", extra={"num_files": len(self._files)})
        return dict(self._files)
