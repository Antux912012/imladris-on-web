// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import { FileText, Folder, FilePlus, FolderPlus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { useWorkspaceStore } from "../state/workspaceStore";

export function FileTreePane() {
  const {
    activeWorkspace,
    files,
    activeFilePath,
    selectFile,
    setFiles,
  } = useWorkspaceStore();

  async function refreshFiles() {
    if (!activeWorkspace) return;
    const res = await api.listFiles(activeWorkspace.id);
    setFiles(res.files);
  }

  async function handleNewFile() {
    if (!activeWorkspace) return;
    const name = window.prompt("New file path (e.g. notes/draft.qmd):", "untitled.qmd");
    if (!name?.trim()) return;
    await api.writeFile(activeWorkspace.id, {
      path: name.trim(),
      content: `# ${name.trim()}\n\n`,
    });
    await refreshFiles();
    selectFile(name.trim());
  }

  async function handleNewFolder() {
    if (!activeWorkspace) return;
    const name = window.prompt("New folder path:", "chapters");
    if (!name?.trim()) return;
    await api.writeFile(activeWorkspace.id, { path: name.trim(), isDir: true });
    await refreshFiles();
  }

  async function handleDelete(relPath: string) {
    if (!activeWorkspace) return;
    if (!window.confirm(`Delete ${relPath}?`)) return;
    await api.deleteFile(activeWorkspace.id, relPath);
    if (activeFilePath === relPath) selectFile(null);
    await refreshFiles();
  }

  return (
    <div
      className="flex h-full flex-col"
      style={{
        backgroundColor: "var(--bg-sidebar)",
        borderRight: "1px solid var(--border-subtle)",
      }}
    >
      <div
        className="flex h-8 shrink-0 items-center justify-between px-2.5 text-xs font-semibold"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <span>Files</span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={handleNewFile}
            title="New File"
            className="rounded p-1 hover:bg-black/5"
          >
            <FilePlus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleNewFolder}
            title="New Folder"
            className="rounded p-1 hover:bg-black/5"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {files.map((item) => {
          const isSelected = item.relPath === activeFilePath;
          const depth = item.relPath.split("/").length - 1;
          return (
            <div
              key={item.relPath}
              className="group flex items-center justify-between rounded-md px-2 py-1 text-xs"
              style={{
                paddingLeft: `${8 + depth * 12}px`,
                backgroundColor: isSelected ? "var(--accent)" : "transparent",
                color: isSelected ? "var(--accent-fg)" : "var(--fg-primary)",
              }}
            >
              <button
                type="button"
                onClick={() => !item.isDir && selectFile(item.relPath)}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
              >
                {item.isDir ? (
                  <Folder className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="truncate">{item.name}</span>
              </button>
              <button
                type="button"
                onClick={() => handleDelete(item.relPath)}
                title="Delete"
                className="hidden rounded p-0.5 opacity-70 hover:opacity-100 group-hover:inline-flex"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
