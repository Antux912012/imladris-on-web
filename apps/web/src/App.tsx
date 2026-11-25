// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import type { User } from "@imladris/shared";
import { api, getConfiguredServerUrl, isBrowserStandaloneMode } from "./lib/api";
import { useWorkspaceStore } from "./state/workspaceStore";
import { AuthGate } from "./components/AuthGate";
import { HeaderBar } from "./components/HeaderBar";
import { RibbonBar } from "./components/RibbonBar";
import { WorkbenchLayout } from "./components/WorkbenchLayout";
import { FileTreePane } from "./components/FileTreePane";
import { ConsolePane } from "./components/ConsolePane";
import { EnvironmentPane } from "./components/EnvironmentPane";
import { CitationsPane } from "./components/CitationsPane";
import { CommentsPane } from "./components/CommentsPane";
import { LivePreviewPane } from "./components/LivePreviewPane";
import { PlotsPane } from "./components/PlotsPane";
import { ElrondAiPane } from "./components/ElrondAiPane";
import { DemoUpgradeModal } from "./components/DemoUpgradeModal";

const ShareWorkspaceModal = lazy(() =>
  import("./components/ShareWorkspaceModal").then((m) => ({
    default: m.ShareWorkspaceModal,
  }))
);
const PluginBrowserModal = lazy(() =>
  import("./components/PluginBrowserModal").then((m) => ({
    default: m.PluginBrowserModal,
  }))
);
const HistoryModal = lazy(() =>
  import("./components/HistoryModal").then((m) => ({
    default: m.HistoryModal,
  }))
);
const AdminPanelModal = lazy(() =>
  import("./components/AdminPanelModal").then((m) => ({
    default: m.AdminPanelModal,
  }))
);

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
      .catch(async () => {
        // On static hosts (e.g. GitHub Pages) with no backend server configured,
        // automatically launch Browser Standalone Mode so the app works immediately.
        if (
          typeof window !== "undefined" &&
          window.location.hostname.endsWith(".github.io") &&
          !getConfiguredServerUrl()
        ) {
          const standalone = await api.enterStandaloneMode();
          setUser(standalone.user);
          await loadWorkspaces();
          return;
        }
        setUser(null);
      })
      .finally(() => setBooting(false));
  }, [setUser, loadWorkspaces]);

  useEffect(() => {
    if (!activeWorkspace) return;
    let cancelled = false;

    api
      .listFiles(activeWorkspace.id)
      .then((res) => {
        if (cancelled) return;
        setFiles(res.files);
        const firstFile = res.files.find((f) => !f.isDir);
        if (firstFile) selectFile(firstFile.relPath);
      })
      .catch(() => {
        if (!cancelled) appendConsole("stderr", "Failed to load workspace file tree.");
      });

    api
      .getEnvironment(activeWorkspace.id)
      .then((res) => {
        if (!cancelled) setEnvVariables(res.variables);
      })
      .catch(() => {
        if (!cancelled) setEnvVariables([]);
      });

    if (isBrowserStandaloneMode()) {
      return () => {
        cancelled = true;
      };
    }

    const configuredBase = getConfiguredServerUrl();
    const wsTarget = configuredBase
      ? configuredBase.replace(/^http/i, "ws")
      : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;
    const sock = new WebSocket(`${wsTarget}/ws/events/${activeWorkspace.id}`);
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
      <Suspense fallback={null}>
        <ShareWorkspaceModal onJoinedWorkspace={loadWorkspaces} />
        <PluginBrowserModal />
        <HistoryModal
          onRestored={(content) =>
            useWorkspaceStore.getState().replaceEditorContent(content)
          }
        />
        <AdminPanelModal />
      </Suspense>
      <DemoUpgradeModal />
    </div>
  );
}
