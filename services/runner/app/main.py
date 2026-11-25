# SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Literal
from fastapi import Depends, FastAPI
from pydantic import BaseModel, Field

from .exporter import export_document
from .inspector import get_environment_snapshot
from .security import get_runner_secret, resolve_workspace_cwd, verify_runner_secret
from .sessions import SessionManager

sessions = SessionManager()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    get_runner_secret()  # Fail fast in vps mode if secret is invalid
    try:
        yield
    finally:
        await sessions.close_all()


app = FastAPI(title="Imladris Runner", version="0.1.0", lifespan=lifespan)


class ExecutePayload(BaseModel):
    workspaceId: str
    sessionKey: str
    engine: Literal["python", "r", "bash", "julia"] = "python"
    code: str
    timeoutMs: int = Field(default=60000, ge=100, le=300000)
    toolchainId: str | None = None
    toolchainImage: str | None = None


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
    await sessions.prune_idle()
    ws_dir = resolve_workspace_cwd(payload.workspaceId)
    session_key = (
        f"{payload.sessionKey}:{payload.toolchainId}"
        if payload.toolchainId
        else payload.sessionKey
    )
    session = sessions.get_or_create(session_key, ws_dir)
    if payload.engine == "python":
        res = await session.execute_python(payload.code, payload.timeoutMs)
    else:
        res = await session.execute_shell(payload.engine, payload.code, payload.timeoutMs)
    if payload.toolchainId:
        res["toolchainId"] = payload.toolchainId
    return res


@app.post("/restart", dependencies=[Depends(verify_runner_secret)])
async def restart_kernel(payload: RestartPayload) -> dict[str, object]:
    await sessions.restart(payload.sessionKey)
    return {"ok": True}


@app.get("/environment", dependencies=[Depends(verify_runner_secret)])
async def get_environment(sessionKey: str) -> dict[str, object]:
    session = sessions.get(sessionKey)
    return {"variables": get_environment_snapshot(session)}


@app.post("/export", dependencies=[Depends(verify_runner_secret)])
async def export_doc(payload: ExportPayload) -> dict[str, object]:
    ws_dir = resolve_workspace_cwd(payload.workspaceId)
    session = sessions.get(payload.sessionKey)
    env_vars = get_environment_snapshot(session)
    return await export_document(
        workspace_dir=ws_dir,
        source_rel_path=payload.sourcePath,
        export_format=payload.format,
        include_provenance=payload.includeProvenance,
        env_vars=env_vars,
    )
