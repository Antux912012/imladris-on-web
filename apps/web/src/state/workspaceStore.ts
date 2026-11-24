// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import { create } from "zustand";
import {
  fromFilename,
  type EnvVariable,
  type User,
  type WorkbenchMode,
} from "@imladris/shared";
import type { FileTreeItem, WorkspaceWithRole } from "../lib/api";

export interface ConsoleEntry {
  id: string;
  ts: number;
  kind: "stdout" | "stderr" | "info";
  text: string;
}

export interface CollabPeer {
  clientId: number;
  name: string;
  color: string;
}

interface WorkspaceState {
  user: User | null;
  workspaces: WorkspaceWithRole[];
  activeWorkspace: WorkspaceWithRole | null;
  files: FileTreeItem[];
  activeFilePath: string | null;
  docContent: string;
  workbenchMode: WorkbenchMode;
  theme: "light" | "dark";
  consoleEntries: ConsoleEntry[];
  plots: string[];
  envVariables: EnvVariable[];
  activeRightTab: "preview" | "plots" | "ai";
  activeTopRightTab: "env" | "citations" | "comments";
  collabPeers: CollabPeer[];
  wsConnected: boolean;
  editorInsertCallback: ((snippet: string) => void) | null;
  editorReplaceCallback: ((content: string) => void) | null;
  showShareModal: boolean;
  showPluginModal: boolean;
  showHistoryModal: boolean;

  setUser: (user: User | null) => void;
  setWorkspaces: (workspaces: WorkspaceWithRole[]) => void;
  setActiveWorkspace: (ws: WorkspaceWithRole | null) => void;
  setFiles: (files: FileTreeItem[]) => void;
  selectFile: (relPath: string | null) => void;
  setDocContent: (content: string) => void;
  setWorkbenchMode: (mode: WorkbenchMode) => void;
  toggleTheme: () => void;
  appendConsole: (kind: ConsoleEntry["kind"], text: string) => void;
  clearConsole: () => void;
  addPlots: (newPlots: string[]) => void;
  setEnvVariables: (vars: EnvVariable[]) => void;
  setActiveRightTab: (tab: WorkspaceState["activeRightTab"]) => void;
  setActiveTopRightTab: (tab: WorkspaceState["activeTopRightTab"]) => void;
  setCollabPeers: (peers: CollabPeer[]) => void;
  setWsConnected: (connected: boolean) => void;
  setEditorInsertCallback: (cb: ((snippet: string) => void) | null) => void;
  insertIntoEditor: (snippet: string) => void;
  setEditorReplaceCallback: (cb: ((content: string) => void) | null) => void;
  replaceEditorContent: (content: string) => void;
  setShowShareModal: (open: boolean) => void;
  setShowPluginModal: (open: boolean) => void;
  setShowHistoryModal: (open: boolean) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  user: null,
  workspaces: [],
  activeWorkspace: null,
  files: [],
  activeFilePath: null,
  docContent: "",
  workbenchMode: "rstudio",
  theme: "light",
  consoleEntries: [],
  plots: [],
  envVariables: [],
  activeRightTab: "preview",
  activeTopRightTab: "env",
  collabPeers: [],
  wsConnected: false,
  editorInsertCallback: null,
  editorReplaceCallback: null,
  showShareModal: false,
  showPluginModal: false,
  showHistoryModal: false,

  setUser: (user) => set({ user }),
  setWorkspaces: (workspaces) => set({ workspaces }),
  setActiveWorkspace: (activeWorkspace) =>
    set({
      activeWorkspace,
      activeFilePath: null,
      files: [],
      docContent: "",
      consoleEntries: [],
      plots: [],
      envVariables: [],
    }),
  setFiles: (files) => set({ files }),
  selectFile: (relPath) => {
    if (!relPath) {
      set({ activeFilePath: null, docContent: "" });
      return;
    }
    const profile = fromFilename(relPath);
    set({
      activeFilePath: relPath,
      workbenchMode: profile.workbenchMode,
    });
  },
  setDocContent: (docContent) => set({ docContent }),
  setWorkbenchMode: (workbenchMode) => set({ workbenchMode }),
  toggleTheme: () =>
    set((s) => {
      const next = s.theme === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      return { theme: next };
    }),
  appendConsole: (kind, text) =>
    set((s) => ({
      consoleEntries: [
        ...s.consoleEntries.slice(-200),
        { id: `${Date.now()}-${Math.random()}`, ts: Date.now(), kind, text },
      ],
    })),
  clearConsole: () => set({ consoleEntries: [] }),
  addPlots: (newPlots) =>
    set((s) => ({
      plots: [...s.plots.slice(-16), ...newPlots],
      activeRightTab: newPlots.length > 0 ? "plots" : s.activeRightTab,
    })),
  setEnvVariables: (envVariables) => set({ envVariables }),
  setActiveRightTab: (activeRightTab) => set({ activeRightTab }),
  setActiveTopRightTab: (activeTopRightTab) => set({ activeTopRightTab }),
  setCollabPeers: (collabPeers) => set({ collabPeers }),
  setWsConnected: (wsConnected) => set({ wsConnected }),
  setEditorInsertCallback: (editorInsertCallback) => set({ editorInsertCallback }),
  insertIntoEditor: (snippet) => {
    const cb = get().editorInsertCallback;
    if (cb) cb(snippet);
  },
  setEditorReplaceCallback: (editorReplaceCallback) => set({ editorReplaceCallback }),
  replaceEditorContent: (content) => {
    const cb = get().editorReplaceCallback;
    if (cb) cb(content);
  },
  setShowShareModal: (showShareModal) => set({ showShareModal }),
  setShowPluginModal: (showPluginModal) => set({ showPluginModal }),
  setShowHistoryModal: (showHistoryModal) => set({ showHistoryModal }),
}));
