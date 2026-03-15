
import logging
from typing import Dict, List

from models.response_models import MergedDataset, ParsedDataset

# Logger setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger("dataset_merger")

_DATASET_KEYWORDS: Dict[str, List[str]] = {
    "employees": ["employee", "team", "staff", "resource", "people"],
    "projects": ["project", "initiative", "roadmap", "feature", "milestone"],
    "workload": ["workload", "capacity", "allocation", "availability", "utilization"],
    "skills": ["skill", "competency", "expertise", "certification"],
    "real_estate": ["realestate", "real_estate", "property", "residential", "commercial", "plot", "flat"],
}

def infer_dataset_type(file_name: str, columns: List[str]) -> str:
    logger.info("infer_dataset_type called", extra={"file_name": file_name, "columns": columns})
    haystack = f"{file_name} {' '.join(columns)}".lower()

    for dataset_type, keywords in _DATASET_KEYWORDS.items():
        if any(keyword in haystack for keyword in keywords):
            logger.info("Dataset type inferred", extra={"file_name": file_name, "type": dataset_type})
            return dataset_type

    logger.info("Dataset type defaulted", extra={"file_name": file_name, "type": "generic_dataset"})
    return "generic_dataset"

def merge_datasets(datasets: List[ParsedDataset]) -> Dict[str, List[Dict]]:
    logger.info("merge_datasets called", extra={"num_datasets": len(datasets)})
    merged = []
    for dataset in datasets:
        dataset_type = infer_dataset_type(dataset.file_name, dataset.columns)
        merged.append(
            MergedDataset(
                type=dataset_type,
                file_name=dataset.file_name,
                columns=dataset.columns,
                data=dataset.rows,
            ).model_dump()
        )

    logger.info("merge_datasets completed", extra={"num_merged": len(merged)})
    return {"datasets": merged}
