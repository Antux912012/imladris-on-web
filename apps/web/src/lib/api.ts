// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import type {
  CommentMessage,
  CommentThread,
  CommunityPluginEntry,
  DocumentSnapshotMeta,
  EnvVariable,
  ExecuteEngine,
  ExecuteResponse,
  ExportFormat,
  Role,
  User,
  Workspace,
  WorkspaceMember,
} from "@imladris/shared";

export interface FileTreeItem {
  relPath: string;
  name: string;
  isDir: boolean;
  size: number;
  mtimeMs: number;
  languageId?: string;
}

export interface WorkspaceWithRole extends Workspace {
  role: Role;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(url, {
    credentials: "include",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error((errBody as { error?: string }).error ?? `HTTP ${resp.status}`);
  }
  return (await resp.json()) as T;
}

export const api = {
  me: () => requestJson<{ user: User; authMode: "local" | "team" }>("/api/auth/me"),
  login: (email: string, password: string) =>
    requestJson<{ user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  register: (
    email: string,
    displayName: string,
    password: string,
    inviteToken?: string
  ) =>
    requestJson<{ user: User }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email,
        displayName,
        password,
        ...(inviteToken ? { inviteToken } : {}),
      }),
    }),
  logout: () => requestJson<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),

  listWorkspaces: () =>
    requestJson<{ workspaces: WorkspaceWithRole[] }>("/api/workspaces"),
  createWorkspace: (name: string) =>
    requestJson<{ workspace: WorkspaceWithRole }>("/api/workspaces", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  createInvite: (workspaceId: string, role: Exclude<Role, "OWNER">) =>
    requestJson<{ invite: { token: string; role: Role; expiresAt: number } }>(
      `/api/workspaces/${workspaceId}/invites`,
      { method: "POST", body: JSON.stringify({ role, maxUses: 10 }) }
    ),
  acceptInvite: (token: string) =>
    requestJson<{ workspaceId: string; role: Role }>(
      `/api/invites/${encodeURIComponent(token)}/accept`,
      { method: "POST" }
    ),
  listMembers: (workspaceId: string) =>
    requestJson<{ members: WorkspaceMember[] }>(
      `/api/workspaces/${workspaceId}/members`
    ),
  updateMemberRole: (
    workspaceId: string,
    userId: string,
    role: Exclude<Role, "OWNER">
  ) =>
    requestJson<{ member: { userId: string; role: Role } }>(
      `/api/workspaces/${workspaceId}/members/${userId}`,
      { method: "PATCH", body: JSON.stringify({ role }) }
    ),
  removeMember: (workspaceId: string, userId: string) =>
    requestJson<{ removedUserId: string }>(
      `/api/workspaces/${workspaceId}/members/${userId}`,
      { method: "DELETE" }
    ),
  listInvites: (workspaceId: string) =>
    requestJson<{
      invites: Array<{
        token: string;
        role: Role;
        expiresAt: number;
        maxUses: number;
        useCount: number;
      }>;
    }>(`/api/workspaces/${workspaceId}/invites`),
  revokeInvite: (workspaceId: string, token: string) =>
    requestJson<{ revoked: string }>(
      `/api/workspaces/${workspaceId}/invites/${encodeURIComponent(token)}`,
      { method: "DELETE" }
    ),

  listSnapshots: (workspaceId: string, relPath: string) =>
    requestJson<{ snapshots: DocumentSnapshotMeta[] }>(
      `/api/workspaces/${workspaceId}/snapshots?path=${encodeURIComponent(relPath)}`
    ),
  createRevision: (workspaceId: string, path: string, message: string) =>
    requestJson<{ revision: DocumentSnapshotMeta }>(
      `/api/workspaces/${workspaceId}/revisions`,
      { method: "POST", body: JSON.stringify({ path, message }) }
    ),
  getSnapshotDetail: (workspaceId: string, snapshotId: string) =>
    requestJson<{
      snapshot: DocumentSnapshotMeta;
      content: string;
      diffAgainstCurrent: Array<{ type: "context" | "add" | "del"; line: string }>;
    }>(`/api/workspaces/${workspaceId}/snapshots/${snapshotId}`),
  restoreSnapshot: (workspaceId: string, snapshotId: string) =>
    requestJson<{ restoredPath: string; content: string; revisionId: string }>(
      `/api/workspaces/${workspaceId}/snapshots/${snapshotId}/restore`,
      { method: "POST" }
    ),

  listComments: (workspaceId: string, relPath: string) =>
    requestJson<{ threads: CommentThread[] }>(
      `/api/workspaces/${workspaceId}/comments?path=${encodeURIComponent(relPath)}`
    ),
  createComment: (
    workspaceId: string,
    payload: { path: string; anchorLine: number; anchorQuote: string; body: string }
  ) =>
    requestJson<{ thread: CommentThread }>(
      `/api/workspaces/${workspaceId}/comments`,
      { method: "POST", body: JSON.stringify(payload) }
    ),
  replyComment: (workspaceId: string, threadId: string, body: string) =>
    requestJson<{ message: CommentMessage }>(
      `/api/workspaces/${workspaceId}/comments/${threadId}/reply`,
      { method: "POST", body: JSON.stringify({ body }) }
    ),
  setCommentResolved: (workspaceId: string, threadId: string, resolved: boolean) =>
    requestJson<{ id: string; resolved: boolean; resolvedAt: number | null }>(
      `/api/workspaces/${workspaceId}/comments/${threadId}`,
      { method: "PATCH", body: JSON.stringify({ resolved }) }
    ),
  deleteComment: (workspaceId: string, threadId: string) =>
    requestJson<{ deleted: string }>(
      `/api/workspaces/${workspaceId}/comments/${threadId}`,
      { method: "DELETE" }
    ),

  listFiles: (workspaceId: string) =>
    requestJson<{ files: FileTreeItem[] }>(`/api/workspaces/${workspaceId}/files`),
  readFile: (workspaceId: string, relPath: string) =>
    requestJson<{ path: string; content: string }>(
      `/api/workspaces/${workspaceId}/files/content?path=${encodeURIComponent(relPath)}`
    ),
  writeFile: (
    workspaceId: string,
    payload: { path: string; content?: string; isDir?: boolean; renameFrom?: string }
  ) =>
    requestJson<{ path: string }>(`/api/workspaces/${workspaceId}/files`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteFile: (workspaceId: string, relPath: string) =>
    requestJson<{ deleted: string }>(
      `/api/workspaces/${workspaceId}/files?path=${encodeURIComponent(relPath)}`,
      { method: "DELETE" }
    ),

  execute: (
    workspaceId: string,
    payload: { engine: ExecuteEngine; code: string; chunkId?: string }
  ) =>
    requestJson<ExecuteResponse & { env?: EnvVariable[] }>(
      `/api/workspaces/${workspaceId}/execute`,
      { method: "POST", body: JSON.stringify(payload) }
    ),
  restartKernel: (workspaceId: string) =>
    requestJson<{ ok: boolean }>(`/api/workspaces/${workspaceId}/restart-kernel`, {
      method: "POST",
    }),
  getEnvironment: (workspaceId: string) =>
    requestJson<{ variables: EnvVariable[] }>(
      `/api/workspaces/${workspaceId}/environment`
    ),

  exportDocument: (workspaceId: string, path: string, format: ExportFormat) =>
    requestJson<{ outputRelPath: string; sizeBytes: number }>(
      `/api/workspaces/${workspaceId}/export`,
      { method: "POST", body: JSON.stringify({ path, format }) }
    ),

  resolveCitation: (id: string) =>
    requestJson<{
      key: string;
      title: string;
      authors: string[];
      year: string;
      bibtex: string;
    }>(`/api/citations/resolve?id=${encodeURIComponent(id)}`),

  chatAi: (
    messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
    provider?: "local" | "cloud",
    model?: string
  ) =>
    requestJson<{ reply: string; provider: string }>("/api/ai/chat", {
      method: "POST",
      body: JSON.stringify({ messages, provider, model }),
    }),

  listPlugins: () =>
    requestJson<{ plugins: CommunityPluginEntry[] }>("/api/plugins/registry"),
};
