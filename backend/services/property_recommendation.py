import os
import re
from functools import lru_cache
from typing import Any

import numpy as np
import pandas as pd


# Keep only columns needed for filtering, ranking, and response payload.
_REQUIRED_COLUMNS = [
    "Property_Name",
    "Builder_name",
    "Locality_Name",
    "No_of_BHK",
    "Price",
    "Size",
    "Project_URL",
    "Sub_urban_name",
    "listing_domain_score",
    "is_ready_to_move",
    "is_furnished",
    "is_RERA_registered",
    "is_Apartment",
]
_FIXED_DATASET_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "Realstate_logic", "Makaan_Properties_Buy.csv")
)


def _to_bool(series: pd.Series) -> pd.Series:
    """Convert mixed bool-like values to strict boolean Series quickly."""
    if series.dtype == bool:
        return series

    lowered = series.fillna("").astype(str).str.strip().str.lower()
    return lowered.isin({"1", "true", "yes", "y", "approved"})


@lru_cache(maxsize=1)
def _load_dataset() -> pd.DataFrame:
    """Load and cache dataset once for fast repeated recommendations."""
    frame = pd.read_csv(_FIXED_DATASET_PATH, usecols=_REQUIRED_COLUMNS, low_memory=False)

    # Normalize numeric fields once.
    frame["No_of_BHK"] = pd.to_numeric(frame["No_of_BHK"], errors="coerce")
    frame["Price"] = pd.to_numeric(frame["Price"], errors="coerce")
    frame["Size"] = pd.to_numeric(frame["Size"], errors="coerce")
    frame["listing_domain_score"] = pd.to_numeric(frame["listing_domain_score"], errors="coerce").fillna(0.0)

    # Normalize bool-like fields once.
    frame["is_RERA_registered"] = _to_bool(frame["is_RERA_registered"])
    frame["is_Apartment"] = _to_bool(frame["is_Apartment"])
    frame["is_ready_to_move"] = _to_bool(frame["is_ready_to_move"])
    frame["is_furnished"] = _to_bool(frame["is_furnished"])

    # Cached lowercase columns for vectorized matching.
    frame["_locality_lc"] = frame["Locality_Name"].fillna("").astype(str).str.strip().str.lower()
    frame["_suburban_lc"] = frame["Sub_urban_name"].fillna("").astype(str).str.strip().str.lower()

    return frame


def _parse_bhk(query_lc: str) -> list[int]:
    values = set()

    # Handles patterns like "2 or 3 BHK", "2/3 BHK", "2-3 BHK".
    for match in re.finditer(r"(\d+)\s*(?:or|and|/|-)\s*(\d+)\s*bhk", query_lc):
        values.add(int(match.group(1)))
        values.add(int(match.group(2)))

    # Handles standalone "2 BHK" patterns.
    for match in re.finditer(r"(\d+)\s*bhk", query_lc):
        values.add(int(match.group(1)))

    return sorted(values)


def _money_to_inr(amount: float, unit: str) -> int:
    unit_lc = unit.lower()
    if unit_lc in {"cr", "crore", "crores"}:
        return int(amount * 10_000_000)
    if unit_lc in {"lakh", "lakhs", "lac", "lacs"}:
        return int(amount * 100_000)
    return int(amount)


def _parse_budget(query_lc: str) -> tuple[int | None, int | None]:
    amounts: list[int] = []

    for m in re.finditer(r"(\d+(?:\.\d+)?)\s*(cr|crore|crores|lakh|lakhs|lac|lacs)", query_lc):
        amounts.append(_money_to_inr(float(m.group(1)), m.group(2)))

    # Fallback: rupee numbers like 8000000 / 12000000 / 80,00,000
    for m in re.finditer(r"(?:rs\.?|inr|₹)?\s*(\d[\d,]{5,})", query_lc):
        numeric = int(m.group(1).replace(",", ""))
        amounts.append(numeric)

    if len(amounts) >= 2:
        return min(amounts), max(amounts)
    if len(amounts) == 1:
        return amounts[0], None
    return None, None


def _parse_locations(query_lc: str) -> list[str]:
    locations: list[str] = []

    # Parse phrases after "in" / "near" / "around" / "at" and before common stop words.
    patterns = [
        r"(?:in|near|around|at)\s+([a-z0-9\s,/-]+?)(?:\s+(?:with|within|under|budget|price|that|which|should|project|and)|\.|$)",
    ]

    for pattern in patterns:
        for match in re.finditer(pattern, query_lc):
            block = match.group(1).strip()
            parts = re.split(r",|/|\bor\b|\band\b", block)
            for part in parts:
                token = re.sub(r"[^a-z0-9\s-]", "", part).strip()
                if len(token) >= 3:
                    locations.append(token)

    # Deduplicate while preserving order.
    seen = set()
    ordered = []
    for item in locations:
        if item not in seen:
            seen.add(item)
            ordered.append(item)
    return ordered


