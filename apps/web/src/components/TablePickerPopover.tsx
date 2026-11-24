// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { useWorkspaceStore } from "../state/workspaceStore";

interface Props {
  onInsertTable: (tableText: string) => void;
  onClose: () => void;
}

type TableFmt = "markdown" | "html" | "latex";

export function TablePickerPopover({ onInsertTable, onClose }: Props) {
  const { activeFilePath } = useWorkspaceStore();
  const defaultFmt: TableFmt = activeFilePath?.endsWith(".tex")
    ? "latex"
    : activeFilePath?.endsWith(".html")
      ? "html"
      : "markdown";

  const [hover, setHover] = useState<{ r: number; c: number }>({ r: 3, c: 3 });
  const [fmt, setFmt] = useState<TableFmt>(defaultFmt);

  function buildTable(rows: number, cols: number): string {
    if (fmt === "html") {
      const ths = Array.from({ length: cols }, (_, i) => `<th>Col ${i + 1}</th>`).join("");
      const trs = Array.from(
        { length: rows },
        () => `    <tr>${Array.from({ length: cols }, () => "<td> </td>").join("")}</tr>`
      ).join("\n");
      return `\n<table>\n  <thead>\n    <tr>${ths}</tr>\n  </thead>\n  <tbody>\n${trs}\n  </tbody>\n</table>\n`;
    }
    if (fmt === "latex") {
      const spec = Array.from({ length: cols }, () => "l").join(" ");
      const header = `${Array.from({ length: cols }, (_, i) => `Col ${i + 1}`).join(" & ")} \\\\`;
      const body = Array.from(
        { length: rows },
        () => `${Array.from({ length: cols }, () => " ").join(" & ")} \\\\`
      ).join("\n");
      return `\n\\begin{tabular}{${spec}}\n\\hline\n${header}\n\\hline\n${body}\n\\hline\n\\end{tabular}\n`;
    }
    const header = `| ${Array.from({ length: cols }, (_, i) => `Col ${i + 1}`).join(" | ")} |`;
    const sep = `| ${Array.from({ length: cols }, () => "---").join(" | ")} |`;
    const body = Array.from(
      { length: rows },
      () => `| ${Array.from({ length: cols }, () => " ").join(" | ")} |`
    );
    return `\n${[header, sep, ...body].join("\n")}\n`;
  }

  return (
    <div
      className="absolute left-0 top-full z-30 mt-1 rounded-lg p-2.5 shadow-lg"
      style={{
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-medium" style={{ color: "var(--fg-muted)" }}>
          {hover.r} × {hover.c} Table
        </span>
        <select
          value={fmt}
          onChange={(e) => setFmt(e.target.value as TableFmt)}
          className="rounded px-1 py-0.5 text-[10px]"
          style={{
            backgroundColor: "var(--bg-window)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <option value="markdown">Markdown</option>
          <option value="html">HTML</option>
          <option value="latex">LaTeX</option>
        </select>
      </div>
      <div className="grid grid-cols-8 gap-1">
        {Array.from({ length: 8 }).map((_, rIdx) =>
          Array.from({ length: 8 }).map((__, cIdx) => {
            const active = rIdx + 1 <= hover.r && cIdx + 1 <= hover.c;
            return (
              <button
                key={`${rIdx}-${cIdx}`}
                type="button"
                onMouseEnter={() => setHover({ r: rIdx + 1, c: cIdx + 1 })}
                onClick={() => {
                  onInsertTable(buildTable(rIdx + 1, cIdx + 1));
                  onClose();
                }}
                className="h-3.5 w-3.5 rounded-sm border"
                style={{
                  borderColor: "var(--border-subtle)",
                  backgroundColor: active ? "var(--accent)" : "var(--bg-window)",
                }}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
