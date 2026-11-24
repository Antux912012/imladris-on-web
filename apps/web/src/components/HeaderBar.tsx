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
    gridTopology,
    setGridTopology,
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

  function cycleLayout() {
    if (workbenchMode === "focus") {
      setWorkbenchMode("rstudio");
      setGridTopology("quad4");
    } else if (gridTopology === "quad4") {
      setGridTopology("quad6");
    } else {
      setWorkbenchMode("focus");
    }
  }

  const layoutLabel =
    workbenchMode === "focus"
      ? "Focus"
      : gridTopology === "quad6"
        ? "6-Quad"
        : "4-Quad";

  return (
    <header
      className="no-scrollbar flex h-11 shrink-0 items-center justify-between gap-2 overflow-x-auto px-3"
      style={{
        backgroundColor: "var(--bg-header)",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-sm font-semibold tracking-tight">Imladris</span>
        <span
          className="inline-flex items-center gap-1.5 text-xs"
          style={{ color: wsConnected ? "var(--success)" : "var(--fg-muted)" }}
          title={wsConnected ? "Connected to collaboration server" : "Offline"}
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{
              backgroundColor: wsConnected ? "var(--success)" : "var(--fg-muted)",
            }}
          />
          <span className="hidden sm:inline">
            {wsConnected ? "Connected" : "Offline"}
          </span>
        </span>

        <select
          aria-label="Active workspace"
          value={activeWorkspace?.id ?? ""}
          onChange={(e) => {
            const found = workspaces.find((w) => w.id === e.target.value) ?? null;
            setActiveWorkspace(found);
          }}
          className="ui-control max-w-[180px] rounded-md px-2 py-1 text-xs font-medium"
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
          className="ui-control flex items-center gap-1 rounded-md px-2 py-1 text-xs"
        >
          <Plus className="h-3.5 w-3.5" />
          <span className="hidden md:inline">New</span>
        </button>

        {activeFilePath && (
          <span
            className="ml-1 hidden font-mono text-xs lg:inline"
            style={{ color: "var(--fg-muted)" }}
          >
            {activeFilePath}
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {collabPeers.length > 0 && (
          <div className="mr-1 hidden -space-x-1.5 sm:flex">
            {collabPeers.slice(0, 5).map((peer) => (
              <span
                key={peer.clientId}
                title={peer.name}
                className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{
                  backgroundColor: peer.color,
                  boxShadow: "0 0 0 2px var(--bg-header)",
                }}
              >
                {peer.name.slice(0, 1).toUpperCase()}
              </span>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={handleRunAllChunks}
          className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium"
          style={{
            backgroundColor: "var(--accent)",
            color: "var(--accent-fg)",
          }}
        >
          <Play className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Run All</span>
        </button>

        <button
          type="button"
          onClick={cycleLayout}
          title="Cycle Layout: 4-Quad → 6-Quad Ultrawide → Focus"
          className="ui-control hidden items-center gap-1 rounded-md px-2 py-1 text-xs md:flex"
        >
          {workbenchMode === "focus" ? (
            <Columns2 className="h-3.5 w-3.5" />
          ) : (
            <LayoutGrid className="h-3.5 w-3.5" />
          )}
          <span>{layoutLabel}</span>
        </button>

        <button
          type="button"
          onClick={() => setShowHistoryModal(true)}
          title="Revision History"
          className="ui-control flex items-center gap-1 rounded-md px-2 py-1 text-xs"
        >
          <History className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">History</span>
        </button>

        <button
          type="button"
          onClick={() => setShowShareModal(true)}
          title="Share Workspace"
          className="ui-control flex items-center gap-1 rounded-md px-2 py-1 text-xs"
        >
          <Share2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Share</span>
        </button>

        <button
          type="button"
          onClick={() => setShowPluginModal(true)}
          title="Plugins"
          aria-label="Plugins"
          className="ui-control rounded-md p-1.5"
        >
          <Puzzle className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={toggleTheme}
          title="Toggle Theme"
          aria-label="Toggle Theme"
          className="ui-control rounded-md p-1.5"
        >
          {theme === "light" ? (
            <Moon className="h-3.5 w-3.5" />
          ) : (
            <Sun className="h-3.5 w-3.5" />
          )}
        </button>

        <span
          className="hidden text-xs xl:inline"
          style={{ color: "var(--fg-muted)" }}
        >
          {user?.displayName}
        </span>

        <button
          type="button"
          onClick={onLogout}
          title="Sign Out"
          aria-label="Sign Out"
          className="ui-control rounded-md p-1.5"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  );
}
