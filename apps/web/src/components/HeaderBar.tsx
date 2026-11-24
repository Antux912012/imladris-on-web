// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import {
  Play,
  Share2,
  Moon,
  Sun,
  LogOut,
  Plus,
  Puzzle,
  Columns2,
  LayoutGrid,
  History,
} from "lucide-react";
import { parseChunks } from "@imladris/shared";
import { api } from "../lib/api";
import { useWorkspaceStore } from "../state/workspaceStore";

interface Props {
  onCreateWorkspace: () => Promise<void>;
  onLogout: () => Promise<void>;
}

export function HeaderBar({ onCreateWorkspace, onLogout }: Props) {
  const {
    user,
    workspaces,
    activeWorkspace,
    setActiveWorkspace,
    activeFilePath,
    docContent,
    workbenchMode,
    setWorkbenchMode,
    theme,
    toggleTheme,
    collabPeers,
    wsConnected,
    appendConsole,
    addPlots,
    setEnvVariables,
    setShowShareModal,
    setShowPluginModal,
    setShowHistoryModal,
  } = useWorkspaceStore();

  async function handleRunAllChunks() {
    if (!activeWorkspace) return;
    const chunks = parseChunks(docContent);
    if (chunks.length === 0) {
      appendConsole("info", "No executable chunks found in active document.");
      return;
    }
    for (const chunk of chunks) {
      if (
        chunk.language !== "python" &&
        chunk.language !== "r" &&
        chunk.language !== "bash"
      ) {
        continue;
      }
      appendConsole("info", `Running {${chunk.language}} chunk (${chunk.id})...`);
      try {
        const res = await api.execute(activeWorkspace.id, {
          engine: chunk.language,
          code: chunk.code,
          chunkId: chunk.id,
        });
        if (res.stdout) appendConsole("stdout", res.stdout);
        if (res.stderr) appendConsole("stderr", res.stderr);
        if (res.plots?.length) addPlots(res.plots);
        if (res.env) setEnvVariables(res.env);
      } catch (err) {
        appendConsole(
          "stderr",
          err instanceof Error ? err.message : "Execution failed"
        );
      }
    }
  }

  return (
    <header
      className="flex h-11 shrink-0 items-center justify-between px-3"
      style={{
        backgroundColor: "var(--bg-header)",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold tracking-tight">Imladris</span>
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-medium"
          style={{
            backgroundColor: wsConnected ? "var(--success)" : "var(--bg-hover)",
            color: wsConnected ? "#ffffff" : "var(--fg-muted)",
          }}
        >
          {wsConnected ? "LIVE" : "OFFLINE"}
        </span>

        <select
          value={activeWorkspace?.id ?? ""}
          onChange={(e) => {
            const found = workspaces.find((w) => w.id === e.target.value) ?? null;
            setActiveWorkspace(found);
          }}
          className="rounded-md px-2 py-1 text-xs font-medium outline-none"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          {workspaces.map((ws) => (
            <option key={ws.id} value={ws.id}>
              {ws.name} ({ws.role})
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={onCreateWorkspace}
          title="New Workspace"
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:opacity-80"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <Plus className="h-3.5 w-3.5" /> New
        </button>

        {activeFilePath && (
          <span className="ml-1 font-mono text-xs" style={{ color: "var(--fg-muted)" }}>
            {activeFilePath}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="flex -space-x-1.5">
          {collabPeers.slice(0, 5).map((peer) => (
            <span
              key={peer.clientId}
              title={peer.name}
              className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white ring-2 ring-white"
              style={{ backgroundColor: peer.color }}
            >
              {peer.name.slice(0, 1).toUpperCase()}
            </span>
          ))}
        </div>

        <button
          type="button"
          onClick={handleRunAllChunks}
          className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium"
          style={{
            backgroundColor: "var(--accent)",
            color: "var(--accent-fg)",
          }}
        >
          <Play className="h-3.5 w-3.5" /> Run All
        </button>

        <button
          type="button"
          onClick={() =>
            setWorkbenchMode(workbenchMode === "rstudio" ? "focus" : "rstudio")
          }
          title="Switch Workbench Mode"
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          {workbenchMode === "rstudio" ? (
            <>
              <LayoutGrid className="h-3.5 w-3.5" /> 4-Pane
            </>
          ) : (
            <>
              <Columns2 className="h-3.5 w-3.5" /> Focus
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => setShowPluginModal(true)}
          title="Plugins"
          className="rounded-md p-1.5"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <Puzzle className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={() => setShowHistoryModal(true)}
          title="Revision History"
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <History className="h-3.5 w-3.5" /> History
        </button>

        <button
          type="button"
          onClick={() => setShowShareModal(true)}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <Share2 className="h-3.5 w-3.5" /> Share
        </button>

        <button
          type="button"
          onClick={toggleTheme}
          title="Toggle Theme"
          className="rounded-md p-1.5"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          {theme === "light" ? (
            <Moon className="h-3.5 w-3.5" />
          ) : (
            <Sun className="h-3.5 w-3.5" />
          )}
        </button>

        <span className="text-xs" style={{ color: "var(--fg-muted)" }}>
          {user?.displayName}
        </span>

        <button
          type="button"
          onClick={onLogout}
          title="Sign Out"
          className="rounded-md p-1.5"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  );
}
