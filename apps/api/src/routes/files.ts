// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import crypto from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import * as Y from "yjs";
import { z } from "zod";
import { fromFilename } from "@imladris/shared";
import type { AppConfig } from "../config.js";
import type { AppDb } from "../db/client.js";
import { auditEvents, documentSnapshots, users } from "../db/schema.js";
import { requireWorkspacePermission } from "../auth/rbac.js";
import { sha256Hex } from "../collab/disk-sync.js";

export class PathTraversalError extends Error {
  constructor(message = "Path traversal detected") {
    super(message);
    this.name = "PathTraversalError";
  }
}

export function resolveSafeWorkspacePath(
  workspacesRoot: string,
  workspaceId: string,
  relPath: string
): { workspaceDir: string; targetPath: string; normalizedRel: string } {
  if (!relPath || relPath.includes("\0") || path.isAbsolute(relPath)) {
    throw new PathTraversalError("Invalid relative path");
  }
  const normalized = path.posix.normalize(relPath.replace(/\\/g, "/"));
  if (
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.startsWith("/")
  ) {
    throw new PathTraversalError("Path escapes workspace root");
  }

  const workspaceDir = path.resolve(workspacesRoot, workspaceId);
  const targetPath = path.resolve(workspaceDir, normalized);
  const relative = path.relative(workspaceDir, targetPath);

  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new PathTraversalError("Resolved path escapes workspace root");
  }

  // Canonicalize existing paths (or nearest existing ancestor) to block symlink escapes
  if (fsSync.existsSync(workspaceDir)) {
    const realRoot = fsSync.realpathSync(workspaceDir);
    let probe = targetPath;
    while (!fsSync.existsSync(probe)) {
      const parent = path.dirname(probe);
      if (parent === probe) break;
      probe = parent;
    }
    if (fsSync.existsSync(probe)) {
      const realProbe = fsSync.realpathSync(probe);
      const realRel = path.relative(realRoot, realProbe);
      if (
        realRel === ".." ||
        realRel.startsWith(`..${path.sep}`) ||
        path.isAbsolute(realRel)
      ) {
        throw new PathTraversalError("Symlink escapes workspace root");
      }
    }
  }

  return { workspaceDir, targetPath, normalizedRel: normalized };
}

export interface FileEntry {
  relPath: string;
  name: string;
  isDir: boolean;
  size: number;
  mtimeMs: number;
  languageId?: string;
}

async function listTree(baseDir: string, currentDir: string): Promise<FileEntry[]> {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  const results: FileEntry[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".imladris-tmp") || entry.name === ".git") continue;
    const full = path.join(currentDir, entry.name);
    const relPath = path.relative(baseDir, full).split(path.sep).join("/");
    const stat = await fs.stat(full);

    if (entry.isDirectory()) {
      results.push({
        relPath,
        name: entry.name,
        isDir: true,
        size: 0,
        mtimeMs: stat.mtimeMs,
      });
      const children = await listTree(baseDir, full);
      results.push(...children);
    } else {
      const profile = fromFilename(entry.name);
      results.push({
        relPath,
        name: entry.name,
        isDir: false,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        languageId: profile.id,
      });
    }
  }

  return results.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

const WriteFileBody = z.object({
  path: z.string().min(1).max(512),
  content: z.string().optional(),
  isDir: z.boolean().optional(),
  renameFrom: z.string().min(1).max(512).optional(),
});

