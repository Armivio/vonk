"""Geospatial helpers — haversine distance and bounding-box pre-filter.

We deliberately avoid PostGIS for the MVP. A simple lat/lon bounding box
narrows the candidate set in SQL, then haversine refines in Python.
"""

from __future__ import annotations

import math
from typing import Tuple

EARTH_RADIUS_KM = 6371.0


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlam / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def bounding_box(lat: float, lon: float, radius_km: float) -> Tuple[float, float, float, float]:
    """Return (min_lat, max_lat, min_lon, max_lon) for a generous bbox.

    Generous: we over-include slightly so haversine refinement is the
    authoritative filter, never the bbox.
    """
    lat_delta = radius_km / 111.0
    cos_lat = max(math.cos(math.radians(lat)), 0.01)
    lon_delta = radius_km / (111.0 * cos_lat)
    return (lat - lat_delta, lat + lat_delta, lon - lon_delta, lon + lon_delta)
