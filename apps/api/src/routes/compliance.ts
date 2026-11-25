// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { AppDb } from "../db/client.js";
import { auditEvents, electronicSignatures, users } from "../db/schema.js";
import { verifyPassword } from "../auth/password.js";
import { requireAdmin, requireWorkspacePermission } from "../auth/rbac.js";
import { recordAuditEvent } from "../audit/logger.js";

const SignDocumentBody = z.object({
  path: z.string().min(1).max(300),
  meaning: z.string().min(2).max(120),
  reason: z.string().max(400).default(""),
  password: z.string().min(1),
});

function resolveSafeDocPath(workspacesRoot: string, workspaceId: string, relPath: string): string {
  const wsRoot = path.resolve(workspacesRoot, workspaceId);
  const resolved = path.resolve(wsRoot, relPath);
  if (!resolved.startsWith(wsRoot + path.sep) && resolved !== wsRoot) {
    throw new Error("Path traversal blocked");
  }
  return resolved;
}

export async function registerComplianceRoutes(
  app: FastifyInstance,
  db: AppDb,
  config: AppConfig
): Promise<void> {
  app.get<{
    Querystring: { action?: string; userId?: string; workspaceId?: string; limit?: string };
  }>("/api/admin/audit", async (req, reply) => {
    const admin = await requireAdmin(req, reply, db, config);
    if (!admin) return;

    const limit = Math.min(Math.max(Number(req.query.limit ?? 100), 1), 500);
    const conditions = [];
    if (req.query.action) conditions.push(eq(auditEvents.action, req.query.action));
    if (req.query.userId) conditions.push(eq(auditEvents.userId, req.query.userId));
    if (req.query.workspaceId) {
      conditions.push(eq(auditEvents.workspaceId, req.query.workspaceId));
    }

    const rows = await db
      .select({
        id: auditEvents.id,
        workspaceId: auditEvents.workspaceId,
        userId: auditEvents.userId,
        userEmail: users.email,
        action: auditEvents.action,
        targetPath: auditEvents.targetPath,
        payloadJson: auditEvents.payloadJson,
        createdAt: auditEvents.createdAt,
      })
      .from(auditEvents)
      .leftJoin(users, eq(auditEvents.userId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(auditEvents.createdAt))
      .limit(limit);

    return reply.send({ events: rows });
  });

  app.get<{ Querystring: { format?: string } }>(
    "/api/admin/audit/export",
    async (req, reply) => {
      const admin = await requireAdmin(req, reply, db, config);
      if (!admin) return;

      const rows = await db
        .select({
          id: auditEvents.id,
          workspaceId: auditEvents.workspaceId,
          userId: auditEvents.userId,
          userEmail: users.email,
          action: auditEvents.action,
          targetPath: auditEvents.targetPath,
          payloadJson: auditEvents.payloadJson,
          createdAt: auditEvents.createdAt,
        })
        .from(auditEvents)
        .leftJoin(users, eq(auditEvents.userId, users.id))
        .orderBy(desc(auditEvents.createdAt))
        .limit(1000);

      if (req.query.format === "csv") {
        const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const header = "id,createdAt,action,userEmail,workspaceId,targetPath,payloadJson";
        const lines = rows.map((r) =>
          [
            escape(r.id),
            escape(new Date(r.createdAt).toISOString()),
            escape(r.action),
            escape(r.userEmail ?? ""),
            escape(r.workspaceId ?? ""),
            escape(r.targetPath ?? ""),
            escape(r.payloadJson),
          ].join(",")
        );
        reply.header("Content-Type", "text/csv; charset=utf-8");
        reply.header(
          "Content-Disposition",
          'attachment; filename="imladris-audit-log.csv"'
        );
        return reply.send([header, ...lines].join("\n"));
      }

      reply.header("Content-Type", "application/json; charset=utf-8");
      reply.header(
        "Content-Disposition",
        'attachment; filename="imladris-audit-log.json"'
      );
      return reply.send({ exportedAt: new Date().toISOString(), events: rows });
    }
  );

  app.get<{ Params: { id: string }; Querystring: { path?: string } }>(
    "/api/workspaces/:id/signatures",
    async (req, reply) => {
      const auth = await requireWorkspacePermission(
        req,
        reply,
        db,
        config,
        req.params.id,
        "read"
      );
      if (!auth) return;

      const conds = [eq(electronicSignatures.workspaceId, req.params.id)];
      if (req.query.path) {
        conds.push(eq(electronicSignatures.relPath, req.query.path));
      }

      const rows = await db
        .select()
        .from(electronicSignatures)
        .where(and(...conds))
        .orderBy(desc(electronicSignatures.signedAt));

      return reply.send({ signatures: rows });
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/workspaces/:id/signatures",
    async (req, reply) => {
      const auth = await requireWorkspacePermission(
        req,
        reply,
        db,
        config,
        req.params.id,
        "read"
      );
      if (!auth) return;

      const parsed = SignDocumentBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid electronic signature payload" });
      }

      // 21 CFR Part 11 §11.200 requires password re-verification at signing time
      const [userRow] = await db
        .select()
        .from(users)
        .where(eq(users.id, auth.user.id))
        .limit(1);
      if (!userRow || !(await verifyPassword(userRow.passwordHash, parsed.data.password))) {
        await recordAuditEvent(db, {
          workspaceId: req.params.id,
          userId: auth.user.id,
          action: "signature_reauth_failed",
          targetPath: parsed.data.path,
        });
        return reply.code(401).send({ error: "Password re-verification failed" });
      }

      let content = "";
      try {
        const absPath = resolveSafeDocPath(
          config.workspacesRoot,
          req.params.id,
          parsed.data.path
        );
        content = await fs.readFile(absPath, "utf8");
      } catch {
        return reply.code(404).send({ error: "Target document not found" });
      }

      const sha256Hash = crypto.createHash("sha256").update(content, "utf8").digest("hex");
      const signedAt = Date.now();
      const signatureHash = crypto
        .createHmac("sha256", config.jwtSecret)
        .update(
          `${req.params.id}|${parsed.data.path}|${auth.user.id}|${parsed.data.meaning}|${sha256Hash}|${signedAt}`
        )
        .digest("hex");

      const id = crypto.randomUUID();
      await db.insert(electronicSignatures).values({
        id,
        workspaceId: req.params.id,
        relPath: parsed.data.path,
        userId: auth.user.id,
        userEmail: auth.user.email,
        userName: auth.user.displayName,
        meaning: parsed.data.meaning.trim(),
        reason: parsed.data.reason.trim(),
        sha256Hash,
        signatureHash,
        signedAt,
      });

      await recordAuditEvent(db, {
        workspaceId: req.params.id,
        userId: auth.user.id,
        action: "document_signed",
        targetPath: parsed.data.path,
        payload: { meaning: parsed.data.meaning, sha256Hash, signatureHash },
      });

      return reply.code(201).send({
        signature: {
          id,
          workspaceId: req.params.id,
          relPath: parsed.data.path,
          userId: auth.user.id,
          userEmail: auth.user.email,
          userName: auth.user.displayName,
          meaning: parsed.data.meaning.trim(),
          reason: parsed.data.reason.trim(),
          sha256Hash,
          signatureHash,
          signedAt,
        },
      });
    }
  );
}
