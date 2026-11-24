// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import crypto from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { AppDb } from "../db/client.js";
import {
  auditEvents,
  commentMessages,
  commentThreads,
  users,
} from "../db/schema.js";
import { requireWorkspacePermission } from "../auth/rbac.js";
import type { WorkspaceEventBus } from "../ws/events.js";
import { PathTraversalError, resolveSafeWorkspacePath } from "./files.js";

const CreateThreadBody = z.object({
  path: z.string().min(1).max(512),
  anchorLine: z.number().int().min(1).default(1),
  anchorQuote: z.string().max(400).default(""),
  body: z.string().min(1).max(4000),
});

const ReplyBody = z.object({
  body: z.string().min(1).max(4000),
});

const PatchThreadBody = z.object({
  resolved: z.boolean(),
});

export async function registerCommentRoutes(
  app: FastifyInstance,
  db: AppDb,
  config: AppConfig,
  bus: WorkspaceEventBus
): Promise<void> {
  app.get("/api/workspaces/:id/comments", async (req, reply) => {
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

      const threads = await db
        .select({
          id: commentThreads.id,
          workspaceId: commentThreads.workspaceId,
          relPath: commentThreads.relPath,
          anchorLine: commentThreads.anchorLine,
          anchorQuote: commentThreads.anchorQuote,
          resolved: commentThreads.resolved,
          createdBy: commentThreads.createdBy,
          createdByName: users.displayName,
          createdAt: commentThreads.createdAt,
          resolvedAt: commentThreads.resolvedAt,
        })
        .from(commentThreads)
        .leftJoin(users, eq(commentThreads.createdBy, users.id))
        .where(
          and(
            eq(commentThreads.workspaceId, id),
            eq(commentThreads.relPath, normalizedRel)
          )
        )
        .orderBy(asc(commentThreads.anchorLine), desc(commentThreads.createdAt));

      const enriched = await Promise.all(
        threads.map(async (t) => {
          const msgs = await db
            .select({
              id: commentMessages.id,
              threadId: commentMessages.threadId,
              authorId: commentMessages.authorId,
              authorName: users.displayName,
              authorColor: users.avatarColor,
              body: commentMessages.body,
              createdAt: commentMessages.createdAt,
            })
            .from(commentMessages)
            .leftJoin(users, eq(commentMessages.authorId, users.id))
            .where(eq(commentMessages.threadId, t.id))
            .orderBy(asc(commentMessages.createdAt));

          return {
            ...t,
            createdByName: t.createdByName ?? "Unknown",
            messages: msgs.map((m) => ({
              ...m,
              authorName: m.authorName ?? "Unknown",
              authorColor: m.authorColor ?? "#3584e4",
            })),
          };
        })
      );

      return reply.send({ threads: enriched });
    } catch (err) {
      if (err instanceof PathTraversalError) {
        return reply.code(400).send({ error: err.message });
      }
      return reply.code(400).send({ error: "Invalid comment path" });
    }
  });

  app.post("/api/workspaces/:id/comments", async (req, reply) => {
    const { id } = req.params as { id: string };
    const auth = await requireWorkspacePermission(req, reply, db, config, id, "comment");
    if (!auth) return;

    const parsed = CreateThreadBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid comment payload" });
    }

    try {
      const { normalizedRel } = resolveSafeWorkspacePath(
        config.workspacesRoot,
        id,
        parsed.data.path
      );
      const now = Date.now();
      const threadId = crypto.randomUUID();
      const msgId = crypto.randomUUID();

      await db.insert(commentThreads).values({
        id: threadId,
        workspaceId: id,
        relPath: normalizedRel,
        anchorLine: parsed.data.anchorLine,
        anchorQuote: parsed.data.anchorQuote.trim(),
        resolved: false,
        createdBy: auth.user.id,
        createdAt: now,
        resolvedAt: null,
      });

      await db.insert(commentMessages).values({
        id: msgId,
        threadId,
        authorId: auth.user.id,
        body: parsed.data.body.trim(),
        createdAt: now,
      });

      await db.insert(auditEvents).values({
        id: crypto.randomUUID(),
        workspaceId: id,
        userId: auth.user.id,
        action: "comment_created",
        targetPath: normalizedRel,
        payloadJson: JSON.stringify({ threadId, anchorLine: parsed.data.anchorLine }),
        createdAt: now,
      });

      const thread = {
        id: threadId,
        workspaceId: id,
        relPath: normalizedRel,
        anchorLine: parsed.data.anchorLine,
        anchorQuote: parsed.data.anchorQuote.trim(),
        resolved: false,
        createdBy: auth.user.id,
        createdByName: auth.user.displayName,
        createdAt: now,
        resolvedAt: null,
        messages: [
          {
            id: msgId,
            threadId,
            authorId: auth.user.id,
            authorName: auth.user.displayName,
            authorColor: auth.user.avatarColor,
            body: parsed.data.body.trim(),
            createdAt: now,
          },
        ],
      };

      bus.publish(id, { type: "comment_added", payload: { relPath: normalizedRel, threadId } });
      return reply.code(201).send({ thread });
    } catch (err) {
      if (err instanceof PathTraversalError) {
        return reply.code(400).send({ error: err.message });
      }
      return reply.code(500).send({ error: "Failed to create comment" });
    }
  });

  app.post("/api/workspaces/:id/comments/:threadId/reply", async (req, reply) => {
    const { id, threadId } = req.params as { id: string; threadId: string };
    const auth = await requireWorkspacePermission(req, reply, db, config, id, "comment");
    if (!auth) return;

    const parsed = ReplyBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid reply payload" });
    }

    const [thread] = await db
      .select()
      .from(commentThreads)
      .where(and(eq(commentThreads.id, threadId), eq(commentThreads.workspaceId, id)))
      .limit(1);

    if (!thread) {
      return reply.code(404).send({ error: "Comment thread not found" });
    }

    const now = Date.now();
    const msgId = crypto.randomUUID();
    await db.insert(commentMessages).values({
      id: msgId,
      threadId,
      authorId: auth.user.id,
      body: parsed.data.body.trim(),
      createdAt: now,
    });

    bus.publish(id, { type: "comment_added", payload: { relPath: thread.relPath, threadId } });
    return reply.code(201).send({
      message: {
        id: msgId,
        threadId,
        authorId: auth.user.id,
        authorName: auth.user.displayName,
        authorColor: auth.user.avatarColor,
        body: parsed.data.body.trim(),
        createdAt: now,
      },
    });
  });

  app.patch("/api/workspaces/:id/comments/:threadId", async (req, reply) => {
    const { id, threadId } = req.params as { id: string; threadId: string };
    const auth = await requireWorkspacePermission(req, reply, db, config, id, "comment");
    if (!auth) return;

    const parsed = PatchThreadBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid comment update payload" });
    }

    const [thread] = await db
      .select()
      .from(commentThreads)
      .where(and(eq(commentThreads.id, threadId), eq(commentThreads.workspaceId, id)))
      .limit(1);

    if (!thread) {
      return reply.code(404).send({ error: "Comment thread not found" });
    }

    const resolvedAt = parsed.data.resolved ? Date.now() : null;
    await db
      .update(commentThreads)
      .set({ resolved: parsed.data.resolved, resolvedAt })
      .where(eq(commentThreads.id, threadId));

    bus.publish(id, {
      type: "comment_resolved",
      payload: { relPath: thread.relPath, threadId, resolved: parsed.data.resolved },
    });
    return reply.send({ id: threadId, resolved: parsed.data.resolved, resolvedAt });
  });

  app.delete("/api/workspaces/:id/comments/:threadId", async (req, reply) => {
    const { id, threadId } = req.params as { id: string; threadId: string };
    const auth = await requireWorkspacePermission(req, reply, db, config, id, "comment");
    if (!auth) return;

    const [thread] = await db
      .select()
      .from(commentThreads)
      .where(and(eq(commentThreads.id, threadId), eq(commentThreads.workspaceId, id)))
      .limit(1);

    if (!thread) {
      return reply.code(404).send({ error: "Comment thread not found" });
    }

    if (thread.createdBy !== auth.user.id && auth.role !== "OWNER") {
      return reply.code(403).send({ error: "Only thread author or workspace owner can delete" });
    }

    await db.delete(commentThreads).where(eq(commentThreads.id, threadId));
    bus.publish(id, { type: "comment_resolved", payload: { relPath: thread.relPath, threadId } });
    return reply.send({ deleted: threadId });
  });
}
