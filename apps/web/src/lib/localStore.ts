// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import type {
  CommentThread,
  DocumentSnapshotMeta,
  ExportFormat,
  User,
} from "@imladris/shared";
import type { FileTreeItem, WorkspaceWithRole } from "./api";

const STORAGE_KEY = "imladris_web_standalone_v1";

const STARTER_QMD = `---
title: "Reproducible Analysis"
author: "Researcher"
format: html
---

# Introduction

Welcome to **Imladris on Web** running in Browser Standalone Mode.
Edit Markdown, LaTeX math ($E = mc^2$), and code chunks with live preview.

$$
\\hat{\\beta} = (X^{\\top} X)^{-1} X^{\\top} y
$$

\`\`\`{python}
#| label: summary-stats
values = [12.4, 15.1, 14.8, 16.2, 13.9]
print("Mean:", round(sum(values) / len(values), 2))
\`\`\`
`;

const STARTER_BIB = `@article{knuth1984literate,
  title={Literate Programming},
  author={Knuth, Donald E.},
  journal={The Computer Journal},
  volume={27},
  number={2},
  pages={97--111},
  year={1984}
}
`;

interface StoredSnapshot extends DocumentSnapshotMeta {
  content: string;
}

interface StoredWorkspace {
  meta: WorkspaceWithRole;
  files: Record<string, { content: string; isDir: boolean; mtimeMs: number }>;
  snapshots: Record<string, StoredSnapshot[]>;
  comments: Record<string, CommentThread[]>;
}

interface StandaloneDb {
  user: User;
  workspaces: Record<string, StoredWorkspace>;
}

function createDefaultDb(): StandaloneDb {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const wsId = "local-sandbox";
  const user: User = {
    id: "local-browser-user",
    email: "browser@imladris.local",
    displayName: "Local Researcher",
    avatarColor: "#3584e4",
    createdAt: nowIso,
  };
  return {
    user,
    workspaces: {
      [wsId]: {
        meta: {
          id: wsId,
          slug: "research-sandbox",
          name: "Research Sandbox",
          kernelMode: "SHARED",
          ownerId: user.id,
          createdAt: nowIso,
          role: "OWNER",
        },
        files: {
          "main.qmd": { content: STARTER_QMD, isDir: false, mtimeMs: now },
          "references.bib": { content: STARTER_BIB, isDir: false, mtimeMs: now },
        },
        snapshots: {},
        comments: {},
      },
    },
  };
}

function loadDb(): StandaloneDb {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const db = createDefaultDb();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      return db;
    }
    return JSON.parse(raw) as StandaloneDb;
  } catch {
    return createDefaultDb();
  }
}

function saveDb(db: StandaloneDb): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Ignore quota errors
  }
}

