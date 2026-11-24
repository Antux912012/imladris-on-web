// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { ExportRequestSchema } from "@imladris/shared";
import type { AppConfig } from "../config.js";
import type { AppDb } from "../db/client.js";
import { workspaces } from "../db/schema.js";
import { requireWorkspacePermission } from "../auth/rbac.js";
import { PathTraversalError, resolveSafeWorkspacePath } from "./files.js";

export async function registerExportRoutes(
  app: FastifyInstance,
  db: AppDb,
  config: AppConfig
): Promise<void> {
  app.post("/api/workspaces/:id/export", async (req, reply) => {
    const { id } = req.params as { id: string };
    const auth = await requireWorkspacePermission(req, reply, db, config, id, "export");
    if (!auth) return;

    const parsed = ExportRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid export payload" });
    }

    try {
      resolveSafeWorkspacePath(config.workspacesRoot, id, parsed.data.path);
    } catch (err) {
      if (err instanceof PathTraversalError) {
        return reply.code(400).send({ error: err.message });
      }
    }

    const [ws] = await db
      .select({ kernelMode: workspaces.kernelMode })
      .from(workspaces)
      .where(eq(workspaces.id, id))
      .limit(1);
    const sessionKey =
      ws?.kernelMode === "PERSONAL" ? `${id}:${auth.user.id}` : `${id}:shared`;

    const resp = await fetch(`${config.runnerUrl}/export`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Runner-Secret": config.runnerSharedSecret,
      },
      body: JSON.stringify({
        workspaceId: id,
        sessionKey,
        sourcePath: parsed.data.path,
        format: parsed.data.format,
        includeProvenance: true,
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      return reply.code(502).send({ error: "Export failed", detail });
    }

    return reply.send(await resp.json());
  });

  app.get("/api/workspaces/:id/export/download", async (req, reply) => {
    const { id } = req.params as { id: string };
    const auth = await requireWorkspacePermission(req, reply, db, config, id, "export");
    if (!auth) return;

    const query = req.query as { path?: string };
    if (!query.path) {
      return reply.code(400).send({ error: "Missing path query parameter" });
    }

    try {
      const { targetPath } = resolveSafeWorkspacePath(
        config.workspacesRoot,
        id,
        query.path
      );
      const data = await fs.readFile(targetPath);
      const filename = path.basename(targetPath);
      reply.header("Content-Disposition", `attachment; filename="${filename}"`);
      return reply.send(data);
    } catch (err) {
      if (err instanceof PathTraversalError) {
        return reply.code(400).send({ error: err.message });
      }
      return reply.code(404).send({ error: "Export artifact not found" });
    }
  });
}