export async function registerFileRoutes(
  app: FastifyInstance,
  db: AppDb,
  config: AppConfig
): Promise<void> {
  app.get("/api/workspaces/:id/files", async (req, reply) => {
    const { id } = req.params as { id: string };
    const auth = await requireWorkspacePermission(req, reply, db, config, id, "read");
    if (!auth) return;

    const wsDir = path.resolve(config.workspacesRoot, id);
    await fs.mkdir(wsDir, { recursive: true });
    const files = await listTree(wsDir, wsDir);
    return reply.send({ files });
  });

  app.get("/api/workspaces/:id/files/content", async (req, reply) => {
    const { id } = req.params as { id: string };
    const auth = await requireWorkspacePermission(req, reply, db, config, id, "read");
    if (!auth) return;

    const query = req.query as { path?: string };
    if (!query.path) {
      return reply.code(400).send({ error: "Missing path query parameter" });
    }

    try {
      const { targetPath, normalizedRel } = resolveSafeWorkspacePath(
        config.workspacesRoot,
        id,
        query.path
      );
      const content = await fs.readFile(targetPath, "utf8");
      return reply.send({
        path: normalizedRel,
        content,
        profile: fromFilename(normalizedRel),
      });
    } catch (err) {
      if (err instanceof PathTraversalError) {
        return reply.code(400).send({ error: err.message });
      }
      return reply.code(404).send({ error: "File not found" });
    }
  });

  app.post("/api/workspaces/:id/files", async (req, reply) => {
    const { id } = req.params as { id: string };
    const auth = await requireWorkspacePermission(req, reply, db, config, id, "edit");
    if (!auth) return;

    const parsed = WriteFileBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid file payload" });
    }

    try {
      const { targetPath, normalizedRel } = resolveSafeWorkspacePath(
        config.workspacesRoot,
        id,
        parsed.data.path
      );

      if (parsed.data.renameFrom) {
        const src = resolveSafeWorkspacePath(
          config.workspacesRoot,
          id,
          parsed.data.renameFrom
        );
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.rename(src.targetPath, targetPath);
      } else if (parsed.data.isDir) {
        await fs.mkdir(targetPath, { recursive: true });
      } else {
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        const tmpPath = `${targetPath}.imladris-tmp-${crypto.randomBytes(4).toString("hex")}`;
        await fs.writeFile(tmpPath, parsed.data.content ?? "", "utf8");
        await fs.rename(tmpPath, targetPath);
      }

      await db.insert(auditEvents).values({
        id: crypto.randomUUID(),
        workspaceId: id,
        userId: auth.user.id,
        action: parsed.data.renameFrom ? "file_renamed" : "file_written",
        targetPath: normalizedRel,
        createdAt: Date.now(),
      });

      return reply.code(201).send({ path: normalizedRel });
    } catch (err) {
      if (err instanceof PathTraversalError) {
        return reply.code(400).send({ error: err.message });
      }
      return reply.code(500).send({ error: "Failed to write file" });
    }
  });

  app.delete("/api/workspaces/:id/files", async (req, reply) => {
    const { id } = req.params as { id: string };
    const auth = await requireWorkspacePermission(req, reply, db, config, id, "edit");
    if (!auth) return;

    const query = req.query as { path?: string };
    if (!query.path) {
      return reply.code(400).send({ error: "Missing path query parameter" });
    }

    try {
      const { targetPath, normalizedRel } = resolveSafeWorkspacePath(
        config.workspacesRoot,
        id,
        query.path
      );
      await fs.rm(targetPath, { recursive: true, force: false });

      await db.insert(auditEvents).values({
        id: crypto.randomUUID(),
        workspaceId: id,
        userId: auth.user.id,
        action: "file_deleted",
        targetPath: normalizedRel,
        createdAt: Date.now(),
      });

      return reply.send({ deleted: normalizedRel });
    } catch (err) {
      if (err instanceof PathTraversalError) {
        return reply.code(400).send({ error: err.message });
      }
      return reply.code(404).send({ error: "File not found" });
    }
  });

  app.get("/api/workspaces/:id/snapshots", async (req, reply) => {
    const { id } = req.params as { id: string };
    const auth = await requireWorkspacePermission(req, reply, db, config, id, "read");
    if (!auth) return;

    const query = req.query as { path?: string };
    if (!query.path) {
      return reply.code(400).send({ error: "Missing path query parameter" });
    }

    try {
      const { normalizedRel } = resolveSafeWorkspacePath(
        config.workspacesRoot,
        id,
        query.path
      );

      const snapshots = await db
        .select({
          id: documentSnapshots.id,
          relPath: documentSnapshots.relPath,
          sha256Hash: documentSnapshots.sha256Hash,
          message: documentSnapshots.message,
          isCheckpoint: documentSnapshots.isCheckpoint,
          updatedBy: documentSnapshots.updatedBy,
          updatedByName: users.displayName,
          updatedAt: documentSnapshots.updatedAt,
        })
        .from(documentSnapshots)
        .leftJoin(users, eq(documentSnapshots.updatedBy, users.id))
        .where(
          and(
            eq(documentSnapshots.workspaceId, id),
            eq(documentSnapshots.relPath, normalizedRel)
          )
        )
        .orderBy(desc(documentSnapshots.updatedAt))
        .limit(100);

      return reply.send({ snapshots });
    } catch (err) {
      if (err instanceof PathTraversalError) {
        return reply.code(400).send({ error: err.message });
      }
      return reply.code(400).send({ error: "Invalid snapshot query" });
    }
  });

  const CreateRevisionBody = z.object({
    path: z.string().min(1).max(512),
    message: z.string().min(1).max(240),
  });

  function decodeSnapshotText(yjsState: Buffer): string {
    const doc = new Y.Doc();
    try {
      Y.applyUpdate(doc, new Uint8Array(yjsState));
      return doc.getText("codemirror").toString();
    } finally {
      doc.destroy();
    }
  }

  function computeLineDiff(
    oldText: string,
    newText: string
  ): Array<{ type: "context" | "add" | "del"; line: string }> {
    const a = oldText.split("\n");
    const b = newText.split("\n");
    const m = a.length;
    const n = b.length;
    // Bound LCS DP for very large files to avoid O(m*n) memory blowup
    if (m * n > 250000) {
      return [
        ...a.map((line) => ({ type: "del" as const, line })),
        ...b.map((line) => ({ type: "add" as const, line })),
      ];
    }
    const dp: number[][] = Array.from({ length: m + 1 }, () =>
      new Array<number>(n + 1).fill(0)
    );
    for (let i = m - 1; i >= 0; i--) {
      for (let j = n - 1; j >= 0; j--) {
        dp[i]![j] =
          a[i] === b[j]
            ? (dp[i + 1]![j + 1] ?? 0) + 1
            : Math.max(dp[i + 1]![j] ?? 0, dp[i]![j + 1] ?? 0);
      }
    }
    const out: Array<{ type: "context" | "add" | "del"; line: string }> = [];
    let i = 0;
    let j = 0;
    while (i < m && j < n) {
      if (a[i] === b[j]) {
        out.push({ type: "context", line: a[i]! });
        i++;
        j++;
      } else if ((dp[i + 1]![j] ?? 0) >= (dp[i]![j + 1] ?? 0)) {
        out.push({ type: "del", line: a[i]! });
        i++;
      } else {
        out.push({ type: "add", line: b[j]! });
        j++;
      }
    }
    while (i < m) out.push({ type: "del", line: a[i++]! });
    while (j < n) out.push({ type: "add", line: b[j++]! });
    return out;
  }

  app.post("/api/workspaces/:id/revisions", async (req, reply) => {
    const { id } = req.params as { id: string };
    const auth = await requireWorkspacePermission(req, reply, db, config, id, "edit");
    if (!auth) return;

    const parsed = CreateRevisionBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid revision payload" });
    }

    try {
      const { targetPath, normalizedRel } = resolveSafeWorkspacePath(
        config.workspacesRoot,
        id,
        parsed.data.path
      );
      const content = await fs.readFile(targetPath, "utf8");
      const hash = sha256Hex(content);
      const doc = new Y.Doc();
      doc.getText("codemirror").insert(0, content);
      const state = Buffer.from(Y.encodeStateAsUpdate(doc));
      doc.destroy();

      const revId = crypto.randomUUID();
      const now = Date.now();
      await db.insert(documentSnapshots).values({
        id: revId,
        workspaceId: id,
        relPath: normalizedRel,
        yjsState: state,
        sha256Hash: hash,
        message: parsed.data.message.trim(),
        isCheckpoint: true,
        updatedBy: auth.user.id,
        updatedAt: now,
      });

      await db.insert(auditEvents).values({
        id: crypto.randomUUID(),
        workspaceId: id,
        userId: auth.user.id,
        action: "revision_created",
        targetPath: normalizedRel,
        payloadJson: JSON.stringify({ revId, message: parsed.data.message.trim() }),
        createdAt: now,
      });

      return reply.code(201).send({
        revision: {
          id: revId,
          relPath: normalizedRel,
          sha256Hash: hash,
          message: parsed.data.message.trim(),
          isCheckpoint: true,
          updatedBy: auth.user.id,
          updatedByName: auth.user.displayName,
          updatedAt: now,
        },
      });
    } catch (err) {
      if (err instanceof PathTraversalError) {
        return reply.code(400).send({ error: err.message });
      }
      return reply.code(404).send({ error: "Document not found" });
    }
  });

  app.get("/api/workspaces/:id/snapshots/:snapshotId", async (req, reply) => {
    const { id, snapshotId } = req.params as { id: string; snapshotId: string };
    const auth = await requireWorkspacePermission(req, reply, db, config, id, "read");
    if (!auth) return;

    const [snap] = await db
      .select()
      .from(documentSnapshots)
      .where(
        and(
          eq(documentSnapshots.id, snapshotId),
          eq(documentSnapshots.workspaceId, id)
        )
      )
      .limit(1);

    if (!snap) {
      return reply.code(404).send({ error: "Snapshot not found" });
    }

    const snapshotContent = decodeSnapshotText(snap.yjsState);
    let currentContent = "";
    try {
      const { targetPath } = resolveSafeWorkspacePath(
        config.workspacesRoot,
        id,
        snap.relPath
      );
      currentContent = await fs.readFile(targetPath, "utf8");
    } catch {
      currentContent = "";
    }

    const diff = computeLineDiff(snapshotContent, currentContent);
    return reply.send({
      snapshot: {
        id: snap.id,
        relPath: snap.relPath,
        sha256Hash: snap.sha256Hash,
        message: snap.message,
        isCheckpoint: snap.isCheckpoint,
        updatedBy: snap.updatedBy,
        updatedAt: snap.updatedAt,
      },
      content: snapshotContent,
      diffAgainstCurrent: diff,
    });
  });

  app.post("/api/workspaces/:id/snapshots/:snapshotId/restore", async (req, reply) => {
    const { id, snapshotId } = req.params as { id: string; snapshotId: string };
    const auth = await requireWorkspacePermission(req, reply, db, config, id, "edit");
    if (!auth) return;

    const [snap] = await db
      .select()
      .from(documentSnapshots)
      .where(
        and(
          eq(documentSnapshots.id, snapshotId),
          eq(documentSnapshots.workspaceId, id)
        )
      )
      .limit(1);

    if (!snap) {
      return reply.code(404).send({ error: "Snapshot not found" });
    }

    try {
      const { targetPath, normalizedRel } = resolveSafeWorkspacePath(
        config.workspacesRoot,
        id,
        snap.relPath
      );
      const restoredContent = decodeSnapshotText(snap.yjsState);
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      const tmpPath = `${targetPath}.imladris-tmp-${crypto.randomBytes(4).toString("hex")}`;
      await fs.writeFile(tmpPath, restoredContent, "utf8");
      await fs.rename(tmpPath, targetPath);

      const now = Date.now();
      const newRevId = crypto.randomUUID();
      await db.insert(documentSnapshots).values({
        id: newRevId,
        workspaceId: id,
        relPath: normalizedRel,
        yjsState: snap.yjsState,
        sha256Hash: snap.sha256Hash,
        message: `Restored from ${snap.id.slice(0, 8)}`,
        isCheckpoint: true,
        updatedBy: auth.user.id,
        updatedAt: now,
      });

      await db.insert(auditEvents).values({
        id: crypto.randomUUID(),
        workspaceId: id,
        userId: auth.user.id,
        action: "snapshot_restored",
        targetPath: normalizedRel,
        payloadJson: JSON.stringify({ restoredFrom: snap.id, newRevId }),
        createdAt: now,
      });

      return reply.send({
        restoredPath: normalizedRel,
        content: restoredContent,
        revisionId: newRevId,
      });
    } catch (err) {
      if (err instanceof PathTraversalError) {
        return reply.code(400).send({ error: err.message });
      }
      return reply.code(500).send({ error: "Failed to restore snapshot" });
    }
  });
}
