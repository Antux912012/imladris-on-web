# SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import hashlib
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def compute_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def build_provenance_record(
    source_path: Path,
    source_rel_path: str,
    env_vars: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "schema": "imladris-provenance/v1",
        "sourceRelPath": source_rel_path,
        "sourceSha256": compute_sha256(source_path),
        "generatedAtUtc": datetime.now(timezone.utc).isoformat(),
        "pythonVersion": sys.version.split()[0],
        "platform": platform.platform(),
        "variableCount": len(env_vars),
    }
