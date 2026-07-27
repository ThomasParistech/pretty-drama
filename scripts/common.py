"""Bits shared by every Action script: repo paths, JSON writing, timestamps."""

import json
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def utc_stamp() -> str:
    """Horodatage ISO à la seconde, suffixé Z. Un seul format d'horodatage dans
    tout le projet : `new Date()` le lit tel quel côté navigateur."""
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def write_json(path: Path, data, sort_keys: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2, sort_keys=sort_keys) + "\n",
        encoding="utf-8",
    )
