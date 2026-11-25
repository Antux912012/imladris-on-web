// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import type {
  AccessLevel,
  AdminUserSummary,
  CommentMessage,
  CommentThread,
  CommunityPluginEntry,
  DocumentSnapshotMeta,
  EnvVariable,
  ExecuteEngine,
  ExecuteResponse,
  ExportFormat,
  Role,
  SystemRole,
  User,
  Workspace,
  WorkspaceMember,
} from "@imladris/shared";
import { localStandaloneApi } from "./localStore";

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

const SERVER_URL_KEY = "imladris_web_server_url";
const STANDALONE_MODE_KEY = "imladris_web_standalone_mode";

export function getConfiguredServerUrl(): string {
  try {
    return localStorage.getItem(SERVER_URL_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setConfiguredServerUrl(url: string): void {
  try {
    const clean = url.trim().replace(/\/+$/, "");
    if (clean) localStorage.setItem(SERVER_URL_KEY, clean);
    else localStorage.removeItem(SERVER_URL_KEY);
  } catch {
    // ignore
  }
}

export function isBrowserStandaloneMode(): boolean {
  try {
    return localStorage.getItem(STANDALONE_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setBrowserStandaloneMode(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(STANDALONE_MODE_KEY, "1");
    else localStorage.removeItem(STANDALONE_MODE_KEY);
  } catch {
    // ignore
  }
}

function resolveApiUrl(path: string): string {
  const base = getConfiguredServerUrl();
  return base ? `${base}${path}` : path;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(resolveApiUrl(url), {
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
  me: async () => {
    if (isBrowserStandaloneMode()) {
      return {
        user: localStandaloneApi.getUser(),
        authMode: "local" as const,
      };
    }
    return requestJson<{ user: User; authMode: "local" | "team" }>("/api/auth/me");
  },

  enterStandaloneMode: async (): Promise<{ user: User }> => {
    setBrowserStandaloneMode(true);
    return { user: localStandaloneApi.getUser() };
  },

  login: (email: string, password: string) => {
    setBrowserStandaloneMode(false);
    return requestJson<{ user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },
  register: (
    email: string,
    displayName: string,
    password: string,
    inviteToken?: string
  ) => {
    setBrowserStandaloneMode(false);
    return requestJson<{ user: User }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email,
        displayName,
        password,
        ...(inviteToken ? { inviteToken } : {}),
      }),
    });
  },
  logout: async () => {
    if (isBrowserStandaloneMode()) {
      setBrowserStandaloneMode(false);
      return { ok: true };
    }
    return requestJson<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
  },

  listWorkspaces: async () => {
    if (isBrowserStandaloneMode()) {
      return { workspaces: localStandaloneApi.listWorkspaces() };
    }
    return requestJson<{ workspaces: WorkspaceWithRole[] }>("/api/workspaces");
  },
  createWorkspace: async (name: string) => {
    if (isBrowserStandaloneMode()) {
      return { workspace: localStandaloneApi.createWorkspace(name) };
    }
    return requestJson<{ workspace: WorkspaceWithRole }>("/api/workspaces", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  },
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
  listMembers: async (workspaceId: string) => {
    if (isBrowserStandaloneMode()) {
      const u = localStandaloneApi.getUser();
      return {
        members: [
          {
            userId: u.id,
            email: u.email,
            displayName: u.displayName,
            avatarColor: u.avatarColor,
            role: "OWNER" as Role,
            joinedAt: Date.now(),
          },
        ] as WorkspaceMember[],
      };
    }
    return requestJson<{ members: WorkspaceMember[] }>(
      `/api/workspaces/${workspaceId}/members`
    );
  },
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
  listInvites: async (workspaceId: string) => {
    if (isBrowserStandaloneMode()) return { invites: [] };
    return requestJson<{
      invites: Array<{
        token: string;
        role: Role;
        expiresAt: number;
        maxUses: number;
        useCount: number;
      }>;
    }>(`/api/workspaces/${workspaceId}/invites`);
  },
  revokeInvite: (workspaceId: string, token: string) =>
    requestJson<{ revoked: string }>(
      `/api/workspaces/${workspaceId}/invites/${encodeURIComponent(token)}`,
      { method: "DELETE" }
    ),

  listSnapshots: async (workspaceId: string, relPath: string) => {
    if (isBrowserStandaloneMode()) {
      return { snapshots: localStandaloneApi.listSnapshots(workspaceId, relPath) };
    }
    return requestJson<{ snapshots: DocumentSnapshotMeta[] }>(
      `/api/workspaces/${workspaceId}/snapshots?path=${encodeURIComponent(relPath)}`
    );
  },
  createRevision: async (workspaceId: string, path: string, message: string) => {
    if (isBrowserStandaloneMode()) {
      return {
        revision: await localStandaloneApi.createRevision(workspaceId, path, message),
      };
    }
    return requestJson<{ revision: DocumentSnapshotMeta }>(
      `/api/workspaces/${workspaceId}/revisions`,
      { method: "POST", body: JSON.stringify({ path, message }) }
    );
  },
  getSnapshotDetail: async (workspaceId: string, snapshotId: string) => {
    if (isBrowserStandaloneMode()) {
      return localStandaloneApi.getSnapshotDetail(workspaceId, snapshotId);
    }
    return requestJson<{
      snapshot: DocumentSnapshotMeta;
      content: string;
      diffAgainstCurrent: Array<{ type: "context" | "add" | "del"; line: string }>;
    }>(`/api/workspaces/${workspaceId}/snapshots/${snapshotId}`);
  },
  restoreSnapshot: async (workspaceId: string, snapshotId: string) => {
    if (isBrowserStandaloneMode()) {
      return localStandaloneApi.restoreSnapshot(workspaceId, snapshotId);
    }
    return requestJson<{ restoredPath: string; content: string; revisionId: string }>(
      `/api/workspaces/${workspaceId}/snapshots/${snapshotId}/restore`,
      { method: "POST" }
    );
  },

  listComments: async (workspaceId: string, relPath: string) => {
    if (isBrowserStandaloneMode()) {
      return { threads: localStandaloneApi.listComments(workspaceId, relPath) };
    }
    return requestJson<{ threads: CommentThread[] }>(
      `/api/workspaces/${workspaceId}/comments?path=${encodeURIComponent(relPath)}`
    );
  },
  createComment: async (
    workspaceId: string,
    payload: { path: string; anchorLine: number; anchorQuote: string; body: string }
  ) => {
    if (isBrowserStandaloneMode()) {
      return { thread: localStandaloneApi.createComment(workspaceId, payload) };
    }
    return requestJson<{ thread: CommentThread }>(
      `/api/workspaces/${workspaceId}/comments`,
      { method: "POST", body: JSON.stringify(payload) }
    );
  },
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

  listFiles: async (workspaceId: string) => {
    if (isBrowserStandaloneMode()) {
      return { files: localStandaloneApi.listFiles(workspaceId) };
    }
    return requestJson<{ files: FileTreeItem[] }>(`/api/workspaces/${workspaceId}/files`);
  },
  readFile: async (workspaceId: string, relPath: string) => {
    if (isBrowserStandaloneMode()) {
      return {
        path: relPath,
        content: localStandaloneApi.readFile(workspaceId, relPath),
      };
    }
    return requestJson<{ path: string; content: string }>(
      `/api/workspaces/${workspaceId}/files/content?path=${encodeURIComponent(relPath)}`
    );
  },
  writeFile: async (
    workspaceId: string,
    payload: { path: string; content?: string; isDir?: boolean; renameFrom?: string }
  ) => {
    if (isBrowserStandaloneMode()) {
      localStandaloneApi.writeFile(workspaceId, payload);
      return { path: payload.path };
    }
    return requestJson<{ path: string }>(`/api/workspaces/${workspaceId}/files`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  deleteFile: async (workspaceId: string, relPath: string) => {
    if (isBrowserStandaloneMode()) {
      localStandaloneApi.deleteFile(workspaceId, relPath);
      return { deleted: relPath };
    }
    return requestJson<{ deleted: string }>(
      `/api/workspaces/${workspaceId}/files?path=${encodeURIComponent(relPath)}`,
      { method: "DELETE" }
    );
  },

  execute: async (
    workspaceId: string,
    payload: { engine: ExecuteEngine; code: string; chunkId?: string }
  ) => {
    if (isBrowserStandaloneMode()) {
      return {
        engine: payload.engine,
        ok: false,
        stdout: "",
        stderr:
          "Server kernel execution is disabled in Browser Standalone Mode. Connect to a self-hosted Imladris on Web server or use Imladris Desktop to run R/Python.",
        plots: [],
        durationMs: 0,
        chunkId: payload.chunkId,
      };
    }
    return requestJson<ExecuteResponse & { env?: EnvVariable[] }>(
      `/api/workspaces/${workspaceId}/execute`,
      { method: "POST", body: JSON.stringify(payload) }
    );
  },
  restartKernel: async (workspaceId: string) => {
    if (isBrowserStandaloneMode()) return { ok: true };
    return requestJson<{ ok: boolean }>(`/api/workspaces/${workspaceId}/restart-kernel`, {
      method: "POST",
    });
  },
  getEnvironment: async (workspaceId: string) => {
    if (isBrowserStandaloneMode()) return { variables: [] };
    return requestJson<{ variables: EnvVariable[] }>(
      `/api/workspaces/${workspaceId}/environment`
    );
  },

  exportDocument: async (workspaceId: string, path: string, format: ExportFormat) => {
    if (isBrowserStandaloneMode()) {
      localStandaloneApi.downloadExport(workspaceId, path, format);
      return { outputRelPath: path, sizeBytes: 0 };
    }
    return requestJson<{ outputRelPath: string; sizeBytes: number }>(
      `/api/workspaces/${workspaceId}/export`,
      { method: "POST", body: JSON.stringify({ path, format }) }
    );
  },

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

  listPlugins: async () => {
    if (isBrowserStandaloneMode()) return { plugins: [] };
    return requestJson<{ plugins: CommunityPluginEntry[] }>("/api/plugins/registry");
  },

  adminListUsers: () =>
    requestJson<{
      users: AdminUserSummary[];
      workspaces: Array<{ id: string; slug: string; name: string; ownerId: string }>;
    }>("/api/admin/users"),
  adminCreateUser: (payload: {
    email: string;
    displayName: string;
    password: string;
    systemRole: SystemRole;
    accessLevel: AccessLevel;
    disabled?: boolean;
    workspaceId?: string;
    workspaceRole?: Role;
  }) =>
    requestJson<{ user: AdminUserSummary }>("/api/admin/users", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  adminUpdateUser: (
    userId: string,
    payload: {
      displayName?: string;
      systemRole?: SystemRole;
      accessLevel?: AccessLevel;
      disabled?: boolean;
      password?: string;
    }
  ) =>
    requestJson<{ user: AdminUserSummary | null }>(`/api/admin/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  adminGetUserWorkspaces: (userId: string) =>
    requestJson<{
      memberships: Array<{
        workspaceId: string;
        name: string;
        slug: string;
        role: Role;
        joinedAt: number;
      }>;
    }>(`/api/admin/users/${userId}/workspaces`),
  adminAssignUserWorkspace: (userId: string, workspaceId: string, role: Role) =>
    requestJson<{ workspaceId: string; userId: string; role: Role }>(
      `/api/admin/users/${userId}/workspaces/${workspaceId}`,
      { method: "PUT", body: JSON.stringify({ role }) }
    ),
  adminRemoveUserWorkspace: (userId: string, workspaceId: string) =>
    requestJson<{ removed: boolean; userId: string; workspaceId: string }>(
      `/api/admin/users/${userId}/workspaces/${workspaceId}`,
      { method: "DELETE" }
    ),
};