async function sha256Hex(text: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const data = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

function computeSimpleDiff(
  oldText: string,
  newText: string
): Array<{ type: "context" | "add" | "del"; line: string }> {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const out: Array<{ type: "context" | "add" | "del"; line: string }> = [];
  const maxLen = Math.max(a.length, b.length);
  for (let i = 0; i < maxLen; i++) {
    if (a[i] === b[i] && a[i] !== undefined) {
      out.push({ type: "context", line: a[i]! });
    } else {
      if (a[i] !== undefined) out.push({ type: "del", line: a[i]! });
      if (b[i] !== undefined) out.push({ type: "add", line: b[i]! });
    }
  }
  return out;
}

export const localStandaloneApi = {
  getUser: (): User => loadDb().user,

  listWorkspaces: (): WorkspaceWithRole[] => {
    const db = loadDb();
    return Object.values(db.workspaces).map((w) => w.meta);
  },

  createWorkspace: (name: string): WorkspaceWithRole => {
    const db = loadDb();
    const id = `local-${Date.now().toString(36)}`;
    const now = Date.now();
    const meta: WorkspaceWithRole = {
      id,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || id,
      name,
      kernelMode: "SHARED",
      ownerId: db.user.id,
      createdAt: new Date(now).toISOString(),
      role: "OWNER",
    };
    db.workspaces[id] = {
      meta,
      files: {
        "main.qmd": { content: STARTER_QMD, isDir: false, mtimeMs: now },
      },
      snapshots: {},
      comments: {},
    };
    saveDb(db);
    return meta;
  },

  listFiles: (workspaceId: string): FileTreeItem[] => {
    const db = loadDb();
    const ws = db.workspaces[workspaceId];
    if (!ws) return [];
    return Object.entries(ws.files)
      .map(([relPath, entry]) => ({
        relPath,
        name: relPath.split("/").pop() ?? relPath,
        isDir: entry.isDir,
        size: entry.content.length,
        mtimeMs: entry.mtimeMs,
      }))
      .sort((a, b) => a.relPath.localeCompare(b.relPath));
  },

  readFile: (workspaceId: string, relPath: string): string => {
    const db = loadDb();
    return db.workspaces[workspaceId]?.files[relPath]?.content ?? "";
  },

  writeFile: (
    workspaceId: string,
    payload: { path: string; content?: string; isDir?: boolean; renameFrom?: string }
  ): void => {
    const db = loadDb();
    const ws = db.workspaces[workspaceId];
    if (!ws) return;
    if (payload.renameFrom && ws.files[payload.renameFrom]) {
      ws.files[payload.path] = {
        ...ws.files[payload.renameFrom]!,
        mtimeMs: Date.now(),
      };
      delete ws.files[payload.renameFrom];
    } else {
      const existing = ws.files[payload.path];
      ws.files[payload.path] = {
        content: payload.content ?? existing?.content ?? "",
        isDir: Boolean(payload.isDir),
        mtimeMs: Date.now(),
      };
    }
    saveDb(db);
  },

  deleteFile: (workspaceId: string, relPath: string): void => {
    const db = loadDb();
    const ws = db.workspaces[workspaceId];
    if (!ws) return;
    delete ws.files[relPath];
    saveDb(db);
  },

  listSnapshots: (workspaceId: string, relPath: string): DocumentSnapshotMeta[] => {
    const db = loadDb();
    const list = db.workspaces[workspaceId]?.snapshots[relPath] ?? [];
    return list.toReversed();
  },

  createRevision: async (
    workspaceId: string,
    relPath: string,
    message: string
  ): Promise<DocumentSnapshotMeta> => {
    const db = loadDb();
    const ws = db.workspaces[workspaceId];
    const content = ws?.files[relPath]?.content ?? "";
    const hash = await sha256Hex(content);
    const snap: StoredSnapshot = {
      id: `rev-${Date.now().toString(36)}`,
      relPath,
      sha256Hash: hash,
      message,
      isCheckpoint: true,
      updatedBy: db.user.id,
      updatedByName: db.user.displayName,
      updatedAt: Date.now(),
      content,
    };
    if (ws) {
      ws.snapshots[relPath] = ws.snapshots[relPath] ?? [];
      ws.snapshots[relPath].push(snap);
      saveDb(db);
    }
    return snap;
  },

  getSnapshotDetail: (workspaceId: string, snapshotId: string) => {
    const db = loadDb();
    const ws = db.workspaces[workspaceId];
    if (!ws) throw new Error("Workspace not found");
    for (const [relPath, snaps] of Object.entries(ws.snapshots)) {
      const found = snaps.find((s) => s.id === snapshotId);
      if (found) {
        const current = ws.files[relPath]?.content ?? "";
        return {
          snapshot: found,
          content: found.content,
          diffAgainstCurrent: computeSimpleDiff(found.content, current),
        };
      }
    }
    throw new Error("Snapshot not found");
  },

  restoreSnapshot: (workspaceId: string, snapshotId: string) => {
    const db = loadDb();
    const ws = db.workspaces[workspaceId];
    if (!ws) throw new Error("Workspace not found");
    for (const [relPath, snaps] of Object.entries(ws.snapshots)) {
      const found = snaps.find((s) => s.id === snapshotId);
      if (found) {
        ws.files[relPath] = {
          content: found.content,
          isDir: false,
          mtimeMs: Date.now(),
        };
        saveDb(db);
        return {
          restoredPath: relPath,
          content: found.content,
          revisionId: found.id,
        };
      }
    }
    throw new Error("Snapshot not found");
  },

  listComments: (workspaceId: string, relPath: string): CommentThread[] => {
    const db = loadDb();
    return db.workspaces[workspaceId]?.comments[relPath] ?? [];
  },

  createComment: (
    workspaceId: string,
    payload: { path: string; anchorLine: number; anchorQuote: string; body: string }
  ): CommentThread => {
    const db = loadDb();
    const ws = db.workspaces[workspaceId];
    const now = Date.now();
    const thread: CommentThread = {
      id: `thr-${now.toString(36)}`,
      workspaceId,
      relPath: payload.path,
      anchorLine: payload.anchorLine,
      anchorQuote: payload.anchorQuote,
      resolved: false,
      createdBy: db.user.id,
      createdByName: db.user.displayName,
      createdAt: now,
      resolvedAt: null,
      messages: [
        {
          id: `msg-${now.toString(36)}`,
          threadId: `thr-${now.toString(36)}`,
          authorId: db.user.id,
          authorName: db.user.displayName,
          authorColor: db.user.avatarColor,
          body: payload.body,
          createdAt: now,
        },
      ],
    };
    if (ws) {
      const list = ws.comments[payload.path] ?? [];
      list.push(thread);
      ws.comments[payload.path] = list;
      saveDb(db);
    }
    return thread;
  },

  downloadExport: (workspaceId: string, relPath: string, format: ExportFormat): void => {
    const content = localStandaloneApi.readFile(workspaceId, relPath);
    const baseName = (relPath.split("/").pop() ?? "document").replace(/\.[^.]+$/, "");
    let outContent = content;
    let mime = "text/plain;charset=utf-8";
    let ext: string = format;
    if (format === "html") {
      mime = "text/html;charset=utf-8";
      outContent = `<!doctype html><html><head><meta charset="utf-8"><title>${baseName}</title></head><body><pre>${content
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")}</pre></body></html>`;
    } else if (format === "latex") {
      ext = "tex";
    }
    const blob = new Blob([outContent], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${baseName}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  },
};
