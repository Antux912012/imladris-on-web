# SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

from .security import sanitize_env


class KernelSession:
    def __init__(self, key: str, workspace_dir: Path) -> None:
        self.key = key
        self.workspace_dir = workspace_dir
        self.proc: asyncio.subprocess.Process | None = None
        self.lock = asyncio.Lock()
        self.last_env: list[dict[str, Any]] = []

    async def _ensure_python_worker(self) -> asyncio.subprocess.Process:
        if self.proc is not None and self.proc.returncode is None:
            return self.proc

        runner_root = Path(__file__).resolve().parent.parent
        env = sanitize_env(self.workspace_dir)
        existing_py = env.get("PYTHONPATH", "")
        env["PYTHONPATH"] = (
            f"{runner_root}{os.pathsep}{existing_py}"
            if existing_py
            else str(runner_root)
        )

        self.proc = await asyncio.create_subprocess_exec(
            sys.executable,
            "-u",
            "-m",
            "app.py_worker",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(self.workspace_dir),
            env=env,
        )
        return self.proc

    async def restart(self) -> None:
        async with self.lock:
            if self.proc is not None and self.proc.returncode is None:
                self.proc.kill()
                try:
                    await self.proc.wait()
                except Exception:
                    pass
            self.proc = None
            self.last_env = []

    async def execute_python(self, code: str, timeout_ms: int) -> dict[str, Any]:
        started = time.monotonic()
        async with self.lock:
            proc = await self._ensure_python_worker()
            assert proc.stdin is not None and proc.stdout is not None
            payload = json.dumps({"op": "exec", "code": code}) + "\n"
            proc.stdin.write(payload.encode("utf-8"))
            await proc.stdin.drain()

            try:
                raw_line = await asyncio.wait_for(
                    proc.stdout.readline(), timeout=max(0.1, timeout_ms / 1000.0)
                )
            except asyncio.TimeoutError:
                proc.kill()
                try:
                    await proc.wait()
                except Exception:
                    pass
                self.proc = None
                return {
                    "ok": False,
                    "stdout": "",
                    "stderr": f"Execution timed out after {timeout_ms} ms",
                    "plots": [],
                    "env": self.last_env,
                    "durationMs": int((time.monotonic() - started) * 1000),
                }

            if not raw_line:
                self.proc = None
                return {
                    "ok": False,
                    "stdout": "",
                    "stderr": "Python worker terminated unexpectedly",
                    "plots": [],
                    "env": self.last_env,
                    "durationMs": int((time.monotonic() - started) * 1000),
                }

            result = json.loads(raw_line.decode("utf-8"))
            self.last_env = result.get("env", [])
            result["durationMs"] = int((time.monotonic() - started) * 1000)
            return result

    async def execute_shell(
        self, engine: str, code: str, timeout_ms: int
    ) -> dict[str, Any]:
        started = time.monotonic()
        env = sanitize_env(self.workspace_dir)
        cmd = ["bash", "-lc", code] if engine == "bash" else ["Rscript", "-e", code]
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(self.workspace_dir),
                env=env,
            )
            stdout_b, stderr_b = await asyncio.wait_for(
                proc.communicate(), timeout=max(0.1, timeout_ms / 1000.0)
            )
            return {
                "ok": proc.returncode == 0,
                "stdout": stdout_b.decode("utf-8", errors="replace"),
                "stderr": stderr_b.decode("utf-8", errors="replace"),
                "plots": [],
                "env": self.last_env,
                "durationMs": int((time.monotonic() - started) * 1000),
            }
        except asyncio.TimeoutError:
            proc.kill()
            return {
                "ok": False,
                "stdout": "",
                "stderr": f"Execution timed out after {timeout_ms} ms",
                "plots": [],
                "env": self.last_env,
                "durationMs": int((time.monotonic() - started) * 1000),
            }
        except FileNotFoundError as exc:
            return {
                "ok": False,
                "stdout": "",
                "stderr": f"Runtime not available: {exc}",
                "plots": [],
                "env": self.last_env,
                "durationMs": int((time.monotonic() - started) * 1000),
            }


class SessionManager:
    def __init__(self) -> None:
        self._sessions: dict[str, KernelSession] = {}

    def get_or_create(self, key: str, workspace_dir: Path) -> KernelSession:
        session = self._sessions.get(key)
        if session is None:
            session = KernelSession(key, workspace_dir)
            self._sessions[key] = session
        return session

    async def restart(self, key: str) -> None:
        session = self._sessions.get(key)
        if session is not None:
            await session.restart()
