// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import { useState, type FormEvent } from "react";
import { Trash2, Terminal } from "lucide-react";
import type { ExecuteEngine } from "@imladris/shared";
import { api } from "../lib/api";
import { useWorkspaceStore } from "../state/workspaceStore";

export function ConsolePane() {
  const {
    activeWorkspace,
    consoleEntries,
    appendConsole,
    clearConsole,
    addPlots,
    setEnvVariables,
  } = useWorkspaceStore();
  const [engine, setEngine] = useState<ExecuteEngine>("python");
  const [cmd, setCmd] = useState("");
  const [running, setRunning] = useState(false);

  async function handleRun(e: FormEvent) {
    e.preventDefault();
    if (!activeWorkspace || !cmd.trim()) return;
    const code = cmd;
    setCmd("");
    setRunning(true);
    appendConsole("info", `> (${engine}) ${code}`);
    try {
      const res = await api.execute(activeWorkspace.id, { engine, code });
      if (res.stdout) appendConsole("stdout", res.stdout);
      if (res.stderr) appendConsole("stderr", res.stderr);
      if (res.plots?.length) addPlots(res.plots);
      if (res.env) setEnvVariables(res.env);
    } catch (err) {
      appendConsole(
        "stderr",
        err instanceof Error ? err.message : "Execution error"
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <div
      className="flex h-full flex-col"
      style={{ backgroundColor: "var(--bg-surface)" }}
    >
      <div
        className="flex h-8 shrink-0 items-center justify-between px-2.5 text-xs"
        style={{
          backgroundColor: "var(--bg-sidebar)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <span className="flex items-center gap-1.5 font-semibold">
          <Terminal className="h-3.5 w-3.5" /> Console
        </span>
        <button
          type="button"
          onClick={clearConsole}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] hover:bg-black/5"
        >
          <Trash2 className="h-3 w-3" /> Clear
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2 font-mono text-xs space-y-1">
        {consoleEntries.length === 0 ? (
          <div style={{ color: "var(--fg-muted)" }}>
            Kernel ready. Run chunks or type a command below.
          </div>
        ) : (
          consoleEntries.map((entry) => (
            <pre
              key={entry.id}
              className="whitespace-pre-wrap break-words"
              style={{
                color:
                  entry.kind === "stderr"
                    ? "var(--danger)"
                    : entry.kind === "info"
                      ? "var(--fg-muted)"
                      : "var(--fg-primary)",
              }}
            >
              {entry.text}
            </pre>
          ))
        )}
      </div>

      <form
        onSubmit={handleRun}
        className="flex shrink-0 items-center gap-1.5 p-1.5"
        style={{ borderTop: "1px solid var(--border-subtle)" }}
      >
        <select
          value={engine}
          onChange={(e) => setEngine(e.target.value as ExecuteEngine)}
          className="rounded px-1.5 py-1 text-xs"
          style={{
            backgroundColor: "var(--bg-sidebar)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <option value="python">Python</option>
          <option value="r">R</option>
          <option value="bash">Bash</option>
        </select>
        <input
          type="text"
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          disabled={running}
          placeholder={`Execute ${engine} expression...`}
          className="flex-1 rounded px-2 py-1 font-mono text-xs outline-none"
          style={{
            backgroundColor: "var(--bg-window)",
            border: "1px solid var(--border-subtle)",
          }}
        />
        <button
          type="submit"
          disabled={running}
          className="rounded px-2.5 py-1 text-xs font-medium disabled:opacity-50"
          style={{ backgroundColor: "var(--accent)", color: "var(--accent-fg)" }}
        >
          Run
        </button>
      </form>
    </div>
  );
}
