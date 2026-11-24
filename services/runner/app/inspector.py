# SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

from typing import Any
from .sessions import KernelSession


def get_environment_snapshot(session: KernelSession | None) -> list[dict[str, Any]]:
    if session is None:
        return []
    return list(session.last_env)
