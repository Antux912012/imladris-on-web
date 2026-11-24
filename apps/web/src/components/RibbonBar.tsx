// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import {
  Bold,
  Italic,
  Heading2,
  Code2,
  Table,
  Download,
  RotateCcw,
} from "lucide-react";
import type { ExportFormat } from "@imladris/shared";
import { api } from "../lib/api";
import { useWorkspaceStore } from "../state/workspaceStore";
import { TablePickerPopover } from "./TablePickerPopover";

export function RibbonBar() {
  const {
    activeWorkspace,
    activeFilePath,
    insertIntoEditor,
    appendConsole,
    setEnvVariables,
  } = useWorkspaceStore();
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("html");

  async function handleExport() {
    if (!activeWorkspace || !activeFilePath) return;
    appendConsole("info", `Exporting ${activeFilePath} as ${exportFormat}...`);
    try {
      const res = await api.exportDocument(
        activeWorkspace.id,
        activeFilePath,
        exportFormat
      );
      appendConsole(
        "info",
        `Export ready: ${res.outputRelPath} (${res.sizeBytes} bytes)`
      );
      window.open(
        `/api/workspaces/${activeWorkspace.id}/export/download?path=${encodeURIComponent(
          res.outputRelPath
        )}`,
        "_blank"
      );
    } catch (err) {
      appendConsole(
        "stderr",
        err instanceof Error ? err.message : "Export failed"
      );
    }
  }

  async function handleRestartKernel() {
    if (!activeWorkspace) return;
    try {
      await api.restartKernel(activeWorkspace.id);
      setEnvVariables([]);
      appendConsole("info", "Kernel restarted.");
    } catch (err) {
      appendConsole(
        "stderr",
        err instanceof Error ? err.message : "Kernel restart failed"
      );
    }
  }

  return (
    <div
      className="flex h-9 shrink-0 items-center justify-between px-3 text-xs"
      style={{
        backgroundColor: "var(--bg-sidebar)",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => insertIntoEditor("**bold**")}
          title="Bold"
          className="rounded px-2 py-1 hover:bg-black/5"
        >
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => insertIntoEditor("*italic*")}
          title="Italic"
          className="rounded px-2 py-1 hover:bg-black/5"
        >
          <Italic className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => insertIntoEditor("\n## Section\n")}
          title="Heading"
          className="rounded px-2 py-1 hover:bg-black/5"
        >
          <Heading2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() =>
            insertIntoEditor('\n```{python}\nprint("Hello")\n```\n')
          }
          title="Insert Python Chunk"
          className="flex items-center gap-1 rounded px-2 py-1 hover:bg-black/5"
        >
          <Code2 className="h-3.5 w-3.5" /> +Python
        </button>
        <button
          type="button"
          onClick={() =>
            insertIntoEditor('\n```{r}\nprint("Hello R")\n```\n')
          }
          title="Insert R Chunk"
          className="flex items-center gap-1 rounded px-2 py-1 hover:bg-black/5"
        >
          <Code2 className="h-3.5 w-3.5" /> +R
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowTablePicker((v) => !v)}
            title="Insert Table"
            className="flex items-center gap-1 rounded px-2 py-1 hover:bg-black/5"
          >
            <Table className="h-3.5 w-3.5" /> Table
          </button>
          {showTablePicker && (
            <TablePickerPopover
              onInsertTable={(md) => insertIntoEditor(md)}
              onClose={() => setShowTablePicker(false)}
            />
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleRestartKernel}
          className="flex items-center gap-1 rounded px-2 py-1 hover:bg-black/5"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Restart Kernel
        </button>

        <select
          value={exportFormat}
          onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
          className="rounded px-1.5 py-0.5 text-xs"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <option value="html">HTML</option>
          <option value="pdf">PDF</option>
          <option value="docx">DOCX</option>
          <option value="rtf">RTF</option>
          <option value="odt">ODT</option>
          <option value="latex">LaTeX (.tex)</option>
          <option value="revealjs">Reveal.js Slides</option>
          <option value="ipynb">Jupyter (.ipynb)</option>
          <option value="mallorn">Mallorn Bundle</option>
        </select>

        <button
          type="button"
          onClick={handleExport}
          disabled={!activeFilePath}
          className="flex items-center gap-1 rounded px-2 py-1 font-medium disabled:opacity-50"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <Download className="h-3.5 w-3.5" /> Export
        </button>
      </div>
    </div>
  );
}
