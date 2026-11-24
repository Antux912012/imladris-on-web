// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from "react";
import { X, Copy, Check, Trash2 } from "lucide-react";
import type { Role, WorkspaceMember } from "@imladris/shared";
import { api } from "../lib/api";
import { useWorkspaceStore } from "../state/workspaceStore";

export function ShareWorkspaceModal({
  onJoinedWorkspace,
}: {
  onJoinedWorkspace: () => Promise<void>;
}) {
  const { activeWorkspace, showShareModal, setShowShareModal } = useWorkspaceStore();
  const [role, setRole] = useState<Exclude<Role, "OWNER">>("EDITOR");
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [acceptToken, setAcceptToken] = useState("");
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);

  const isOwner = activeWorkspace?.role === "OWNER";

  const loadMembers = useCallback(async () => {
    if (!activeWorkspace || !showShareModal) return;
    try {
      const res = await api.listMembers(activeWorkspace.id);
      setMembers(res.members);
    } catch {
      // Non-fatal if member list fails
    }
  }, [activeWorkspace?.id, showShareModal]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  if (!showShareModal) return null;

  async function handleCreateInvite() {
    if (!activeWorkspace) return;
    setStatus(null);
    try {
      const res = await api.createInvite(activeWorkspace.id, role);
      setGeneratedToken(res.invite.token);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to create invite");
    }
  }

  async function handleAcceptInvite() {
    if (!acceptToken.trim()) return;
    setStatus(null);
    try {
      await api.acceptInvite(acceptToken.trim());
      await onJoinedWorkspace();
      setAcceptToken("");
      setShowShareModal(false);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to accept invite");
    }
  }

  async function handleRoleChange(userId: string, newRole: Exclude<Role, "OWNER">) {
    if (!activeWorkspace) return;
    try {
      await api.updateMemberRole(activeWorkspace.id, userId, newRole);
      await loadMembers();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to update role");
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!activeWorkspace) return;
    try {
      await api.removeMember(activeWorkspace.id, userId);
      await loadMembers();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to remove member");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-lg rounded-xl p-5 shadow-xl"
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Share &amp; Access Management</h2>
          <button
            type="button"
            onClick={() => setShowShareModal(false)}
            className="rounded p-1 hover:opacity-80"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {activeWorkspace && isOwner && (
          <div className="mb-4 space-y-2">
            <div className="text-xs font-medium" style={{ color: "var(--fg-muted)" }}>
              Generate Access Token for {activeWorkspace.name}
            </div>
            <div className="flex gap-2">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Exclude<Role, "OWNER">)}
                className="rounded-lg px-2.5 py-1.5 text-xs"
                style={{
                  backgroundColor: "var(--bg-window)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <option value="EDITOR">EDITOR (Edit &amp; Execute)</option>
                <option value="REVIEWER">REVIEWER (Comment &amp; Export)</option>
                <option value="VIEWER">VIEWER (Read-Only)</option>
              </select>
              <button
                type="button"
                onClick={handleCreateInvite}
                className="rounded-lg px-3 py-1.5 text-xs font-medium"
                style={{ backgroundColor: "var(--accent)", color: "var(--accent-fg)" }}
              >
                Generate Token
              </button>
            </div>
            {generatedToken && (
              <div
                className="flex items-center justify-between rounded-lg px-2.5 py-2 font-mono text-xs"
                style={{
                  backgroundColor: "var(--bg-sidebar)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <span className="truncate">{generatedToken}</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(generatedToken);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                  className="ml-2 shrink-0"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            )}
          </div>
        )}

        {activeWorkspace && members.length > 0 && (
          <div
            className="mb-4 space-y-1.5 pt-3"
            style={{ borderTop: "1px solid var(--border-subtle)" }}
          >
            <div className="text-xs font-medium" style={{ color: "var(--fg-muted)" }}>
              Workspace Members ({members.length})
            </div>
            <div className="max-h-36 space-y-1 overflow-y-auto">
              {members.map((m) => (
                <div
                  key={m.userId}
                  className="flex items-center justify-between rounded px-2 py-1 text-xs"
                  style={{ backgroundColor: "var(--bg-sidebar)" }}
                >
                  <div className="min-w-0 truncate">
                    <span className="font-medium">{m.displayName}</span>{" "}
                    <span className="text-[11px]" style={{ color: "var(--fg-muted)" }}>
                      ({m.email})
                    </span>
                  </div>
                  <div className="ml-2 flex shrink-0 items-center gap-1.5">
                    {m.role === "OWNER" || !isOwner ? (
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold">
                        {m.role}
                      </span>
                    ) : (
                      <>
                        <select
                          value={m.role}
                          onChange={(e) =>
                            handleRoleChange(
                              m.userId,
                              e.target.value as Exclude<Role, "OWNER">
                            )
                          }
                          className="rounded px-1.5 py-0.5 text-[11px]"
                          style={{
                            backgroundColor: "var(--bg-window)",
                            border: "1px solid var(--border-subtle)",
                          }}
                        >
                          <option value="EDITOR">EDITOR</option>
                          <option value="REVIEWER">REVIEWER</option>
                          <option value="VIEWER">VIEWER</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(m.userId)}
                          title="Revoke access"
                          className="rounded p-1 hover:bg-black/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div
          className="space-y-2 pt-3"
          style={{ borderTop: "1px solid var(--border-subtle)" }}
        >
          <div className="text-xs font-medium" style={{ color: "var(--fg-muted)" }}>
            Join Workspace with Invite Token
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={acceptToken}
              onChange={(e) => setAcceptToken(e.target.value)}
              placeholder="Paste invite token..."
              className="flex-1 rounded-lg px-2.5 py-1.5 text-xs outline-none"
              style={{
                backgroundColor: "var(--bg-window)",
                border: "1px solid var(--border-subtle)",
              }}
            />
            <button
              type="button"
              onClick={handleAcceptInvite}
              className="rounded-lg px-3 py-1.5 text-xs font-medium"
              style={{
                backgroundColor: "var(--bg-sidebar)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              Join
            </button>
          </div>
        </div>

        {status && (
          <div className="mt-3 text-xs" style={{ color: "var(--danger)" }}>
            {status}
          </div>
        )}
      </div>
    </div>
  );
}
