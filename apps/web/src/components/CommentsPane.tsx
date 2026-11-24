// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, MessageSquarePlus, RotateCcw, Send, Trash2 } from "lucide-react";
import type { CommentThread } from "@imladris/shared";
import { api } from "../lib/api";
import { useWorkspaceStore } from "../state/workspaceStore";

export function CommentsPane() {
  const { activeWorkspace, activeFilePath, docContent, user } = useWorkspaceStore();
  const [threads, setThreads] = useState<CommentThread[]>([]);
  const [anchorLine, setAnchorLine] = useState(1);
  const [newBody, setNewBody] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  const canComment =
    activeWorkspace?.role === "OWNER" ||
    activeWorkspace?.role === "EDITOR" ||
    activeWorkspace?.role === "REVIEWER";

  const loadComments = useCallback(async () => {
    if (!activeWorkspace || !activeFilePath) {
      setThreads([]);
      return;
    }
    try {
      const res = await api.listComments(activeWorkspace.id, activeFilePath);
      setThreads(res.threads);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load comments");
    }
  }, [activeWorkspace?.id, activeFilePath]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  async function handleCreateThread(e: React.FormEvent) {
    e.preventDefault();
    if (!activeWorkspace || !activeFilePath || !newBody.trim()) return;
    const lines = docContent.split("\n");
    const safeLine = Math.max(1, Math.min(anchorLine, Math.max(1, lines.length)));
    const quote = (lines[safeLine - 1] ?? "").trim().slice(0, 160);
    try {
      await api.createComment(activeWorkspace.id, {
        path: activeFilePath,
        anchorLine: safeLine,
        anchorQuote: quote,
        body: newBody.trim(),
      });
      setNewBody("");
      await loadComments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post comment");
    }
  }

  async function handleReply(threadId: string) {
    if (!activeWorkspace) return;
    const body = (replyDrafts[threadId] ?? "").trim();
    if (!body) return;
    try {
      await api.replyComment(activeWorkspace.id, threadId, body);
      setReplyDrafts((prev) => ({ ...prev, [threadId]: "" }));
      await loadComments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reply");
    }
  }

  async function handleToggleResolve(thread: CommentThread) {
    if (!activeWorkspace) return;
    try {
      await api.setCommentResolved(activeWorkspace.id, thread.id, !thread.resolved);
      await loadComments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update thread");
    }
  }

  async function handleDelete(threadId: string) {
    if (!activeWorkspace) return;
    try {
      await api.deleteComment(activeWorkspace.id, threadId);
      await loadComments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete thread");
    }
  }

  const visibleThreads = threads.filter((t) => showResolved || !t.resolved);

  return (
    <div className="flex h-full flex-col overflow-hidden text-xs">
      <div
        className="flex items-center justify-between px-2.5 py-1.5"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <span className="font-medium" style={{ color: "var(--fg-muted)" }}>
          Article Comments ({threads.filter((t) => !t.resolved).length} open)
        </span>
        <label className="flex cursor-pointer items-center gap-1 text-[11px]">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
          />
          Show resolved
        </label>
      </div>

      {canComment && activeFilePath && (
        <form
          onSubmit={handleCreateThread}
          className="space-y-1.5 p-2"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <div className="flex items-center gap-2">
            <label className="text-[11px]" style={{ color: "var(--fg-muted)" }}>
              Line:
            </label>
            <input
              type="number"
              min={1}
              value={anchorLine}
              onChange={(e) => setAnchorLine(Number.parseInt(e.target.value || "1", 10))}
              className="w-16 rounded px-1.5 py-0.5 text-xs outline-none"
              style={{
                backgroundColor: "var(--bg-window)",
                border: "1px solid var(--border-subtle)",
              }}
            />
            <span className="truncate font-mono text-[10px]" style={{ color: "var(--fg-muted)" }}>
              {activeFilePath}
            </span>
          </div>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              placeholder="Add review comment or suggestion..."
              className="flex-1 rounded px-2 py-1 text-xs outline-none"
              style={{
                backgroundColor: "var(--bg-window)",
                border: "1px solid var(--border-subtle)",
              }}
            />
            <button
              type="submit"
              className="flex items-center gap-1 rounded px-2 py-1 font-medium"
              style={{ backgroundColor: "var(--accent)", color: "var(--accent-fg)" }}
            >
              <MessageSquarePlus className="h-3.5 w-3.5" /> Add
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="px-2.5 py-1 text-[11px]" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      )}

      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {visibleThreads.length === 0 ? (
          <div className="py-4 text-center" style={{ color: "var(--fg-muted)" }}>
            No {showResolved ? "" : "open "}comments on this document.
          </div>
        ) : (
          visibleThreads.map((t) => (
            <div
              key={t.id}
              className="rounded-lg p-2"
              style={{
                backgroundColor: "var(--bg-sidebar)",
                border: "1px solid var(--border-subtle)",
                opacity: t.resolved ? 0.65 : 1,
              }}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="font-mono text-[11px] font-semibold">
                  Line {t.anchorLine}
                </span>
                <div className="flex items-center gap-1">
                  {canComment && (
                    <button
                      type="button"
                      onClick={() => handleToggleResolve(t)}
                      title={t.resolved ? "Reopen" : "Resolve"}
                      className="rounded p-0.5 hover:bg-black/10"
                    >
                      {t.resolved ? (
                        <RotateCcw className="h-3.5 w-3.5" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                  {(user?.id === t.createdBy || activeWorkspace?.role === "OWNER") && (
                    <button
                      type="button"
                      onClick={() => handleDelete(t.id)}
                      title="Delete thread"
                      className="rounded p-0.5 hover:bg-black/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {t.anchorQuote && (
                <div
                  className="mb-1.5 truncate rounded px-1.5 py-0.5 font-mono text-[10px]"
                  style={{
                    backgroundColor: "var(--bg-window)",
                    color: "var(--fg-muted)",
                  }}
                >
                  “{t.anchorQuote}”
                </div>
              )}

              <div className="space-y-1.5">
                {t.messages.map((m) => (
                  <div key={m.id} className="text-[11px]">
                    <span className="font-semibold" style={{ color: m.authorColor }}>
                      {m.authorName}
                    </span>{" "}
                    <span style={{ color: "var(--fg-muted)" }}>
                      ({new Date(m.createdAt).toLocaleTimeString()}):
                    </span>{" "}
                    <span>{m.body}</span>
                  </div>
                ))}
              </div>

              {canComment && !t.resolved && (
                <div className="mt-1.5 flex gap-1">
                  <input
                    type="text"
                    value={replyDrafts[t.id] ?? ""}
                    onChange={(e) =>
                      setReplyDrafts((prev) => ({ ...prev, [t.id]: e.target.value }))
                    }
                    placeholder="Reply..."
                    className="flex-1 rounded px-1.5 py-0.5 text-[11px] outline-none"
                    style={{
                      backgroundColor: "var(--bg-window)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => handleReply(t.id)}
                    className="rounded px-1.5 py-0.5 hover:bg-black/10"
                    title="Send reply"
                  >
                    <Send className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
