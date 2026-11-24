# SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import hmac
import os
import re
from pathlib import Path
from fastapi import Header, HTTPException

_SAFE_ID_RE = re.compile(r"^[A-Za-z0-9._-]{1,128}$")

_STRIPPED_ENV_KEYS = {
    "RUNNER_SHARED_SECRET",
    "JWT_SECRET",
    "DATABASE_URL",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
}


def get_runner_secret() -> str:
    return os.environ.get(
        "RUNNER_SHARED_SECRET", "imladris-dev-runner-secret-change-in-prod"
    )


def get_workspaces_root() -> Path:
    return Path(os.environ.get("WORKSPACES_ROOT", "/data/workspaces")).resolve()


async def verify_runner_secret(
    x_runner_secret: str | None = Header(default=None, alias="X-Runner-Secret"),
) -> None:
    expected = get_runner_secret()
    if not x_runner_secret or not hmac.compare_digest(x_runner_secret, expected):
        raise HTTPException(status_code=403, detail="Invalid or missing runner secret")


def resolve_workspace_cwd(workspace_id: str) -> Path:
    if not _SAFE_ID_RE.match(workspace_id):
        raise HTTPException(status_code=400, detail="Invalid workspace identifier")
    root = get_workspaces_root()
    ws_dir = (root / workspace_id).resolve()
    if not ws_dir.is_relative_to(root) or ws_dir == root:
        raise HTTPException(status_code=400, detail="Workspace path escapes root")
    ws_dir.mkdir(parents=True, exist_ok=True)
    return ws_dir


def resolve_safe_subpath(workspace_dir: Path, rel_path: str) -> Path:
    if not rel_path or "\x00" in rel_path or Path(rel_path).is_absolute():
        raise HTTPException(status_code=400, detail="Invalid relative path")
    target = (workspace_dir / rel_path).resolve()
    if not target.is_relative_to(workspace_dir):
        raise HTTPException(status_code=400, detail="Path escapes workspace directory")
    return target


def sanitize_env(workspace_dir: Path) -> dict[str, str]:
    tmp_dir = workspace_dir / ".imladris_tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    env = {k: v for k, v in os.environ.items() if k not in _STRIPPED_ENV_KEYS}
    env["HOME"] = str(workspace_dir)
    env["TMPDIR"] = str(tmp_dir)
    env["MPLBACKEND"] = "Agg"
    env["MPLCONFIGDIR"] = str(tmp_dir / "mpl")
    return env
