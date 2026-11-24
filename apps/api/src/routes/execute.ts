// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { ExecuteRequestSchema, ExecuteResponseSchema } from "@imladris/shared";
import type { AppConfig } from "../config.js";
import type { AppDb } from "../db/client.js";
import { workspaces } from "../db/schema.js";
import { requireWorkspacePermission } from "../auth/rbac.js";
import type { WorkspaceEventBus } from "../ws/events.js";

async function resolveSessionKey(
  db: AppDb,
  workspaceId: string,
  userId: string
): Promise<string> {
  const [ws] = await db
    .select({ kernelMode: workspaces.kernelMode })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (ws?.kernelMode === "PERSONAL") {
    return `${workspaceId}:${userId}`;
  }
  return `${workspaceId}:shared`;
}

export async function registerExecuteRoutes(
  app: FastifyInstance,
  db: AppDb,
  config: AppConfig,
  bus: WorkspaceEventBus
): Promise<void> {
  app.post("/api/workspaces/:id/execute", async (req, reply) => {
    const { id } = req.params as { id: string };
    const auth = await requireWorkspacePermission(req, reply, db, config, id, "execute");
    if (!auth) return;

    const parsed = ExecuteRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid execute payload" });
    }

    const sessionKey = await resolveSessionKey(db, id, auth.user.id);
    const resp = await fetch(`${config.runnerUrl}/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Runner-Secret": config.runnerSharedSecret,
      },
      body: JSON.stringify({
        workspaceId: id,
        sessionKey,
        engine: parsed.data.engine,
        code: parsed.data.code,
        timeoutMs: config.runnerExecTimeoutMs,
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      return reply.code(502).send({ error: "Runner execution failed", detail });
    }

    const json = (await resp.json()) as Record<string, unknown>;
    const result = ExecuteResponseSchema.parse({
      ...json,
      engine: parsed.data.engine,
      chunkId: parsed.data.chunkId,
    });
    const envVars = Array.isArray(json.env) ? json.env : [];

    if (result.stdout || result.stderr) {
      bus.publish(id, {
        type: "stdout",
        payload: {
          stdout: result.stdout,
          stderr: result.stderr,
          ok: result.ok,
          userId: auth.user.id,
        },
      });
    }
    if (result.plots.length > 0) {
      bus.publish(id, {
        type: "plot",
        payload: { plots: result.plots },
      });
    }
    bus.publish(id, {
      type: "env_updated",
      payload: { variables: envVars },
    });

    return reply.send({ ...result, env: envVars });
  });

  app.post("/api/workspaces/:id/restart-kernel", async (req, reply) => {
    const { id } = req.params as { id: string };
    const auth = await requireWorkspacePermission(req, reply, db, config, id, "execute");
    if (!auth) return;

    const sessionKey = await resolveSessionKey(db, id, auth.user.id);
    const resp = await fetch(`${config.runnerUrl}/restart`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Runner-Secret": config.runnerSharedSecret,
      },
      body: JSON.stringify({ sessionKey }),
    });

    if (!resp.ok) {
      return reply.code(502).send({ error: "Failed to restart kernel" });
    }

    bus.publish(id, { type: "env_updated", payload: { variables: [] } });
    return reply.send({ ok: true });
  });

  app.get("/api/workspaces/:id/environment", async (req, reply) => {
    const { id } = req.params as { id: string };
    const auth = await requireWorkspacePermission(req, reply, db, config, id, "read");
    if (!auth) return;

    const sessionKey = await resolveSessionKey(db, id, auth.user.id);
    const resp = await fetch(
      `${config.runnerUrl}/environment?sessionKey=${encodeURIComponent(sessionKey)}`,
      {
        headers: {
          "X-Runner-Secret": config.runnerSharedSecret,
        },
      }
    );

    if (!resp.ok) {
      return reply.send({ variables: [] });
    }
    return reply.send(await resp.json());
  });
}
