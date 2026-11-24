// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import { RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import { useWorkspaceStore } from "../state/workspaceStore";

export function EnvironmentPane() {
  const { activeWorkspace, envVariables, setEnvVariables } = useWorkspaceStore();

  async function handleRefresh() {
    if (!activeWorkspace) return;
    const res = await api.getEnvironment(activeWorkspace.id);
    setEnvVariables(res.variables);
  }

  return (
    <div
      className="flex h-full flex-col"
      style={{ backgroundColor: "var(--bg-surface)" }}
    >
      <div
        className="flex items-center justify-between px-2.5 py-1 text-[11px]"
        style={{
          color: "var(--fg-muted)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <span>{envVariables.length} variables in session</span>
        <button
          type="button"
          onClick={handleRefresh}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-black/5"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {envVariables.length === 0 ? (
          <div className="p-3 text-xs" style={{ color: "var(--fg-muted)" }}>
            Environment is empty.
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <th className="px-2 py-1 font-medium">Name</th>
                <th className="px-2 py-1 font-medium">Type</th>
                <th className="px-2 py-1 font-medium">Value / Shape</th>
              </tr>
            </thead>
            <tbody>
              {envVariables.map((v) => (
                <tr
                  key={v.name}
                  style={{ borderBottom: "1px solid var(--border-subtle)" }}
                >
                  <td className="px-2 py-1 font-mono font-medium">{v.name}</td>
                  <td className="px-2 py-1" style={{ color: "var(--fg-muted)" }}>
                    {v.type}
                  </td>
                  <td className="max-w-[180px] truncate px-2 py-1 font-mono">
                    {v.rows !== undefined && v.cols !== undefined
                      ? `[${v.rows}×${v.cols}] `
                      : ""}
                    {v.preview}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
