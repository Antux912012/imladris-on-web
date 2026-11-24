# SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import base64
import io
import json
import sys
import traceback
from contextlib import redirect_stderr, redirect_stdout


def _inspect_ns(ns: dict[str, object]) -> list[dict[str, object]]:
    items: list[dict[str, object]] = []
    for name, val in list(ns.items()):
        if name.startswith("_") or callable(val) or type(val).__name__ == "module":
            continue
        type_name = type(val).__name__
        rows: int | None = None
        cols: int | None = None
        columns: list[str] = []
        is_df = False
        if hasattr(val, "shape"):
            try:
                shp = getattr(val, "shape")
                if isinstance(shp, tuple) and len(shp) >= 1:
                    rows = int(shp[0])
                if isinstance(shp, tuple) and len(shp) >= 2:
                    cols = int(shp[1])
            except Exception:
                pass
        if hasattr(val, "columns"):
            try:
                columns = [str(c) for c in list(getattr(val, "columns"))[:100]]
                is_df = True
            except Exception:
                columns = []
        try:
            preview = repr(val)
        except Exception:
            preview = f"<{type_name}>"
        if len(preview) > 120:
            preview = preview[:117] + "..."
        items.append(
            {
                "name": name,
                "type": type_name,
                "preview": preview,
                "isDataFrame": is_df,
                "columns": columns,
                "rows": rows,
                "cols": cols,
            }
        )
    return items[:100]


def _capture_plots() -> list[str]:
    plots: list[str] = []
    plt = sys.modules.get("matplotlib.pyplot")
    if plt is None:
        return plots
    try:
        fig_nums = plt.get_fignums()
        for num in fig_nums:
            fig = plt.figure(num)
            buf = io.BytesIO()
            fig.savefig(buf, format="png", bbox_inches="tight", dpi=130)
            b64 = base64.b64encode(buf.getvalue()).decode("ascii")
            plots.append(f"data:image/png;base64,{b64}")
        plt.close("all")
    except Exception:
        pass
    return plots


def main() -> None:
    ns: dict[str, object] = {"__name__": "__main__"}
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        req = json.loads(line)
        op = req.get("op")
        if op == "inspect":
            sys.stdout.write(json.dumps({"ok": True, "env": _inspect_ns(ns)}) + "\n")
            sys.stdout.flush()
            continue

        code = str(req.get("code", ""))
        out_buf = io.StringIO()
        err_buf = io.StringIO()
        ok = True
        try:
            compiled = compile(code, "<imladris-cell>", "exec")
            with redirect_stdout(out_buf), redirect_stderr(err_buf):
                exec(compiled, ns, ns)
        except Exception:
            ok = False
            traceback.print_exc(file=err_buf)

        plots = _capture_plots()
        resp = {
            "ok": ok,
            "stdout": out_buf.getvalue(),
            "stderr": err_buf.getvalue(),
            "plots": plots,
            "env": _inspect_ns(ns),
        }
        sys.stdout.write(json.dumps(resp) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
