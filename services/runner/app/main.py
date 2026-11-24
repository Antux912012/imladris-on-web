# SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

from typing import Literal
from fastapi import Depends, FastAPI
from pydantic import BaseModel, Field

from .exporter import export_document
from .inspector import get_environment_snapshot
from .security import resolve_workspace_cwd, verify_runner_secret
from .sessions import SessionManager

app = FastAPI(title="Imladris Runner", version="0.1.0")
sessions = SessionManager()


class ExecutePayload(BaseModel):
    workspaceId: str
    sessionKey: str
    engine: Literal["python", "r", "bash"] = "python"
    code: str
    timeoutMs: int = Field(default=60000, ge=100, le=300000)


class RestartPayload(BaseModel):
    sessionKey: str


class ExportPayload(BaseModel):
    workspaceId: str
    sessionKey: str
    sourcePath: str
    format: Literal[
        "html", "pdf", "docx", "rtf", "odt", "latex", "revealjs", "ipynb", "mallorn"
    ] = "html"
    includeProvenance: bool = True


@app.get("/health")
async def health() -> dict[str, object]:
    return {"ok": True, "service": "imladris-runner"}


@app.post("/execute", dependencies=[Depends(verify_runner_secret)])
async def execute_code(payload: ExecutePayload) -> dict[str, object]:
    ws_dir = resolve_workspace_cwd(payload.workspaceId)
    session = sessions.get_or_create(payload.sessionKey, ws_dir)
    if payload.engine == "python":
        return await session.execute_python(payload.code, payload.timeoutMs)
    return await session.execute_shell(payload.engine, payload.code, payload.timeoutMs)


@app.post("/restart", dependencies=[Depends(verify_runner_secret)])
async def restart_kernel(payload: RestartPayload) -> dict[str, object]:
    await sessions.restart(payload.sessionKey)
    return {"ok": True}


@app.get("/environment", dependencies=[Depends(verify_runner_secret)])
async def get_environment(sessionKey: str) -> dict[str, object]:
    session = sessions._sessions.get(sessionKey)
    return {"variables": get_environment_snapshot(session)}


@app.post("/export", dependencies=[Depends(verify_runner_secret)])
async def export_doc(payload: ExportPayload) -> dict[str, object]:
    ws_dir = resolve_workspace_cwd(payload.workspaceId)
    session = sessions._sessions.get(payload.sessionKey)
    env_vars = get_environment_snapshot(session)
    return await export_document(
        workspace_dir=ws_dir,
        source_rel_path=payload.sourcePath,
        export_format=payload.format,
        include_provenance=payload.includeProvenance,
        env_vars=env_vars,
    )
