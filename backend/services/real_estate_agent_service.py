import json
import logging
import os
import re
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from fastapi import HTTPException, status

from models.response_models import (
    LegalDocument,
    MarketInsight,
    RealEstateRecommendationResponse,
    RecommendedPlace,
    RealEstateAnalysisResponse,
    RealEstateTask,
)
from services.ollama_streaming_client import OllamaStreamingClient
from utils.json_formatter import parse_json_from_text

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger("real_estate_agent_service")

_DEPARTMENT_WORK_DIVISION = {
    "Land Acquisition": [
        "Find suitable land",
        "Negotiate with landowners",
        "Verify land documents",
        "Complete purchase",
    ],
    "Legal": [
        "Land title verification",
        "Government approvals",
        "Construction permits",
        "Contracts with vendors",
    ],
    "Architecture": [
        "Building layout",
        "Flat designs",
        "Floor plans",
        "Structural drawings",
    ],
    "Construction": [
        "Foundation",
        "Structural work",
        "Plumbing",
        "Electrical",
        "Interior finishing",
    ],
    "Marketing": [
        "Ads",
        "Website",
        "Brochures",
        "Social media campaigns",
    ],
    "Sales": [
        "Customer calls",
        "Site visits",
        "Closing deals",
        "Payment coordination",
    ],
    "Finance": [
        "Project budgeting",
        "Vendor payments",
        "Customer payment tracking",
        "Financial reporting",
    ],
}

_LOCATION_HINTS = ["gachibowli", "kondapur", "hitech", "madhapur", "nanakramguda", "financial district"]
_CSV_ENCODINGS = ["utf-8", "utf-8-sig", "cp1252", "latin1"]
_FIXED_DATASET_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "Realstate_logic", "Makaan_Properties_Buy.csv")
)


