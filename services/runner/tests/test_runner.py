# SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

from pathlib import Path
from fastapi.testclient import TestClient

from app.main import app


def test_runner_security_stateful_exec_timeout_and_export(
    tmp_path: Path, monkeypatch
) -> None:
    monkeypatch.setenv("WORKSPACES_ROOT", str(tmp_path))
    monkeypatch.setenv("RUNNER_SHARED_SECRET", "unit-test-secret")

    headers = {"X-Runner-Secret": "unit-test-secret"}
    with TestClient(app) as client:
        # Missing secret -> 403
        unauth = client.post(
            "/execute",
            json={
                "workspaceId": "ws-1",
                "sessionKey": "ws-1:shared",
                "engine": "python",
                "code": "print(1)",
            },
        )
        assert unauth.status_code == 403

        # Stateful Python execution
        r1 = client.post(
            "/execute",
            headers=headers,
            json={
                "workspaceId": "ws-1",
                "sessionKey": "ws-1:shared",
                "engine": "python",
                "code": "answer = 41",
            },
        )
        assert r1.status_code == 200
        assert r1.json()["ok"] is True

        r2 = client.post(
            "/execute",
            headers=headers,
            json={
                "workspaceId": "ws-1",
                "sessionKey": "ws-1:shared",
                "engine": "python",
                "code": "print(answer + 1)",
            },
        )
        assert r2.status_code == 200
        assert r2.json()["stdout"].strip() == "42"

        # Environment inspection
        env_resp = client.get(
            "/environment",
            headers=headers,
            params={"sessionKey": "ws-1:shared"},
        )
        assert env_resp.status_code == 200
        names = [v["name"] for v in env_resp.json()["variables"]]
        assert "answer" in names

        # Restart clears state
        rst = client.post(
            "/restart",
            headers=headers,
            json={"sessionKey": "ws-1:shared"},
        )
        assert rst.status_code == 200

        r3 = client.post(
            "/execute",
            headers=headers,
            json={
                "workspaceId": "ws-1",
                "sessionKey": "ws-1:shared",
                "engine": "python",
                "code": "print(answer)",
            },
        )
        assert r3.json()["ok"] is False
        assert "NameError" in r3.json()["stderr"]

        # Timeout enforcement
        r_timeout = client.post(
            "/execute",
            headers=headers,
            json={
                "workspaceId": "ws-1",
                "sessionKey": "ws-1:shared",
                "engine": "python",
                "code": "while True: pass",
                "timeoutMs": 300,
            },
        )
        assert r_timeout.status_code == 200
        assert r_timeout.json()["ok"] is False
        assert "timed out" in r_timeout.json()["stderr"].lower()

        # Export & path traversal check
        ws_dir = tmp_path / "ws-1"
        ws_dir.mkdir(parents=True, exist_ok=True)
        (ws_dir / "doc.qmd").write_text("# Title\n\nHello **world**.\n", encoding="utf-8")

        exp_ok = client.post(
            "/export",
            headers=headers,
            json={
                "workspaceId": "ws-1",
                "sessionKey": "ws-1:shared",
                "sourcePath": "doc.qmd",
                "format": "html",
                "includeProvenance": True,
            },
        )
        assert exp_ok.status_code == 200
        assert exp_ok.json()["outputRelPath"] == ".imladris_exports/doc.html"
        assert (ws_dir / ".imladris_exports/doc.html").is_file()

        exp_bad = client.post(
            "/export",
            headers=headers,
            json={
                "workspaceId": "ws-1",
                "sessionKey": "ws-1:shared",
                "sourcePath": "../../etc/passwd",
                "format": "html",
            },
        )
        assert exp_bad.status_code == 400
