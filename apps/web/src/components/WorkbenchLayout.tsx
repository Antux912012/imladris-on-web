// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { useWorkspaceStore, type MobilePane } from "../state/workspaceStore";
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

function useIsCompactViewport(breakpointPx = 900): boolean {
  const [compact, setCompact] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < breakpointPx : false
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`);
    const update = () => setCompact(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpointPx]);

  return compact;
}

export function WorkbenchLayout({ slots }: { slots: WorkbenchSlots }) {
  const {
    workbenchMode,
    gridTopology,
    mobilePane,
    setMobilePane,
    activeRightTab,
    setActiveRightTab,
    activeTopRightTab,
    setActiveTopRightTab,
  } = useWorkspaceStore();

  const isCompact = useIsCompactViewport(900);

  const rightBottomContent =
    activeRightTab === "preview"
      ? slots.previewPane
      : activeRightTab === "plots"
        ? slots.plotsPane
        : slots.aiPane;

  const topRightContent =
    activeTopRightTab === "env"
      ? slots.environmentPane
      : activeTopRightTab === "citations"
        ? slots.citationsPane
        : slots.commentsPane;

  // Compact / Mobile / Narrow Tablet: Single-pane adaptive switcher
  if (isCompact) {
    const tabs: Array<{ id: MobilePane; label: string }> = [
      { id: "files", label: "Files" },
      { id: "editor", label: "Editor" },
      { id: "console", label: "Console" },
      { id: "preview", label: "Preview" },
      { id: "tools", label: "Tools" },
    ];
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div
          className="no-scrollbar flex h-9 shrink-0 items-center gap-1 overflow-x-auto px-2 text-xs"
          style={{
            backgroundColor: "var(--bg-sidebar)",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setMobilePane(t.id)}
              className="rounded px-2.5 py-1 font-medium"
              style={{
                backgroundColor:
                  mobilePane === t.id ? "var(--bg-surface)" : "transparent",
                color:
                  mobilePane === t.id ? "var(--fg-primary)" : "var(--fg-muted)",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1">
          {mobilePane === "files" && slots.fileTree}
          {mobilePane === "editor" && <CollabEditor />}
          {mobilePane === "console" && slots.consolePane}
          {mobilePane === "preview" && slots.previewPane}
          {mobilePane === "tools" && (
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
                      activeTopRightTab === "env"
                        ? "var(--bg-surface)"
                        : "transparent",
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
                <button
                  type="button"
                  onClick={() => {
                    setActiveRightTab("ai");
                  }}
                  className="rounded px-2 py-0.5 font-medium"
                  style={{
                    backgroundColor:
                      activeRightTab === "ai" ? "var(--bg-surface)" : "transparent",
                  }}
                >
                  Elrond AI
                </button>
              </div>
              <div className="min-h-0 flex-1">
                {activeRightTab === "ai" ? slots.aiPane : topRightContent}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Focus Mode (Distraction-Free 3-Column Split)
  if (workbenchMode === "focus") {
    return (
      <PanelGroup direction="horizontal" className="min-h-0 flex-1">
        <Panel defaultSize={18} minSize={12} maxSize={32}>
          {slots.fileTree}
        </Panel>
        <PanelResizeHandle className="resize-handle-v" />
        <Panel defaultSize={44} minSize={25}>
          <CollabEditor />
        </Panel>
        <PanelResizeHandle className="resize-handle-v" />
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

  // Ultrawide 6-Quadrant (3x2) Layout for 21:9 / 34:9 displays
  if (gridTopology === "quad6") {
    return (
      <PanelGroup direction="horizontal" className="min-h-0 flex-1">
        <Panel defaultSize={34} minSize={22}>
          <PanelGroup direction="vertical">
            <Panel defaultSize={66} minSize={28}>
              <CollabEditor />
            </Panel>
            <PanelResizeHandle className="resize-handle-h" />
            <Panel defaultSize={34} minSize={15}>
              {slots.consolePane}
            </Panel>
          </PanelGroup>
        </Panel>
        <PanelResizeHandle className="resize-handle-v" />
        <Panel defaultSize={36} minSize={20}>
          <PanelGroup direction="vertical">
            <Panel defaultSize={55} minSize={20}>
              {slots.previewPane}
            </Panel>
            <PanelResizeHandle className="resize-handle-h" />
            <Panel defaultSize={45} minSize={20}>
              {slots.aiPane}
            </Panel>
          </PanelGroup>
        </Panel>
        <PanelResizeHandle className="resize-handle-v" />
        <Panel defaultSize={30} minSize={18}>
          <PanelGroup direction="vertical">
            <Panel defaultSize={42} minSize={15}>
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
                        activeTopRightTab === "env"
                          ? "var(--bg-surface)"
                          : "transparent",
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
                <div className="min-h-0 flex-1">{topRightContent}</div>
              </div>
            </Panel>
            <PanelResizeHandle className="resize-handle-h" />
            <Panel defaultSize={58} minSize={20}>
              <PanelGroup direction="horizontal">
                <Panel defaultSize={45} minSize={25}>
                  {slots.fileTree}
                </Panel>
                <PanelResizeHandle className="resize-handle-v" />
                <Panel defaultSize={55} minSize={25}>
                  {slots.plotsPane}
                </Panel>
              </PanelGroup>
            </Panel>
          </PanelGroup>
        </Panel>
      </PanelGroup>
    );
  }

  // Standard 4-Quadrant Workbench
  return (
    <PanelGroup direction="horizontal" className="min-h-0 flex-1">
      <Panel defaultSize={16} minSize={12} maxSize={30}>
        {slots.fileTree}
      </Panel>
      <PanelResizeHandle className="resize-handle-v" />
      <Panel defaultSize={46} minSize={25}>
        <PanelGroup direction="vertical">
          <Panel defaultSize={68} minSize={30}>
            <CollabEditor />
          </Panel>
          <PanelResizeHandle className="resize-handle-h" />
          <Panel defaultSize={32} minSize={15}>
            {slots.consolePane}
          </Panel>
        </PanelGroup>
      </Panel>
      <PanelResizeHandle className="resize-handle-v" />
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
                      activeTopRightTab === "env"
                        ? "var(--bg-surface)"
                        : "transparent",
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
              <div className="min-h-0 flex-1">{topRightContent}</div>
            </div>
          </Panel>
          <PanelResizeHandle className="resize-handle-h" />
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