class RealEstateAgentService:
    def __init__(self) -> None:
        self.ollama_client: OllamaStreamingClient | None = None

    def _get_ollama_client(self) -> OllamaStreamingClient:
        if self.ollama_client is None:
            self.ollama_client = OllamaStreamingClient(
                base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
                model=os.getenv("OLLAMA_CODE_MODEL", "deepseek-coder:6.7b"),
            )
        return self.ollama_client

    def _extract_rows(self, extracted_data: dict[str, Any]) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []

        datasets = extracted_data.get("datasets") if isinstance(extracted_data, dict) else None
        if isinstance(datasets, list):
            for dataset in datasets:
                if isinstance(dataset, dict) and isinstance(dataset.get("rows"), list):
                    rows.extend([row for row in dataset["rows"] if isinstance(row, dict)])

        base_data = extracted_data.get("base_data") if isinstance(extracted_data, dict) else None
        if isinstance(base_data, dict) and isinstance(base_data.get("datasets"), list):
            for dataset in base_data["datasets"]:
                if isinstance(dataset, dict) and isinstance(dataset.get("rows"), list):
                    rows.extend([row for row in dataset["rows"] if isinstance(row, dict)])

        updated_data = extracted_data.get("updated_data") if isinstance(extracted_data, dict) else None
        if isinstance(updated_data, dict) and isinstance(updated_data.get("new_datasets"), list):
            for dataset in updated_data["new_datasets"]:
                if isinstance(dataset, dict) and isinstance(dataset.get("rows"), list):
                    rows.extend([row for row in dataset["rows"] if isinstance(row, dict)])

        return rows

    def _default_dataset_path(self) -> Path:
        return Path(_FIXED_DATASET_PATH)

    def _load_fixed_dataset_candidates(self) -> list[dict[str, Any]]:
        dataset_path = self._default_dataset_path()
        if not dataset_path.exists():
            logger.warning("Fixed real-estate dataset not found", extra={"dataset_path": str(dataset_path)})
            return []

        frame = None
        last_error: Exception | None = None
        for encoding in _CSV_ENCODINGS:
            try:
                frame = pd.read_csv(dataset_path, encoding=encoding, low_memory=False)
                break
            except Exception as exc:
                last_error = exc

        if frame is None:
            logger.error("Failed loading fixed real-estate dataset", extra={"error": str(last_error)})
            return []

        required_cols = {"Property_Name", "Locality_Name", "Longitude", "Latitude", "No_of_BHK", "Price"}
        if not required_cols.issubset(set(frame.columns)):
            logger.error("Fixed dataset missing required columns", extra={"columns": list(frame.columns)[:20]})
            return []

        candidates: list[dict[str, Any]] = []
        for row in frame.to_dict(orient="records"):
            try:
                latitude = float(row.get("Latitude"))
                longitude = float(row.get("Longitude"))
            except Exception:
                continue

            if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
                continue

            bhk_raw = row.get("No_of_BHK")
            try:
                bhk_num = int(float(bhk_raw))
                bhk_text = f"{bhk_num} BHK"
            except Exception:
                bhk_text = str(bhk_raw or "")

            price_inr = self._extract_price_inr(row.get("Price"))
            rera_approved = self._parse_bool(row.get("is_RERA_registered"))
            is_apartment = self._parse_bool(row.get("is_Apartment"))
            is_ready_to_move = self._parse_bool(row.get("is_ready_to_move"))

            try:
                listing_domain_score = float(row.get("listing_domain_score") or 0.0)
            except Exception:
                listing_domain_score = 0.0

            description_text = str(row.get("description") or "").lower()
            amenities = [
                amenity
                for amenity in ["parking", "security", "gym", "park", "green space", "schools", "hospitals", "supermarkets"]
                if amenity in description_text
            ]

            candidates.append(
                {
                    "project_name": self._to_text(row.get("Property_Name")) or "Unnamed Project",
                    "location": self._to_text(row.get("Locality_Name")),
                    "latitude": latitude,
                    "longitude": longitude,
                    "bhk": bhk_text,
                    "price_inr": price_inr,
                    "amenities": amenities,
                    "rera_approved": rera_approved,
                    "possession_months": None,
                    "is_apartment": is_apartment,
                    "is_ready_to_move": is_ready_to_move,
                    "listing_domain_score": listing_domain_score,
                }
            )

        return candidates

    @staticmethod
    def _to_text(value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()

    @staticmethod
    def _parse_bool(value: Any) -> bool | None:
        if value is None:
            return None
        text = str(value).strip().lower()
        if text in {"true", "yes", "approved", "y", "1"}:
            return True
        if text in {"false", "no", "not approved", "n", "0"}:
            return False
        return None

    @staticmethod
    def _extract_price_inr(value: Any) -> float | None:
        if value is None:
            return None
        text = str(value).lower().replace(",", "")
        match = re.search(r"(\d+(?:\.\d+)?)", text)
        if not match:
            return None
        number = float(match.group(1))
        if "cr" in text or "crore" in text:
            return number * 10_000_000
        if "lakh" in text or "lac" in text:
            return number * 100_000
        if number < 10_000:
            # If very small with no unit, assume lakhs in real-estate context.
            return number * 100_000
        return number

    @staticmethod
    def _extract_possession_months(value: Any) -> int | None:
        if value is None:
            return None
        text = str(value).lower()
        month_match = re.search(r"(\d+)\s*month", text)
        if month_match:
            return int(month_match.group(1))
        year_match = re.search(r"(\d+)\s*year", text)
        if year_match:
            return int(year_match.group(1)) * 12
        numeric = re.search(r"(\d+)", text)
        if numeric:
            value_num = int(numeric.group(1))
            if value_num <= 5:
                return value_num * 12
            return value_num
        return None

    @staticmethod
    def _extract_bhk(value: Any) -> str:
        if value is None:
            return ""
        text = str(value).lower()
        matches = re.findall(r"(\d+)\s*bhk", text)
        if matches:
            unique = sorted(set(matches))
            return "/".join(f"{item} BHK" for item in unique)
        numeric = re.search(r"\b([2-5])\b", text)
        if numeric and "bed" in text:
            return f"{numeric.group(1)} BHK"
        return str(value).strip()

    def _parse_inquiry(self, inquiry_text: str) -> dict[str, Any]:
        text = inquiry_text.lower()

        bhk_values = sorted(set(re.findall(r"(\d+)\s*bhk", text)))
        if not bhk_values:
            bhk_values = sorted(set(re.findall(r"\b([2-5])\b", text)))

        locations = [location for location in _LOCATION_HINTS if location in text]

        budget_min = None
        budget_max = None
        lakh_ranges = re.findall(r"(?:₹|rs\.?\s*)?(\d+(?:\.\d+)?)\s*lakh", text)
        crore_ranges = re.findall(r"(?:₹|rs\.?\s*)?(\d+(?:\.\d+)?)\s*crore", text)
        if len(lakh_ranges) >= 2:
            budget_min = float(lakh_ranges[0]) * 100_000
            budget_max = float(lakh_ranges[1]) * 100_000
        elif len(crore_ranges) >= 2:
            budget_min = float(crore_ranges[0]) * 10_000_000
            budget_max = float(crore_ranges[1]) * 10_000_000
        elif len(lakh_ranges) == 1 and len(crore_ranges) == 1:
            budget_min = float(lakh_ranges[0]) * 100_000
            budget_max = float(crore_ranges[0]) * 10_000_000

        months_match = re.search(r"(\d+)\s*[-–]\s*(\d+)\s*months", text)
        possession_months_range = None
        if months_match:
            possession_months_range = (int(months_match.group(1)), int(months_match.group(2)))

        requested_amenities = [
            amenity
            for amenity in ["parking", "security", "gym", "park", "green space", "schools", "hospitals", "supermarkets"]
            if amenity in text
        ]

        return {
            "bhk_values": bhk_values,
            "locations": locations,
            "budget_min": budget_min,
            "budget_max": budget_max,
            "rera_required": "rera" in text,
            "possession_months_range": possession_months_range,
            "requested_amenities": requested_amenities,
        }

    @staticmethod
    def _extract_bhk_number(bhk_text: str) -> float:
        match = re.search(r"(\d+)", bhk_text or "")
        if match:
            return float(match.group(1))
        return 0.0

    def _build_recommendation_features(self, candidate: dict[str, Any], requirements: dict[str, Any]) -> np.ndarray:
        price = float(candidate.get("price_inr") or 0.0)
        latitude = float(candidate.get("latitude") or 0.0)
        longitude = float(candidate.get("longitude") or 0.0)
        bhk_num = self._extract_bhk_number(str(candidate.get("bhk") or ""))
        amenities_count = float(len(candidate.get("amenities", [])))
        rera = 1.0 if candidate.get("rera_approved") is True else 0.0
        possession = float(candidate.get("possession_months") or 0.0)

        req_lat, req_lon = 17.4448, 78.3915
        locations = [str(item).lower() for item in requirements.get("locations", [])]
        if any("gachibowli" in item for item in locations):
            req_lat, req_lon = 17.4435, 78.3772
        elif any("kondapur" in item for item in locations):
            req_lat, req_lon = 17.4690, 78.3640

        distance = float(np.sqrt((latitude - req_lat) ** 2 + (longitude - req_lon) ** 2))

        budget_min = float(requirements.get("budget_min") or 0.0)
        budget_max = float(requirements.get("budget_max") or 0.0)
        budget_mid = (budget_min + budget_max) / 2 if budget_min and budget_max else 0.0
        budget_gap = abs(price - budget_mid) if budget_mid else 0.0

        return np.array(
            [
                price,
                latitude,
                longitude,
                bhk_num,
                amenities_count,
                rera,
                possession,
                distance,
                budget_gap,
            ],
            dtype=float,
        )

    @staticmethod
    def _fit_linear_model(X: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        means = np.mean(X, axis=0)
        stds = np.std(X, axis=0)
        stds = np.where(stds == 0, 1.0, stds)
        X_scaled = (X - means) / stds
        X_design = np.c_[np.ones(X_scaled.shape[0]), X_scaled]
        coeffs, _, _, _ = np.linalg.lstsq(X_design, y, rcond=None)
        return coeffs, means, stds

    @staticmethod
    def _predict_linear(X: np.ndarray, coeffs: np.ndarray, means: np.ndarray, stds: np.ndarray) -> np.ndarray:
        X_scaled = (X - means) / stds
        X_design = np.c_[np.ones(X_scaled.shape[0]), X_scaled]
        return X_design @ coeffs

    @staticmethod
    def _model_r2(y_true: np.ndarray, y_pred: np.ndarray) -> float:
        ss_res = float(np.sum((y_true - y_pred) ** 2))
        ss_tot = float(np.sum((y_true - np.mean(y_true)) ** 2))
        if ss_tot == 0:
            return 0.0
        return max(-1.0, min(1.0, 1 - (ss_res / ss_tot)))

    def _extract_property_candidates(self, extracted_data: dict[str, Any]) -> list[dict[str, Any]]:
        rows = self._extract_rows(extracted_data)
        candidates: list[dict[str, Any]] = []

        for row in rows:
            if not isinstance(row, dict):
                continue

            lower_map = {str(key).lower(): value for key, value in row.items()}

            def find_value(*keys: str) -> Any:
                for key in keys:
                    for actual_key, actual_value in lower_map.items():
                        if key in actual_key:
                            return actual_value
                return None

            lat_raw = find_value("lat", "latitude")
            lon_raw = find_value("lon", "lng", "longitude")

            try:
                latitude = float(lat_raw)
                longitude = float(lon_raw)
            except Exception:
                continue

            if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
                continue

            project_name = self._to_text(find_value("project", "property", "apartment", "name")) or "Unnamed Project"
            location = self._to_text(find_value("location", "area", "locality", "address"))
            bhk = self._extract_bhk(find_value("bhk", "bedroom", "unit_type", "type"))

            price_raw = find_value("price", "cost", "amount", "value")
            price_inr = self._extract_price_inr(price_raw)

            possession_months = self._extract_possession_months(
                find_value("possession", "handover", "completion", "ready")
            )
            rera_approved = self._parse_bool(find_value("rera", "approved"))
            is_apartment = self._parse_bool(find_value("is_apartment", "apartment"))
            is_ready_to_move = self._parse_bool(find_value("is_ready_to_move", "ready_to_move", "ready"))
            listing_domain_score = find_value("listing_domain_score", "domain_score", "score")
            try:
                listing_domain_score_value = float(listing_domain_score) if listing_domain_score is not None else 0.0
            except Exception:
                listing_domain_score_value = 0.0

            amenities_text = " ".join(
                [
                    self._to_text(find_value("amenities", "facility", "features")),
                    self._to_text(find_value("parking")),
                    self._to_text(find_value("security")),
                    self._to_text(find_value("gym")),
                    self._to_text(find_value("park")),
                ]
            ).lower()
            amenities = [
                amenity
                for amenity in ["parking", "security", "gym", "park", "green space", "schools", "hospitals", "supermarkets"]
                if amenity in amenities_text
            ]

            candidates.append(
                {
                    "project_name": project_name,
                    "location": location,
                    "latitude": latitude,
                    "longitude": longitude,
                    "bhk": bhk,
                    "price_inr": price_inr,
                    "amenities": amenities,
                    "rera_approved": rera_approved,
                    "possession_months": possession_months,
                    "is_apartment": is_apartment,
                    "is_ready_to_move": is_ready_to_move,
                    "listing_domain_score": listing_domain_score_value,
                }
            )

        return candidates

    @staticmethod
    def _score_candidate(candidate: dict[str, Any], requirements: dict[str, Any]) -> tuple[float, list[str]]:
        score = 0.0
        reasons: list[str] = []

        location = str(candidate.get("location", "")).lower()
        req_locations: list[str] = requirements.get("locations", [])
        if req_locations:
            if any(item in location for item in req_locations):
                score += 3.0
                reasons.append("Matches preferred location")

        bhk_text = str(candidate.get("bhk", "")).lower()
        req_bhk: list[str] = requirements.get("bhk_values", [])
        if req_bhk:
            if any(f"{value} bhk" in bhk_text for value in req_bhk):
                score += 2.0
                reasons.append("Matches desired BHK")

        budget_min = requirements.get("budget_min")
        budget_max = requirements.get("budget_max")
        price_inr = candidate.get("price_inr")
        if isinstance(price_inr, (int, float)) and budget_min and budget_max:
            if budget_min <= price_inr <= budget_max:
                score += 2.5
                reasons.append("Within budget range")
            else:
                gap = min(abs(price_inr - budget_min), abs(price_inr - budget_max))
                score += max(0.0, 1.5 - (gap / 25_000_000))

        req_amenities: list[str] = requirements.get("requested_amenities", [])
        available_amenities: list[str] = candidate.get("amenities", [])
        if req_amenities:
            matched = sum(1 for amenity in req_amenities if amenity in available_amenities)
            if matched:
                score += min(2.0, matched * 0.4)
                reasons.append(f"Has {matched} requested amenities")

        if requirements.get("rera_required"):
            if candidate.get("rera_approved") is True:
                score += 1.5
                reasons.append("RERA approved")
            elif candidate.get("rera_approved") is False:
                score -= 1.0

        possession_range = requirements.get("possession_months_range")
        possession_months = candidate.get("possession_months")
        if possession_range and isinstance(possession_months, int):
            min_months, max_months = possession_range
            if min_months <= possession_months <= max_months:
                score += 1.5
                reasons.append("Possession timeline fits 12-18 months")

        return score, reasons

    @staticmethod
    def _normalize_hard_requirements(
        *,
        preferred_locations: list[str],
        bhk_values: list[int],
        budget_min: float | None,
        budget_max: float | None,
        require_rera: bool,
        require_apartment: bool,
        require_ready_to_move: bool,
        min_listing_domain_score: float | None,
    ) -> dict[str, Any]:
        cleaned_locations = [str(item).strip().lower() for item in preferred_locations if str(item).strip()]
        cleaned_bhk = sorted({int(value) for value in bhk_values if int(value) > 0})

        return {
            "locations": cleaned_locations,
            "bhk_values": [str(item) for item in cleaned_bhk],
            "budget_min": float(budget_min) if budget_min is not None else None,
            "budget_max": float(budget_max) if budget_max is not None else None,
            "rera_required": bool(require_rera),
            "require_apartment": bool(require_apartment),
            "require_ready_to_move": bool(require_ready_to_move),
            "min_listing_domain_score": float(min_listing_domain_score) if min_listing_domain_score is not None else None,
        }

    @staticmethod
    def _hard_filter_candidates(candidates: list[dict[str, Any]], requirements: dict[str, Any]) -> list[dict[str, Any]]:
        filtered: list[dict[str, Any]] = []
        locations = requirements.get("locations", [])
        requested_bhk: list[str] = requirements.get("bhk_values", [])
        budget_min = requirements.get("budget_min")
        budget_max = requirements.get("budget_max")
        rera_required = bool(requirements.get("rera_required"))
        apartment_required = bool(requirements.get("require_apartment"))
        ready_required = bool(requirements.get("require_ready_to_move"))
        min_domain = requirements.get("min_listing_domain_score")

        for candidate in candidates:
            location = str(candidate.get("location", "")).lower()
            if locations and not any(item in location for item in locations):
                continue

            bhk_text = str(candidate.get("bhk", "")).lower()
            if requested_bhk and not any(f"{bhk} bhk" in bhk_text for bhk in requested_bhk):
                continue

            price = candidate.get("price_inr")
            if isinstance(price, (int, float)):
                if budget_min is not None and price < budget_min:
                    continue
                if budget_max is not None and price > budget_max:
                    continue
            elif budget_min is not None or budget_max is not None:
                continue

            if rera_required and candidate.get("rera_approved") is not True:
                continue

            if apartment_required and candidate.get("is_apartment") is False:
                continue

            if ready_required and candidate.get("is_ready_to_move") is False:
                continue

            if min_domain is not None and float(candidate.get("listing_domain_score") or 0.0) < float(min_domain):
                continue

            filtered.append(candidate)

        return filtered

    def recommend_places(
        self,
        *,
        extracted_data: dict[str, Any],
        preferred_locations: list[str],
        bhk_values: list[int],
        budget_min: float | None,
        budget_max: float | None,
        require_rera: bool,
        require_apartment: bool,
        require_ready_to_move: bool,
        min_listing_domain_score: float | None,
    ) -> RealEstateRecommendationResponse:
        requirements = self._normalize_hard_requirements(
            preferred_locations=preferred_locations,
            bhk_values=bhk_values,
            budget_min=budget_min,
            budget_max=budget_max,
            require_rera=require_rera,
            require_apartment=require_apartment,
            require_ready_to_move=require_ready_to_move,
            min_listing_domain_score=min_listing_domain_score,
        )

        # Always prefer the fixed dataset configured for real-estate recommendations.
        source_candidates = self._load_fixed_dataset_candidates()
        if not source_candidates:
            source_candidates = self._extract_property_candidates(extracted_data)

        if not source_candidates:
            return RealEstateRecommendationResponse(
                parsed_requirements=requirements,
                recommendations=[],
            )

        filtered_candidates = self._hard_filter_candidates(source_candidates, requirements)
        used_fallback = len(filtered_candidates) == 0
        candidates = filtered_candidates if filtered_candidates else source_candidates

        feature_rows: list[np.ndarray] = []
        label_rows: list[float] = []
        reason_rows: list[list[str]] = []

        for candidate in candidates:
            score, reasons = self._score_candidate(candidate, requirements)
            feature_rows.append(self._build_recommendation_features(candidate, requirements))
            label_rows.append(float(score))
            reason_rows.append(reasons)

        X = np.vstack(feature_rows)
        y = np.array(label_rows, dtype=float)

        if len(X) >= 8:
            rng = np.random.default_rng(42)
            indices = np.arange(len(X))
            rng.shuffle(indices)
            split = max(1, int(0.8 * len(indices)))
            train_idx = indices[:split]
            test_idx = indices[split:] if split < len(indices) else indices[:split]

            coeffs, means, stds = self._fit_linear_model(X[train_idx], y[train_idx])
            y_pred = self._predict_linear(X, coeffs, means, stds)
            test_pred = self._predict_linear(X[test_idx], coeffs, means, stds)
            model_r2 = self._model_r2(y[test_idx], test_pred)
            mae = float(np.mean(np.abs(y[test_idx] - test_pred)))
            y_scores = y_pred
        else:
            model_r2 = 0.0
            mae = 0.0
            y_scores = y

        ranked: list[RecommendedPlace] = []
        for idx, candidate in enumerate(candidates):
            reasons = reason_rows[idx]
            reason_text = "; ".join(reasons) if reasons else "Closest overall match based on available dataset fields"
            ranked.append(
                RecommendedPlace(
                    project_name=str(candidate.get("project_name", "")),
                    location=str(candidate.get("location", "")),
                    latitude=float(candidate.get("latitude", 0.0)),
                    longitude=float(candidate.get("longitude", 0.0)),
                    bhk=str(candidate.get("bhk", "")),
                    price_inr=float(candidate["price_inr"]) if isinstance(candidate.get("price_inr"), (int, float)) else None,
                    amenities=[str(item) for item in candidate.get("amenities", [])],
                    rera_approved=candidate.get("rera_approved"),
                    possession_months=candidate.get("possession_months"),
                    score=float(y_scores[idx]),
                    reason=reason_text,
                )
            )

        ranked.sort(key=lambda item: item.score, reverse=True)
        if not ranked:
            top_results: list[RecommendedPlace] = []
        elif used_fallback:
            top_results = ranked[:1]
        else:
            best_score = ranked[0].score
            minimum_quality = max(1.0, best_score * 0.7)
            filtered_by_quality = [item for item in ranked if item.score >= minimum_quality]

            # Return up to 5 strong matches; guarantee at least one result if any candidate exists.
            if filtered_by_quality:
                top_results = filtered_by_quality[:5]
            else:
                top_results = ranked[:1]

        return RealEstateRecommendationResponse(
            parsed_requirements=requirements,
            recommendations=top_results,
        )

    def _generate_legal_documents(self, extracted_data: dict[str, Any]) -> list[LegalDocument]:
        prompt = (
            "You are a Document Agent for real estate projects. "
            "Generate 3 concise legal documents based on this project dataset. "
            "Return strict JSON only with shape: "
            '{"documents":[{"title":"...","purpose":"...","content":"..."}]}. '\
            "Content should be practical and ready-to-edit legal draft text. "
            f"Dataset JSON: {json.dumps(extracted_data, ensure_ascii=False)[:18000]}"
        )

        try:
            raw = self._get_ollama_client().generate_text(prompt)
            parsed = parse_json_from_text(raw)
            documents = parsed.get("documents", []) if isinstance(parsed, dict) else []
            results: list[LegalDocument] = []
            for item in documents:
                if not isinstance(item, dict):
                    continue
                results.append(
                    LegalDocument(
                        title=str(item.get("title", "")),
                        purpose=str(item.get("purpose", "")),
                        content=str(item.get("content", "")),
                    )
                )
            return results[:3]
        except Exception:
            return []

    @staticmethod
    def _coerce_numeric_series(series: pd.Series) -> pd.Series:
        if pd.api.types.is_numeric_dtype(series):
            return pd.to_numeric(series, errors="coerce")

        cleaned = series.astype(str).str.replace(r"[^0-9.\-]", "", regex=True)
        cleaned = cleaned.mask(cleaned.isin(["", "-", ".", "-.", "--"]), np.nan)
        return pd.to_numeric(cleaned, errors="coerce")

    def _prepare_market_frame(self, rows: list[dict[str, Any]]) -> tuple[pd.DataFrame, str] | None:
        frame = pd.DataFrame(rows)
        if frame.empty:
            return None

        numeric_candidates: dict[str, pd.Series] = {}
        for column in frame.columns:
            numeric_series = self._coerce_numeric_series(frame[column])
            valid_ratio = float(numeric_series.notna().mean())
            if valid_ratio >= 0.35:
                numeric_candidates[str(column)] = numeric_series

        if len(numeric_candidates) < 2:
            return None

        target_candidates = [
            name
            for name in numeric_candidates.keys()
            if any(token in name.lower() for token in ["price", "cost", "rent", "amount", "value"])
        ]
        if target_candidates:
            target = max(target_candidates, key=lambda name: numeric_candidates[name].notna().sum())
        else:
            target = max(numeric_candidates.keys(), key=lambda name: numeric_candidates[name].notna().sum())

        model_frame = pd.DataFrame(index=frame.index)
        for column, values in numeric_candidates.items():
            if column == target:
                continue
            model_frame[column] = values

        categorical = frame.drop(columns=[target], errors="ignore").select_dtypes(include=["object", "string"])
        if not categorical.empty:
            categorical = categorical.fillna("unknown").astype(str)
            dummies = pd.get_dummies(categorical, drop_first=True, dtype=float)
            if dummies.shape[1] > 40:
                dummies = dummies.iloc[:, :40]
            model_frame = pd.concat([model_frame, dummies], axis=1)

        model_frame = model_frame.apply(pd.to_numeric, errors="coerce")
        model_frame = model_frame.fillna(model_frame.median(numeric_only=True)).fillna(0.0)

        y = numeric_candidates[target]
        model_frame[target] = y
        model_frame = model_frame.dropna(subset=[target])

        if target not in model_frame.columns:
            return None

        y_values = model_frame[target].astype(float)
        X_values = model_frame.drop(columns=[target], errors="ignore")

        if X_values.empty or len(X_values) < 8:
            return None

        X_values = X_values.iloc[:, :60]
        prepared = pd.concat([X_values, y_values.rename(target)], axis=1)
        return prepared, target

    def _generate_market_summary(self, insight: MarketInsight) -> str:
        prompt = (
            "You are a Real Estate Agent assistant. "
            "Use the provided ML output and produce a concise business summary in 3-5 sentences. "
            "Do not recompute numbers. Explain confidence from metrics and key drivers. "
            f"ML_OUTPUT={json.dumps(insight.model_dump(), ensure_ascii=False)}"
        )

        try:
            summary = self._get_ollama_client().generate_text(prompt).strip()
            return summary or insight.summary
        except Exception:
            return insight.summary

    def _build_market_insight(self, extracted_data: dict[str, Any]) -> MarketInsight | None:
        rows = self._extract_rows(extracted_data)
        if not rows:
            return None

        prepared = self._prepare_market_frame(rows)
        if not prepared:
            return None

        frame, target = prepared
        y = frame[target].astype(float).to_numpy(dtype=float)
        X = frame.drop(columns=[target], errors="ignore")
        feature_columns = [str(column) for column in X.columns]

        rng = np.random.default_rng(42)
        indices = np.arange(len(X))
        rng.shuffle(indices)
        split_index = max(1, int(len(indices) * 0.8))
        train_idx = indices[:split_index]
        test_idx = indices[split_index:]

        X_train = X.iloc[train_idx].to_numpy(dtype=float)
        y_train = y[train_idx]

        if len(test_idx) == 0:
            X_test = X_train
            y_test = y_train
        else:
            X_test = X.iloc[test_idx].to_numpy(dtype=float)
            y_test = y[test_idx]

        X_train_design = np.c_[np.ones(X_train.shape[0]), X_train]
        coeffs, _, _, _ = np.linalg.lstsq(X_train_design, y_train, rcond=None)

        X_test_design = np.c_[np.ones(X_test.shape[0]), X_test]
        predictions = X_test_design @ coeffs

        ss_res = float(np.sum((y_test - predictions) ** 2))
        ss_tot = float(np.sum((y_test - np.mean(y_test)) ** 2))
        r2_score = 0.0 if ss_tot == 0 else max(-1.0, min(1.0, 1 - (ss_res / ss_tot)))
        mae = float(np.mean(np.abs(y_test - predictions)))
        rmse = float(np.sqrt(np.mean((y_test - predictions) ** 2)))

        full_feature_design = np.c_[np.ones(X.shape[0]), X.to_numpy(dtype=float)]
        full_predictions = full_feature_design @ coeffs
        predicted_price = float(np.mean(full_predictions))

        coef_map = {feature_columns[index]: float(coeffs[index + 1]) for index in range(len(feature_columns))}
        sorted_features = dict(sorted(coef_map.items(), key=lambda item: abs(item[1]), reverse=True)[:5])

        trend = "upward" if predicted_price >= float(np.mean(y)) else "downward"
        base_summary = (
            f"ML predicted average {target} at {predicted_price:.2f}. "
            f"R2={r2_score:.2f}, MAE={mae:.2f}, RMSE={rmse:.2f}. "
            f"Price signal appears {trend}."
        )

        insight = MarketInsight(
            target_column=str(target),
            predicted_price=predicted_price,
            r2_score=r2_score,
            mae=mae,
            rmse=rmse,
            test_samples=int(len(y_test)),
            model_used="linear_regression_numpy",
            top_feature_coefficients=sorted_features,
            summary=base_summary,
        )
        insight.summary = self._generate_market_summary(insight)
        return insight

    def _build_tasks(self) -> list[RealEstateTask]:
        tasks: list[RealEstateTask] = []
        for department, entries in _DEPARTMENT_WORK_DIVISION.items():
            for task in entries:
                tasks.append(RealEstateTask(task=task, department=department))
        return tasks

    def analyze(self, extracted_data: dict[str, Any]) -> RealEstateAnalysisResponse:
        try:
            legal_documents = self._generate_legal_documents(extracted_data)
            market_insights = self._build_market_insight(extracted_data)

            project_name = "Real Estate Project"
            if isinstance(extracted_data, dict):
                maybe_name = extracted_data.get("project_name")
                if isinstance(maybe_name, str) and maybe_name.strip():
                    project_name = maybe_name.strip()

            return RealEstateAnalysisResponse(
                project_name=project_name,
                tasks=self._build_tasks(),
                legal_documents=legal_documents,
                market_insights=market_insights,
            )
        except Exception as exc:
            logger.error("Real estate analysis failed", extra={"error": str(exc)})
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Real estate analysis failed: {str(exc)}",
            ) from exc
