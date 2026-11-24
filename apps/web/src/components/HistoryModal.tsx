// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from "react";
import { GitCommitHorizontal, History, RotateCcw, X } from "lucide-react";
import type { DocumentSnapshotMeta } from "@imladris/shared";
import { api } from "../lib/api";
import { useWorkspaceStore } from "../state/workspaceStore";

interface DiffLine {
  type: "context" | "add" | "del";
  line: string;
}

export function HistoryModal({
  onRestored,
}: {
  onRestored: (restoredContent: string) => void;
}) {
  const {
    activeWorkspace,
    activeFilePath,
    showHistoryModal,
    setShowHistoryModal,
  } = useWorkspaceStore();

  const [snapshots, setSnapshots] = useState<DocumentSnapshotMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [diff, setDiff] = useState<DiffLine[]>([]);
  const [commitMsg, setCommitMsg] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const canEdit =
    activeWorkspace?.role === "OWNER" || activeWorkspace?.role === "EDITOR";

  const loadSnapshots = useCallback(async () => {
    if (!activeWorkspace || !activeFilePath) return;
    try {
      const res = await api.listSnapshots(activeWorkspace.id, activeFilePath);
      setSnapshots(res.snapshots);
      if (res.snapshots.length > 0 && !selectedId) {
        setSelectedId(res.snapshots[0]!.id);
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to load history");
    }
  }, [activeWorkspace?.id, activeFilePath, selectedId]);

  useEffect(() => {
    if (showHistoryModal) {
      setSelectedId(null);
      setDiff([]);
      setStatus(null);
      loadSnapshots();
    }
  }, [showHistoryModal, loadSnapshots]);

  useEffect(() => {
    if (!showHistoryModal || !activeWorkspace || !selectedId) return;
    api
      .getSnapshotDetail(activeWorkspace.id, selectedId)
      .then((res) => setDiff(res.diffAgainstCurrent))
      .catch((err) =>
        setStatus(err instanceof Error ? err.message : "Failed to load diff")
      );
  }, [showHistoryModal, activeWorkspace?.id, selectedId]);

  if (!showHistoryModal) return null;

  async function handleCreateCheckpoint(e: React.FormEvent) {
    e.preventDefault();
    if (!activeWorkspace || !activeFilePath || !commitMsg.trim()) return;
    try {
      await api.createRevision(activeWorkspace.id, activeFilePath, commitMsg.trim());
      setCommitMsg("");
      setStatus("Checkpoint saved.");
      await loadSnapshots();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to save checkpoint");
    }
  }

  async function handleRestore(snapshotId: string) {
    if (!activeWorkspace) return;
    try {
      const res = await api.restoreSnapshot(activeWorkspace.id, snapshotId);
      onRestored(res.content);
      setStatus(`Restored ${res.restoredPath} to selected revision.`);
      await loadSnapshots();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Restore failed");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="flex h-[80vh] w-full max-w-4xl flex-col rounded-xl p-5 shadow-xl"
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4" />
            <h2 className="text-base font-semibold">
              Revision History — {activeFilePath ?? "No file selected"}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowHistoryModal(false)}
            className="rounded p-1 hover:opacity-80"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {canEdit && activeFilePath && (
          <form onSubmit={handleCreateCheckpoint} className="mb-3 flex gap-2">
            <input
              type="text"
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              placeholder="Checkpoint message (e.g. 'Revised Methods section')..."
              className="flex-1 rounded-lg px-2.5 py-1.5 text-xs outline-none"
              style={{
                backgroundColor: "var(--bg-window)",
                border: "1px solid var(--border-subtle)",
              }}
            />
            <button
              type="submit"
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium"
              style={{ backgroundColor: "var(--accent)", color: "var(--accent-fg)" }}
            >
              <GitCommitHorizontal className="h-3.5 w-3.5" /> Save Checkpoint
            </button>
          </form>
        )}

        {status && (
          <div className="mb-2 text-xs" style={{ color: "var(--fg-muted)" }}>
            {status}
          </div>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-3 gap-3">
          <div
            className="col-span-1 space-y-1.5 overflow-y-auto rounded-lg p-2"
            style={{
              backgroundColor: "var(--bg-sidebar)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            {snapshots.length === 0 ? (
              <div className="py-4 text-center text-xs" style={{ color: "var(--fg-muted)" }}>
                No revisions recorded yet.
              </div>
            ) : (
              snapshots.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  className="w-full rounded-md p-2 text-left text-xs transition"
                  style={{
                    backgroundColor:
                      selectedId === s.id ? "var(--bg-surface)" : "transparent",
                    border:
                      selectedId === s.id
                        ? "1px solid var(--accent)"
                        : "1px solid transparent",
                  }}
                >
                  <div className="flex items-center justify-between font-medium">
                    <span className="truncate">
                      {s.isCheckpoint ? `★ ${s.message ?? "Checkpoint"}` : "Auto-save"}
                    </span>
                    <span className="font-mono text-[10px]" style={{ color: "var(--fg-muted)" }}>
                      {s.sha256Hash.slice(0, 7)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px]" style={{ color: "var(--fg-muted)" }}>
                    {s.updatedByName ?? "System"} ·{" "}
                    {new Date(s.updatedAt).toLocaleString()}
                  </div>
                </button>
              ))
            )}
          </div>

          <div
            className="col-span-2 flex min-h-0 flex-col rounded-lg"
            style={{
              backgroundColor: "var(--bg-window)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div
              className="flex items-center justify-between px-3 py-2 text-xs"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}
            >
              <span className="font-medium" style={{ color: "var(--fg-muted)" }}>
                Diff vs Current File
              </span>
              {canEdit && selectedId && (
                <button
                  type="button"
                  onClick={() => handleRestore(selectedId)}
                  className="flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium"
                  style={{
                    backgroundColor: "var(--accent)",
                    color: "var(--accent-fg)",
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Restore This Revision
                </button>
              )}
            </div>
            <pre className="min-h-0 flex-1 overflow-auto p-3 font-mono text-[11px] leading-relaxed">
              {diff.length === 0 ? (
                <span style={{ color: "var(--fg-muted)" }}>
                  Select a revision to inspect changes.
                </span>
              ) : (
                diff.map((d, idx) => (
                  <div
                    key={idx}
                    style={{
                      backgroundColor:
                        d.type === "add"
                          ? "rgba(38, 162, 105, 0.15)"
                          : d.type === "del"
                            ? "rgba(192, 28, 40, 0.15)"
                            : "transparent",
                    }}
                  >
                    <span className="mr-2 select-none opacity-60">
                      {d.type === "add" ? "+" : d.type === "del" ? "-" : " "}
                    </span>
                    {d.line}
                  </div>
                ))
              )}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
