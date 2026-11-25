// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { ExecuteRequestSchema, ExecuteResponseSchema } from "@imladris/shared";
import type { AppConfig } from "../config.js";
import type { AppDb } from "../db/client.js";
import { toolchainProfiles, workspaces } from "../db/schema.js";
import { requireWorkspacePermission } from "../auth/rbac.js";
import { recordAuditEvent } from "../audit/logger.js";
import type { WorkspaceEventBus } from "../ws/events.js";

export async function resolveSessionContext(
  db: AppDb,
  workspaceId: string,
  userId: string
): Promise<{ sessionKey: string; isPersonal: boolean; toolchainId: string | null }> {
  const [ws] = await db
    .select({
      kernelMode: workspaces.kernelMode,
      toolchainId: workspaces.toolchainId,
    })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (ws?.kernelMode.toUpperCase() === "PERSONAL") {
    return {
      sessionKey: `${workspaceId}:${userId}`,
      isPersonal: true,
      toolchainId: ws.toolchainId ?? null,
    };
  }
  return {
    sessionKey: `${workspaceId}:shared`,
    isPersonal: false,
    toolchainId: ws?.toolchainId ?? null,
  };
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

    const { sessionKey, isPersonal, toolchainId: wsToolchainId } =
      await resolveSessionContext(db, id, auth.user.id);
    const activeToolchainId = parsed.data.toolchainId ?? wsToolchainId;
    let toolchainImage: string | undefined;
    if (activeToolchainId) {
      const [tc] = await db
        .select({ imageRef: toolchainProfiles.imageRef })
        .from(toolchainProfiles)
        .where(eq(toolchainProfiles.id, activeToolchainId))
        .limit(1);
      toolchainImage = tc?.imageRef;
    }

    let resp: Response;
    try {
      resp = await fetch(`${config.runnerUrl}/execute`, {
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
          ...(activeToolchainId ? { toolchainId: activeToolchainId } : {}),
          ...(toolchainImage ? { toolchainImage } : {}),
        }),
        signal: AbortSignal.timeout(config.runnerExecTimeoutMs + 5000),
      });
    } catch {
      return reply.code(502).send({ error: "Runner service unreachable or timed out" });
    }

    if (!resp.ok) {
      return reply
        .code(502)
        .send({ error: `Runner execution failed (HTTP ${resp.status})` });
    }

    const json = (await resp.json()) as Record<string, unknown>;
    const result = ExecuteResponseSchema.parse({
      ...json,
      engine: parsed.data.engine,
      chunkId: parsed.data.chunkId,
    });
    const envVars = Array.isArray(json.env) ? json.env : [];
    const targetUser = isPersonal ? auth.user.id : undefined;

    if (result.stdout || result.stderr) {
      bus.publish(
        id,
        {
          type: "stdout",
          payload: {
            stdout: result.stdout,
            stderr: result.stderr,
            ok: result.ok,
            userId: auth.user.id,
          },
        },
        targetUser
      );
    }
    if (result.plots.length > 0) {
      bus.publish(id, { type: "plot", payload: { plots: result.plots } }, targetUser);
    }
    bus.publish(id, { type: "env_updated", payload: { variables: envVars } }, targetUser);
    await recordAuditEvent(db, {
      workspaceId: id,
      userId: auth.user.id,
      action: "code_executed",
      payload: {
        engine: parsed.data.engine,
        toolchainId: activeToolchainId ?? "default",
        ok: result.ok,
      },
    });

    return reply.send({ ...result, env: envVars });
  });

  app.post("/api/workspaces/:id/restart-kernel", async (req, reply) => {
    const { id } = req.params as { id: string };
    const auth = await requireWorkspacePermission(req, reply, db, config, id, "execute");
    if (!auth) return;

    const { sessionKey, isPersonal } = await resolveSessionContext(db, id, auth.user.id);
    let resp: Response;
    try {
      resp = await fetch(`${config.runnerUrl}/restart`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Runner-Secret": config.runnerSharedSecret,
        },
        body: JSON.stringify({ sessionKey }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      return reply.code(502).send({ error: "Runner service unreachable" });
    }

    if (!resp.ok) {
      return reply.code(502).send({ error: "Failed to restart kernel" });
    }

    bus.publish(
      id,
      { type: "env_updated", payload: { variables: [] } },
      isPersonal ? auth.user.id : undefined
    );
    return reply.send({ ok: true });
  });

  app.get("/api/workspaces/:id/environment", async (req, reply) => {
    const { id } = req.params as { id: string };
    const auth = await requireWorkspacePermission(req, reply, db, config, id, "read");
    if (!auth) return;

    const { sessionKey } = await resolveSessionContext(db, id, auth.user.id);
    try {
      const resp = await fetch(
        `${config.runnerUrl}/environment?sessionKey=${encodeURIComponent(sessionKey)}`,
        {
          headers: { "X-Runner-Secret": config.runnerSharedSecret },
          signal: AbortSignal.timeout(5000),
        }
      );
      if (!resp.ok) {
        return reply.send({ variables: [] });
      }
      return reply.send(await resp.json());
    } catch {
      return reply.send({ variables: [] });
    }
  });
}
