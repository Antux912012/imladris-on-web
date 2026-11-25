// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { AppDb } from "../db/client.js";
import { commentMessages, commentThreads, reviewLinks, workspaces } from "../db/schema.js";
import { requireWorkspacePermission } from "../auth/rbac.js";
import { recordAuditEvent } from "../audit/logger.js";

const CreateReviewLinkBody = z.object({
  label: z.string().min(1).max(80).default("External Referee"),
  blindAuthors: z.boolean().default(true),
  expiresInHours: z.number().int().min(1).max(720).default(168),
});

const ReviewCommentBody = z.object({
  path: z.string().min(1).max(300),
  anchorLine: z.number().int().min(1).default(1),
  anchorQuote: z.string().max(500).default(""),
  body: z.string().min(1).max(4000),
});

export async function registerReviewRoutes(
  app: FastifyInstance,
  db: AppDb,
  config: AppConfig
): Promise<void> {
  app.get<{ Params: { id: string } }>(
    "/api/workspaces/:id/review-links",
    async (req, reply) => {
      const auth = await requireWorkspacePermission(
        req,
        reply,
        db,
        config,
        req.params.id,
        "manage_invites"
      );
      if (!auth) return;

      const rows = await db
        .select()
        .from(reviewLinks)
        .where(eq(reviewLinks.workspaceId, req.params.id))
        .orderBy(desc(reviewLinks.createdAt));

      return reply.send({
        links: rows.map((r) => ({
          ...r,
          blindAuthors: Boolean(r.blindAuthors),
          revoked: Boolean(r.revoked),
        })),
      });
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/workspaces/:id/review-links",
    async (req, reply) => {
      const auth = await requireWorkspacePermission(
        req,
        reply,
        db,
        config,
        req.params.id,
        "manage_invites"
      );
      if (!auth) return;

      const parsed = CreateReviewLinkBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid review link payload" });
      }

      const token = crypto.randomBytes(24).toString("base64url");
      const createdAt = Date.now();
      const expiresAt = createdAt + parsed.data.expiresInHours * 3600 * 1000;

      await db.insert(reviewLinks).values({
        token,
        workspaceId: req.params.id,
        label: parsed.data.label.trim(),
        blindAuthors: parsed.data.blindAuthors,
        expiresAt,
        revoked: false,
        createdBy: auth.user.id,
        createdAt,
      });

      await recordAuditEvent(db, {
        workspaceId: req.params.id,
        userId: auth.user.id,
        action: "review_link_created",
        payload: { label: parsed.data.label, blindAuthors: parsed.data.blindAuthors },
      });

      return reply.code(201).send({
        link: {
          token,
          workspaceId: req.params.id,
          label: parsed.data.label.trim(),
          blindAuthors: parsed.data.blindAuthors,
          expiresAt,
          revoked: false,
          createdAt,
        },
      });
    }
  );

  app.delete<{ Params: { id: string; token: string } }>(
    "/api/workspaces/:id/review-links/:token",
    async (req, reply) => {
      const auth = await requireWorkspacePermission(
        req,
        reply,
        db,
        config,
        req.params.id,
        "manage_invites"
      );
      if (!auth) return;

      await db
        .update(reviewLinks)
        .set({ revoked: true })
        .where(eq(reviewLinks.token, req.params.token));

      return reply.send({ revoked: true });
    }
  );

  // Public time-limited peer-review endpoint (supports double-blind anonymization)
  app.get<{ Params: { token: string } }>("/api/review/:token", async (req, reply) => {
    const [link] = await db
      .select()
      .from(reviewLinks)
      .where(eq(reviewLinks.token, req.params.token))
      .limit(1);

    if (!link || link.revoked || link.expiresAt < Date.now()) {
      return reply.code(404).send({ error: "Review link is invalid, revoked, or expired" });
    }

    const [ws] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, link.workspaceId))
      .limit(1);
    if (!ws) {
      return reply.code(404).send({ error: "Workspace not found" });
    }

    const wsDir = path.join(config.workspacesRoot, ws.id);
    const files: Array<{ path: string; content: string }> = [];
    try {
      const entries = await fs.readdir(wsDir, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.isFile() && !ent.name.startsWith(".")) {
          const content = await fs.readFile(path.join(wsDir, ent.name), "utf8");
          files.push({
            path: ent.name,
            content: link.blindAuthors
              ? content.replace(/^author:.*$/gim, "author: \"Anonymous (Double-Blind Review)\"")
              : content,
          });
        }
      }
    } catch {
      // Empty workspace
    }

    const threads = await db
      .select()
      .from(commentThreads)
      .where(eq(commentThreads.workspaceId, ws.id))
      .orderBy(desc(commentThreads.createdAt));

    return reply.send({
      workspaceName: link.blindAuthors ? "Anonymized Manuscript" : ws.name,
      label: link.label,
      blindAuthors: Boolean(link.blindAuthors),
      expiresAt: link.expiresAt,
      files,
      threads: threads.map((t) => ({
        ...t,
        resolved: Boolean(t.resolved),
        createdBy: link.blindAuthors ? null : t.createdBy,
      })),
    });
  });

  app.post<{ Params: { token: string } }>(
    "/api/review/:token/comments",
    async (req, reply) => {
      const [link] = await db
        .select()
        .from(reviewLinks)
        .where(eq(reviewLinks.token, req.params.token))
        .limit(1);
      if (!link || link.revoked || link.expiresAt < Date.now()) {
        return reply.code(404).send({ error: "Review link is invalid, revoked, or expired" });
      }

      const parsed = ReviewCommentBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid review comment payload" });
      }

      const threadId = crypto.randomUUID();
      const now = Date.now();
      await db.insert(commentThreads).values({
        id: threadId,
        workspaceId: link.workspaceId,
        relPath: parsed.data.path,
        anchorLine: parsed.data.anchorLine,
        anchorQuote: parsed.data.anchorQuote,
        resolved: false,
        createdBy: null,
        createdAt: now,
      });
      await db.insert(commentMessages).values({
        id: crypto.randomUUID(),
        threadId,
        authorId: null,
        body: `[${link.label}] ${parsed.data.body.trim()}`,
        createdAt: now,
      });

      return reply.code(201).send({ threadId });
    }
  );
}
