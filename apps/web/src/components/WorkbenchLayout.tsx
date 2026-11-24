// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { useWorkspaceStore } from "../state/workspaceStore";
import { CollabEditor } from "./CollabEditor";

export interface WorkbenchSlots {
  fileTree: React.ReactNode;
  consolePane: React.ReactNode;
  environmentPane: React.ReactNode;
  citationsPane: React.ReactNode;
  commentsPane: React.ReactNode;
  previewPane: React.ReactNode;
  plotsPane: React.ReactNode;
  aiPane: React.ReactNode;
}

export function WorkbenchLayout({ slots }: { slots: WorkbenchSlots }) {
  const {
    workbenchMode,
    activeRightTab,
    setActiveRightTab,
    activeTopRightTab,
    setActiveTopRightTab,
  } = useWorkspaceStore();

  const rightBottomContent =
    activeRightTab === "preview"
      ? slots.previewPane
      : activeRightTab === "plots"
        ? slots.plotsPane
        : slots.aiPane;

  if (workbenchMode === "focus") {
    return (
      <PanelGroup direction="horizontal" className="min-h-0 flex-1">
        <Panel defaultSize={18} minSize={12} maxSize={32}>
          {slots.fileTree}
        </Panel>
        <PanelResizeHandle className="w-1 bg-black/10 hover:bg-blue-500/40" />
        <Panel defaultSize={44} minSize={25}>
          <CollabEditor />
        </Panel>
        <PanelResizeHandle className="w-1 bg-black/10 hover:bg-blue-500/40" />
        <Panel defaultSize={38} minSize={20}>
          <div className="flex h-full flex-col">
            <div
              className="flex h-8 shrink-0 items-center gap-1 px-2 text-xs"
              style={{
                backgroundColor: "var(--bg-sidebar)",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              {(["preview", "plots", "ai"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveRightTab(tab)}
                  className="rounded px-2 py-0.5 font-medium capitalize"
                  style={{
                    backgroundColor:
                      activeRightTab === tab ? "var(--bg-surface)" : "transparent",
                  }}
                >
                  {tab === "ai" ? "Elrond AI" : tab}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1">{rightBottomContent}</div>
          </div>
        </Panel>
      </PanelGroup>
    );
  }

  return (
    <PanelGroup direction="horizontal" className="min-h-0 flex-1">
      <Panel defaultSize={16} minSize={12} maxSize={30}>
        {slots.fileTree}
      </Panel>
      <PanelResizeHandle className="w-1 bg-black/10 hover:bg-blue-500/40" />
      <Panel defaultSize={46} minSize={25}>
        <PanelGroup direction="vertical">
          <Panel defaultSize={68} minSize={30}>
            <CollabEditor />
          </Panel>
          <PanelResizeHandle className="h-1 bg-black/10 hover:bg-blue-500/40" />
          <Panel defaultSize={32} minSize={15}>
            {slots.consolePane}
          </Panel>
        </PanelGroup>
      </Panel>
      <PanelResizeHandle className="w-1 bg-black/10 hover:bg-blue-500/40" />
      <Panel defaultSize={38} minSize={20}>
        <PanelGroup direction="vertical">
          <Panel defaultSize={35} minSize={15}>
            <div className="flex h-full flex-col">
              <div
                className="flex h-8 shrink-0 items-center gap-1 px-2 text-xs"
                style={{
                  backgroundColor: "var(--bg-sidebar)",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                <button
                  type="button"
                  onClick={() => setActiveTopRightTab("env")}
                  className="rounded px-2 py-0.5 font-medium"
                  style={{
                    backgroundColor:
                      activeTopRightTab === "env" ? "var(--bg-surface)" : "transparent",
                  }}
                >
                  Environment
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTopRightTab("citations")}
                  className="rounded px-2 py-0.5 font-medium"
                  style={{
                    backgroundColor:
                      activeTopRightTab === "citations"
                        ? "var(--bg-surface)"
                        : "transparent",
                  }}
                >
                  Citations
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTopRightTab("comments")}
                  className="rounded px-2 py-0.5 font-medium"
                  style={{
                    backgroundColor:
                      activeTopRightTab === "comments"
                        ? "var(--bg-surface)"
                        : "transparent",
                  }}
                >
                  Comments
                </button>
              </div>
              <div className="min-h-0 flex-1">
                {activeTopRightTab === "env"
                  ? slots.environmentPane
                  : activeTopRightTab === "citations"
                    ? slots.citationsPane
                    : slots.commentsPane}
              </div>
            </div>
          </Panel>
          <PanelResizeHandle className="h-1 bg-black/10 hover:bg-blue-500/40" />
          <Panel defaultSize={65} minSize={25}>
            <div className="flex h-full flex-col">
              <div
                className="flex h-8 shrink-0 items-center gap-1 px-2 text-xs"
                style={{
                  backgroundColor: "var(--bg-sidebar)",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                {(["preview", "plots", "ai"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveRightTab(tab)}
                    className="rounded px-2 py-0.5 font-medium capitalize"
                    style={{
                      backgroundColor:
                        activeRightTab === tab ? "var(--bg-surface)" : "transparent",
                    }}
                  >
                    {tab === "ai" ? "Elrond AI" : tab}
                  </button>
                ))}
              </div>
              <div className="min-h-0 flex-1">{rightBottomContent}</div>
            </div>
          </Panel>
        </PanelGroup>
      </Panel>
    </PanelGroup>
  );
}
