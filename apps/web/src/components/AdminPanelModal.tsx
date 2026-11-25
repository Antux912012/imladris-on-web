// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { AccessLevel, AdminUserSummary, Role, SystemRole } from "@imladris/shared";
import { KeyRound, Shield, UserCheck, UserPlus, UserX, X } from "lucide-react";
import { api } from "../lib/api";
import { useWorkspaceStore } from "../state/workspaceStore";

interface WorkspaceSummary {
  id: string;
  slug: string;
  name: string;
  ownerId: string;
}

interface UserMembership {
  workspaceId: string;
  name: string;
  slug: string;
  role: Role;
  joinedAt: number;
}

const ACCESS_LEVEL_LABELS: Record<AccessLevel, string> = {
  FULL: "Full Access (Create & Manage)",
  EDITOR: "Editor (Edit & Execute)",
  REVIEWER: "Reviewer (Read, Comment & Export)",
  VIEWER: "Viewer (Read Only)",
};

export function AdminPanelModal() {
  const { user, showAdminModal, setShowAdminModal } = useWorkspaceStore();
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Create user form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newSystemRole, setNewSystemRole] = useState<SystemRole>("USER");
  const [newAccessLevel, setNewAccessLevel] = useState<AccessLevel>("FULL");
  const [newWorkspaceId, setNewWorkspaceId] = useState("");
  const [newWorkspaceRole, setNewWorkspaceRole] = useState<Role>("EDITOR");

  // Workspace membership drawer state
  const [managingUser, setManagingUser] = useState<AdminUserSummary | null>(null);
  const [memberships, setMemberships] = useState<UserMembership[]>([]);
  const [assignWsId, setAssignWsId] = useState("");
  const [assignWsRole, setAssignWsRole] = useState<Role>("EDITOR");

  // Reset password inline state
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPasswordVal, setResetPasswordVal] = useState("");

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.adminListUsers();
      setUsers(res.users);
      setWorkspaces(res.workspaces);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!showAdminModal) return;
    void loadAdminData();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowAdminModal(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showAdminModal, loadAdminData, setShowAdminModal]);

  if (!showAdminModal || user?.systemRole !== "ADMIN") return null;

  async function handleCreateUser(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setStatusMsg(null);
    try {
      await api.adminCreateUser({
        email: newEmail.trim(),
        displayName: newDisplayName.trim(),
        password: newPassword,
        systemRole: newSystemRole,
        accessLevel: newAccessLevel,
        workspaceId: newWorkspaceId || undefined,
        workspaceRole: newWorkspaceId ? newWorkspaceRole : undefined,
      });
      setNewEmail("");
      setNewDisplayName("");
      setNewPassword("");
      setNewSystemRole("USER");
      setNewAccessLevel("FULL");
      setNewWorkspaceId("");
      setShowCreateForm(false);
      setStatusMsg("User created successfully.");
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    }
  }

  async function handleUpdateUser(
    targetUser: AdminUserSummary,
    patch: {
      systemRole?: SystemRole;
      accessLevel?: AccessLevel;
      disabled?: boolean;
      password?: string;
    }
  ) {
    setError(null);
    setStatusMsg(null);
    try {
      await api.adminUpdateUser(targetUser.id, patch);
      setStatusMsg(`Updated ${targetUser.email}.`);
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user");
    }
  }

  async function openWorkspaceAccess(targetUser: AdminUserSummary) {
    setManagingUser(targetUser);
    setError(null);
    try {
      const res = await api.adminGetUserWorkspaces(targetUser.id);
      setMemberships(res.memberships);
      setAssignWsId(workspaces[0]?.id ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load memberships");
    }
  }

  async function handleAssignWorkspace(e: FormEvent) {
    e.preventDefault();
    if (!managingUser || !assignWsId) return;
    setError(null);
    try {
      await api.adminAssignUserWorkspace(managingUser.id, assignWsId, assignWsRole);
      const res = await api.adminGetUserWorkspaces(managingUser.id);
      setMemberships(res.memberships);
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign workspace access");
    }
  }

  async function handleRemoveWorkspace(workspaceId: string) {
    if (!managingUser) return;
    setError(null);
    try {
      await api.adminRemoveUserWorkspace(managingUser.id, workspaceId);
      const res = await api.adminGetUserWorkspaces(managingUser.id);
      setMemberships(res.memberships);
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove workspace access");
    }
  }

  async function handlePasswordReset(targetUser: AdminUserSummary) {
    if (resetPasswordVal.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    await handleUpdateUser(targetUser, { password: resetPasswordVal });
    setResetUserId(null);
    setResetPasswordVal("");
  }

  const filteredUsers = users.filter((u) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      u.email.toLowerCase().includes(q) ||
      u.displayName.toLowerCase().includes(q) ||
      u.systemRole.toLowerCase().includes(q) ||
      u.accessLevel.toLowerCase().includes(q)
    );
  });

  const activeCount = users.filter((u) => !u.disabled).length;
  const disabledCount = users.filter((u) => u.disabled).length;
  const adminCount = users.filter((u) => u.systemRole === "ADMIN").length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      style={{ backdropFilter: "blur(4px)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-panel-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) setShowAdminModal(false);
      }}
    >
      <div
        className="max-h-[90dvh] w-full max-w-5xl overflow-y-auto rounded-xl p-6 shadow-2xl"
        style={{
          backgroundColor: "var(--bg-surface)",
          color: "var(--fg-primary)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Shield className="h-5 w-5" style={{ color: "var(--accent)" }} />
            <div>
              <h2 id="admin-panel-title" className="text-lg font-bold">
                Admin Panel Center
              </h2>
              <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
                Create users, enable or disable accounts, and manage platform and workspace access levels.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowAdminModal(false)}
            aria-label="Close Admin Panel"
            className="ui-hover rounded-lg p-1.5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div
            className="rounded-lg p-3"
            style={{ backgroundColor: "var(--bg-sidebar)", border: "1px solid var(--border-subtle)" }}
          >
            <div className="text-[11px]" style={{ color: "var(--fg-muted)" }}>Total Users</div>
            <div className="mt-0.5 text-lg font-bold">{users.length}</div>
          </div>
          <div
            className="rounded-lg p-3"
            style={{ backgroundColor: "var(--bg-sidebar)", border: "1px solid var(--border-subtle)" }}
          >
            <div className="text-[11px]" style={{ color: "var(--fg-muted)" }}>Active</div>
            <div className="mt-0.5 text-lg font-bold" style={{ color: "var(--success)" }}>{activeCount}</div>
          </div>
          <div
            className="rounded-lg p-3"
            style={{ backgroundColor: "var(--bg-sidebar)", border: "1px solid var(--border-subtle)" }}
          >
            <div className="text-[11px]" style={{ color: "var(--fg-muted)" }}>Disabled</div>
            <div className="mt-0.5 text-lg font-bold" style={{ color: "var(--danger)" }}>{disabledCount}</div>
          </div>
          <div
            className="rounded-lg p-3"
            style={{ backgroundColor: "var(--bg-sidebar)", border: "1px solid var(--border-subtle)" }}
          >
            <div className="text-[11px]" style={{ color: "var(--fg-muted)" }}>Admins / Workspaces</div>
            <div className="mt-0.5 text-lg font-bold">{adminCount} / {workspaces.length}</div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter users by name, email, role, or access..."
            className="w-full max-w-sm rounded-lg px-3 py-1.5 text-xs outline-none"
            style={{
              backgroundColor: "var(--bg-window)",
              border: "1px solid var(--border-subtle)",
            }}
          />
          <button
            type="button"
            onClick={() => setShowCreateForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
            style={{
              backgroundColor: "var(--accent)",
              color: "var(--accent-fg)",
            }}
          >
            <UserPlus className="h-3.5 w-3.5" />
            {showCreateForm ? "Cancel New User" : "Create User"}
          </button>
        </div>

        {error && (
          <div
            className="mt-3 rounded-lg px-3 py-2 text-xs"
            style={{
              backgroundColor: "rgba(192, 28, 40, 0.12)",
              color: "var(--danger)",
              border: "1px solid var(--danger)",
            }}
          >
            {error}
          </div>
        )}

        {statusMsg && (
          <div
            className="mt-3 rounded-lg px-3 py-2 text-xs"
            style={{
              backgroundColor: "rgba(38, 162, 105, 0.12)",
              color: "var(--success)",
              border: "1px solid var(--success)",
            }}
          >
            {statusMsg}
          </div>
        )}

        {showCreateForm && (
          <form
            onSubmit={handleCreateUser}
            className="mt-4 grid gap-3 rounded-xl p-4 sm:grid-cols-2 lg:grid-cols-3"
            style={{
              backgroundColor: "var(--bg-sidebar)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div>
              <label className="mb-1 block text-[11px] font-medium">Email</label>
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="scientist@lab.org"
                className="w-full rounded-md px-2.5 py-1.5 text-xs outline-none"
                style={{ backgroundColor: "var(--bg-window)", border: "1px solid var(--border-subtle)" }}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium">Display Name</label>
              <input
                type="text"
                required
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                placeholder="Dr. Rosalind Franklin"
                className="w-full rounded-md px-2.5 py-1.5 text-xs outline-none"
                style={{ backgroundColor: "var(--bg-window)", border: "1px solid var(--border-subtle)" }}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium">Password (min 8 chars)</label>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-md px-2.5 py-1.5 text-xs outline-none"
                style={{ backgroundColor: "var(--bg-window)", border: "1px solid var(--border-subtle)" }}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium">System Role</label>
              <select
                value={newSystemRole}
                onChange={(e) => setNewSystemRole(e.target.value as SystemRole)}
                className="ui-control w-full rounded-md px-2.5 py-1.5 text-xs"
              >
                <option value="USER">Standard User</option>
                <option value="ADMIN">Administrator</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium">Global Access Level</label>
              <select
                value={newAccessLevel}
                onChange={(e) => setNewAccessLevel(e.target.value as AccessLevel)}
                className="ui-control w-full rounded-md px-2.5 py-1.5 text-xs"
              >
                {(Object.keys(ACCESS_LEVEL_LABELS) as AccessLevel[]).map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {ACCESS_LEVEL_LABELS[lvl]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium">Assign Workspace (optional)</label>
              <div className="flex gap-1.5">
                <select
                  value={newWorkspaceId}
                  onChange={(e) => setNewWorkspaceId(e.target.value)}
                  className="ui-control min-w-0 flex-1 rounded-md px-2 py-1.5 text-xs"
                >
                  <option value="">None</option>
                  {workspaces.map((ws) => (
                    <option key={ws.id} value={ws.id}>
                      {ws.name}
                    </option>
                  ))}
                </select>
                {newWorkspaceId && (
                  <select
                    value={newWorkspaceRole}
                    onChange={(e) => setNewWorkspaceRole(e.target.value as Role)}
                    className="ui-control rounded-md px-2 py-1.5 text-xs"
                  >
                    <option value="OWNER">OWNER</option>
                    <option value="EDITOR">EDITOR</option>
                    <option value="REVIEWER">REVIEWER</option>
                    <option value="VIEWER">VIEWER</option>
                  </select>
                )}
              </div>
            </div>
            <div className="sm:col-span-2 lg:col-span-3 flex justify-end">
              <button
                type="submit"
                className="rounded-md px-4 py-1.5 text-xs font-semibold"
                style={{ backgroundColor: "var(--accent)", color: "var(--accent-fg)" }}
              >
                Save &amp; Create Account
              </button>
            </div>
          </form>
        )}

        <div className="mt-4 overflow-x-auto rounded-xl" style={{ border: "1px solid var(--border-subtle)" }}>
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr style={{ backgroundColor: "var(--bg-sidebar)", borderBottom: "1px solid var(--border-subtle)" }}>
                <th className="px-3 py-2.5 font-semibold">User</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 font-semibold">System Role</th>
                <th className="px-3 py-2.5 font-semibold">Global Access</th>
                <th className="px-3 py-2.5 font-semibold">Workspaces</th>
                <th className="px-3 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center" style={{ color: "var(--fg-muted)" }}>
                    Loading users...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center" style={{ color: "var(--fg-muted)" }}>
                    No users match the current filter.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isSelf = u.id === user?.id;
                  return (
                    <tr
                      key={u.id}
                      style={{ borderBottom: "1px solid var(--border-subtle)" }}
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                            style={{ backgroundColor: u.avatarColor }}
                          >
                            {u.displayName.slice(0, 1).toUpperCase()}
                          </span>
                          <div>
                            <div className="font-semibold">
                              {u.displayName} {isSelf && <span style={{ color: "var(--accent)" }}>(You)</span>}
                            </div>
                            <div className="text-[11px]" style={{ color: "var(--fg-muted)" }}>
                              {u.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={{
                            backgroundColor: u.disabled
                              ? "rgba(192, 28, 40, 0.14)"
                              : "rgba(38, 162, 105, 0.14)",
                            color: u.disabled ? "var(--danger)" : "var(--success)",
                          }}
                        >
                          {u.disabled ? "Disabled" : "Active"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <select
                          aria-label={`System role for ${u.email}`}
                          disabled={isSelf}
                          value={u.systemRole}
                          onChange={(e) =>
                            void handleUpdateUser(u, { systemRole: e.target.value as SystemRole })
                          }
                          className="ui-control rounded px-2 py-1 text-xs disabled:opacity-60"
                        >
                          <option value="USER">USER</option>
                          <option value="ADMIN">ADMIN</option>
                        </select>
                      </td>
                      <td className="px-3 py-2.5">
                        <select
                          aria-label={`Access level for ${u.email}`}
                          value={u.accessLevel}
                          onChange={(e) =>
                            void handleUpdateUser(u, { accessLevel: e.target.value as AccessLevel })
                          }
                          className="ui-control rounded px-2 py-1 text-xs"
                        >
                          <option value="FULL">FULL</option>
                          <option value="EDITOR">EDITOR</option>
                          <option value="REVIEWER">REVIEWER</option>
                          <option value="VIEWER">VIEWER</option>
                        </select>
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => void openWorkspaceAccess(u)}
                          className="ui-control rounded px-2 py-1 text-[11px]"
                        >
                          {u.workspaceCount} workspace{u.workspaceCount === 1 ? "" : "s"}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setResetUserId(resetUserId === u.id ? null : u.id);
                              setResetPasswordVal("");
                            }}
                            title="Reset Password"
                            className="ui-control inline-flex items-center gap-1 rounded px-2 py-1 text-[11px]"
                          >
                            <KeyRound className="h-3 w-3" /> Password
                          </button>
                          <button
                            type="button"
                            disabled={isSelf}
                            onClick={() => void handleUpdateUser(u, { disabled: !u.disabled })}
                            className="ui-control inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] disabled:opacity-50"
                            style={{
                              color: u.disabled ? "var(--success)" : "var(--danger)",
                            }}
                          >
                            {u.disabled ? (
                              <>
                                <UserCheck className="h-3 w-3" /> Enable
                              </>
                            ) : (
                              <>
                                <UserX className="h-3 w-3" /> Disable
                              </>
                            )}
                          </button>
                        </div>
                        {resetUserId === u.id && (
                          <div className="mt-2 flex items-center justify-end gap-1.5">
                            <input
                              type="password"
                              minLength={8}
                              value={resetPasswordVal}
                              onChange={(e) => setResetPasswordVal(e.target.value)}
                              placeholder="New password (8+ chars)"
                              className="w-40 rounded px-2 py-1 text-[11px] outline-none"
                              style={{
                                backgroundColor: "var(--bg-window)",
                                border: "1px solid var(--border-subtle)",
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => void handlePasswordReset(u)}
                              className="rounded px-2 py-1 text-[11px] font-semibold"
                              style={{ backgroundColor: "var(--accent)", color: "var(--accent-fg)" }}
                            >
                              Save
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {managingUser && (
          <div
            className="mt-4 rounded-xl p-4"
            style={{
              backgroundColor: "var(--bg-sidebar)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">
                  Workspace Access — {managingUser.displayName} ({managingUser.email})
                </h3>
                <p className="text-[11px]" style={{ color: "var(--fg-muted)" }}>
                  Grant or revoke per-workspace roles (OWNER, EDITOR, REVIEWER, VIEWER).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setManagingUser(null)}
                className="ui-control rounded px-2.5 py-1 text-xs"
              >
                Done
              </button>
            </div>

            {workspaces.length > 0 && (
              <form onSubmit={handleAssignWorkspace} className="mt-3 flex flex-wrap items-center gap-2">
                <select
                  value={assignWsId}
                  onChange={(e) => setAssignWsId(e.target.value)}
                  className="ui-control rounded px-2.5 py-1.5 text-xs"
                >
                  {workspaces.map((ws) => (
                    <option key={ws.id} value={ws.id}>
                      {ws.name} ({ws.slug})
                    </option>
                  ))}
                </select>
                <select
                  value={assignWsRole}
                  onChange={(e) => setAssignWsRole(e.target.value as Role)}
                  className="ui-control rounded px-2.5 py-1.5 text-xs"
                >
                  <option value="OWNER">OWNER</option>
                  <option value="EDITOR">EDITOR</option>
                  <option value="REVIEWER">REVIEWER</option>
                  <option value="VIEWER">VIEWER</option>
                </select>
                <button
                  type="submit"
                  className="rounded px-3 py-1.5 text-xs font-semibold"
                  style={{ backgroundColor: "var(--accent)", color: "var(--accent-fg)" }}
                >
                  Grant / Update Access
                </button>
              </form>
            )}

            <div className="mt-3 space-y-1.5">
              {memberships.length === 0 ? (
                <div className="text-xs" style={{ color: "var(--fg-muted)" }}>
                  User does not belong to any workspaces yet.
                </div>
              ) : (
                memberships.map((m) => (
                  <div
                    key={m.workspaceId}
                    className="flex items-center justify-between rounded-lg px-3 py-2 text-xs"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <div>
                      <span className="font-semibold">{m.name}</span>{" "}
                      <span className="font-mono text-[11px]" style={{ color: "var(--fg-muted)" }}>
                        ({m.slug})
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: "var(--bg-sidebar)" }}>
                        {m.role}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleRemoveWorkspace(m.workspaceId)}
                        className="ui-control rounded px-2 py-0.5 text-[11px]"
                        style={{ color: "var(--danger)" }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
