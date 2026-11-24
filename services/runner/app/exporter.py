# SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import asyncio
import json
import shutil
from pathlib import Path
from typing import Any

from fastapi import HTTPException
from .provenance import build_provenance_record
from .security import resolve_safe_subpath, sanitize_env

_FORMAT_EXT = {
    "html": ".html",
    "pdf": ".pdf",
    "docx": ".docx",
    "rtf": ".rtf",
    "odt": ".odt",
    "latex": ".tex",
    "revealjs": ".html",
    "ipynb": ".ipynb",
    "mallorn": ".mallorn.json",
}


async def export_document(
    workspace_dir: Path,
    source_rel_path: str,
    export_format: str,
    include_provenance: bool,
    env_vars: list[dict[str, Any]],
) -> dict[str, Any]:
    src = resolve_safe_subpath(workspace_dir, source_rel_path)
    if not src.is_file():
        raise HTTPException(status_code=404, detail="Source document not found")

    if export_format not in _FORMAT_EXT:
        raise HTTPException(status_code=400, detail=f"Unsupported export format: {export_format}")

    out_dir = workspace_dir / ".imladris_exports"
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = src.stem
    suffix = ".revealjs.html" if export_format == "revealjs" else _FORMAT_EXT[export_format]
    out_path = out_dir / f"{stem}{suffix}"

    provenance = build_provenance_record(src, source_rel_path, env_vars)
    if include_provenance:
        prov_path = out_dir / f"{stem}.provenance.json"
        prov_path.write_text(json.dumps(provenance, indent=2), encoding="utf-8")

    if export_format == "mallorn":
        bundle = {
            "format": "mallorn/v1",
            "sourceRelPath": source_rel_path,
            "content": src.read_text(encoding="utf-8"),
            "provenance": provenance,
            "environment": env_vars,
        }
        out_path.write_text(json.dumps(bundle, indent=2), encoding="utf-8")
        rel_out = out_path.relative_to(workspace_dir).as_posix()
        return {
            "outputRelPath": rel_out,
            "sizeBytes": out_path.stat().st_size,
            "provenance": provenance if include_provenance else None,
        }

    pandoc_bin = shutil.which("pandoc")
    if pandoc_bin:
        pandoc_fmt = "revealjs" if export_format == "revealjs" else export_format
        cmd = [pandoc_bin, str(src), "-t", pandoc_fmt, "-s", "-o", str(out_path)]
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(workspace_dir),
            env=sanitize_env(workspace_dir),
        )
        _, stderr_b = await asyncio.wait_for(proc.communicate(), timeout=60)
        if proc.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=f"Pandoc export failed: {stderr_b.decode('utf-8', errors='replace')}",
            )
    elif export_format == "html":
        text = src.read_text(encoding="utf-8")
        out_path.write_text(
            f"<!doctype html><html><body><pre>{text}</pre></body></html>",
            encoding="utf-8",
        )
    else:
        raise HTTPException(status_code=500, detail="Pandoc is not installed")

    rel_out = out_path.relative_to(workspace_dir).as_posix()
    return {
        "outputRelPath": rel_out,
        "sizeBytes": out_path.stat().st_size,
        "provenance": provenance if include_provenance else None,
    }