def _extract_requirements(client_query: str) -> dict[str, Any]:
    query_lc = client_query.lower()

    return {
        "location": _parse_locations(query_lc),
        "bhk": _parse_bhk(query_lc),
        "budget_min": _parse_budget(query_lc)[0],
        "budget_max": _parse_budget(query_lc)[1],
        "require_rera": "rera" in query_lc and not bool(re.search(r"not\s+rera|without\s+rera", query_lc)),
    }


def _apply_filters(frame: pd.DataFrame, requirements: dict[str, Any]) -> pd.DataFrame:
    mask = pd.Series(True, index=frame.index)

    # BHK filter.
    bhk_values: list[int] = requirements.get("bhk", [])
    if bhk_values:
        mask &= frame["No_of_BHK"].isin(bhk_values)

    # Locality filter.
    location_values: list[str] = requirements.get("location", [])
    if location_values:
        escaped = [re.escape(loc) for loc in location_values]
        locality_pattern = "|".join(escaped)
        mask &= frame["_locality_lc"].str.contains(locality_pattern, regex=True, na=False)

    # Price filter.
    budget_min = requirements.get("budget_min")
    budget_max = requirements.get("budget_max")
    if budget_min is not None:
        mask &= frame["Price"] >= float(budget_min)
    if budget_max is not None:
        mask &= frame["Price"] <= float(budget_max)

    # RERA filter if requested.
    if requirements.get("require_rera"):
        mask &= frame["is_RERA_registered"]

    filtered = frame.loc[mask].copy()

    # Optional enhancement: if locality is too restrictive, fallback using nearby sub-urban names.
    if filtered.empty and location_values:
        escaped = [re.escape(loc) for loc in location_values]
        suburban_pattern = "|".join(escaped)
        relaxed_mask = pd.Series(True, index=frame.index)
        if bhk_values:
            relaxed_mask &= frame["No_of_BHK"].isin(bhk_values)
        if budget_min is not None:
            relaxed_mask &= frame["Price"] >= float(budget_min)
        if budget_max is not None:
            relaxed_mask &= frame["Price"] <= float(budget_max)
        if requirements.get("require_rera"):
            relaxed_mask &= frame["is_RERA_registered"]
        relaxed_mask &= frame["_suburban_lc"].str.contains(suburban_pattern, regex=True, na=False)
        filtered = frame.loc[relaxed_mask].copy()

    return filtered


def _rank_properties(filtered: pd.DataFrame, requirements: dict[str, Any]) -> pd.DataFrame:
    if filtered.empty:
        filtered["_score"] = []
        return filtered

    scores = np.zeros(len(filtered), dtype=float)

    location_values: list[str] = requirements.get("location", [])
    if location_values:
        exact_locality = np.zeros(len(filtered), dtype=bool)
        locality_vals = filtered["_locality_lc"].to_numpy()
        for loc in location_values:
            exact_locality |= locality_vals == loc
        scores += np.where(exact_locality, 40.0, 0.0)

    budget_min = requirements.get("budget_min")
    budget_max = requirements.get("budget_max")
    if budget_min is not None and budget_max is not None and budget_max > budget_min:
        budget_center = (float(budget_min) + float(budget_max)) / 2.0
        half_range = (float(budget_max) - float(budget_min)) / 2.0
        price_distance = np.abs(filtered["Price"].to_numpy() - budget_center)
        closeness = np.clip(1.0 - (price_distance / max(half_range, 1.0)), 0.0, 1.0)
        scores += 25.0 * closeness

    domain = filtered["listing_domain_score"].to_numpy(dtype=float)
    domain_scaled = np.clip(domain, 0.0, 1.0)
    scores += 20.0 * domain_scaled

    scores += np.where(filtered["is_ready_to_move"].to_numpy(), 10.0, 0.0)
    scores += np.where(filtered["is_furnished"].to_numpy(), 5.0, 0.0)

    # Prioritize apartments without hard-eliminating other properties.
    scores += np.where(filtered["is_Apartment"].to_numpy(), 15.0, 0.0)

    filtered["_score"] = scores
    return filtered.sort_values(by="_score", ascending=False)


def recommend_properties(client_query: str) -> dict[str, list[dict[str, Any]]]:
    """
    Parse a natural language inquiry and return top 5 matching properties.

    Output shape:
    {
      "recommendations": [
        {
          "name": "...",
          "builder": "...",
          "location": "...",
          "bhk": 3,
          "price": 9500000,
          "size": 1600,
          "url": "..."
        }
      ]
    }
    """
    requirements = _extract_requirements(client_query)
    dataset = _load_dataset()

    filtered = _apply_filters(dataset, requirements)
    ranked = _rank_properties(filtered, requirements)
    top = ranked.head(5)

    recommendations = [
        {
            "name": str(row.get("Property_Name", "")),
            "builder": str(row.get("Builder_name", "")),
            "location": str(row.get("Locality_Name", "")),
            "bhk": int(row["No_of_BHK"]) if pd.notna(row.get("No_of_BHK")) else None,
            "price": int(row["Price"]) if pd.notna(row.get("Price")) else None,
            "size": int(row["Size"]) if pd.notna(row.get("Size")) else None,
            "url": str(row.get("Project_URL", "")),
        }
        for _, row in top.iterrows()
    ]

    return {"recommendations": recommendations}
