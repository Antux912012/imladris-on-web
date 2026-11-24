// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from "react";
import type { User } from "@imladris/shared";
import { api } from "./lib/api";
import { useWorkspaceStore } from "./state/workspaceStore";
import { AuthGate } from "./components/AuthGate";
import { HeaderBar } from "./components/HeaderBar";
import { RibbonBar } from "./components/RibbonBar";
import { ShareWorkspaceModal } from "./components/ShareWorkspaceModal";
import { PluginBrowserModal } from "./components/PluginBrowserModal";
import { HistoryModal } from "./components/HistoryModal";
import { WorkbenchLayout } from "./components/WorkbenchLayout";
import { FileTreePane } from "./components/FileTreePane";
import { ConsolePane } from "./components/ConsolePane";
import { EnvironmentPane } from "./components/EnvironmentPane";
import { CitationsPane } from "./components/CitationsPane";
import { CommentsPane } from "./components/CommentsPane";
import { LivePreviewPane } from "./components/LivePreviewPane";
import { PlotsPane } from "./components/PlotsPane";
import { ElrondAiPane } from "./components/ElrondAiPane";

export function App() {
  const {
    user,
    setUser,
    setWorkspaces,
    activeWorkspace,
    setActiveWorkspace,
    setFiles,
    selectFile,
    appendConsole,
    addPlots,
    setEnvVariables,
  } = useWorkspaceStore();
  const [booting, setBooting] = useState(true);

  const loadWorkspaces = useCallback(async () => {
    const res = await api.listWorkspaces();
    let list = res.workspaces;
    if (list.length === 0) {
      const created = await api.createWorkspace("My Research Workspace");
      list = [created.workspace];
    }
    setWorkspaces(list);
    setActiveWorkspace(list[0] ?? null);
  }, [setWorkspaces, setActiveWorkspace]);

  useEffect(() => {
    api
      .me()
      .then(async (res) => {
        setUser(res.user);
        await loadWorkspaces();
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => setBooting(false));
  }, [setUser, loadWorkspaces]);

  useEffect(() => {
    if (!activeWorkspace) return;
    let cancelled = false;

    api.listFiles(activeWorkspace.id).then((res) => {
      if (cancelled) return;
      setFiles(res.files);
      const firstFile = res.files.find((f) => !f.isDir);
      if (firstFile) selectFile(firstFile.relPath);
    });

    api.getEnvironment(activeWorkspace.id).then((res) => {
      if (!cancelled) setEnvVariables(res.variables);
    });

    const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const sock = new WebSocket(
      `${wsProto}//${window.location.host}/ws/events/${activeWorkspace.id}`
    );
    sock.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string) as {
          type: string;
          payload?: Record<string, unknown>;
        };
        if (msg.type === "file_tree_changed") {
          api.listFiles(activeWorkspace.id).then((r) => setFiles(r.files));
        } else if (msg.type === "env_updated" && Array.isArray(msg.payload?.variables)) {
          setEnvVariables(msg.payload.variables);
        } else if (msg.type === "plot" && Array.isArray(msg.payload?.plots)) {
          addPlots(msg.payload.plots as string[]);
        } else if (msg.type === "stdout") {
          if (typeof msg.payload?.stdout === "string" && msg.payload.stdout) {
            appendConsole("stdout", msg.payload.stdout);
          }
          if (typeof msg.payload?.stderr === "string" && msg.payload.stderr) {
            appendConsole("stderr", msg.payload.stderr);
          }
        }
      } catch {
        // Ignore malformed event frames
      }
    };

    return () => {
      cancelled = true;
      sock.close();
    };
  }, [
    activeWorkspace?.id,
    setFiles,
    selectFile,
    setEnvVariables,
    addPlots,
    appendConsole,
  ]);

  async function handleAuthenticated(authedUser: User) {
    setUser(authedUser);
    await loadWorkspaces();
  }

  async function handleCreateWorkspace() {
    const name = window.prompt("Workspace name:", "New Paper");
    if (!name?.trim()) return;
    const res = await api.createWorkspace(name.trim());
    const updated = [...useWorkspaceStore.getState().workspaces, res.workspace];
    setWorkspaces(updated);
    setActiveWorkspace(res.workspace);
  }

  async function handleLogout() {
    await api.logout();
    setUser(null);
    setWorkspaces([]);
    setActiveWorkspace(null);
  }

  if (booting) {
    return (
      <div className="flex h-full items-center justify-center text-sm">
        Loading Imladris on Web...
      </div>
    );
  }

  if (!user) {
    return <AuthGate onAuthenticated={handleAuthenticated} />;
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <HeaderBar
        onCreateWorkspace={handleCreateWorkspace}
        onLogout={handleLogout}
      />
      <RibbonBar />
      <WorkbenchLayout
        slots={{
          fileTree: <FileTreePane />,
          consolePane: <ConsolePane />,
          environmentPane: <EnvironmentPane />,
          citationsPane: <CitationsPane />,
          commentsPane: <CommentsPane />,
          previewPane: <LivePreviewPane />,
          plotsPane: <PlotsPane />,
          aiPane: <ElrondAiPane />,
        }}
      />
      <ShareWorkspaceModal onJoinedWorkspace={loadWorkspaces} />
      <PluginBrowserModal />
      <HistoryModal
        onRestored={(content) => useWorkspaceStore.getState().replaceEditorContent(content)}
      />
    </div>
  );
}
