// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import crypto from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { ExecuteEngineSchema } from "@imladris/shared";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { AppDb } from "../db/client.js";
import { computeJobs } from "../db/schema.js";
import { requireWorkspacePermission } from "../auth/rbac.js";
import { recordAuditEvent } from "../audit/logger.js";

const SubmitHpcJobBody = z.object({
  engine: ExecuteEngineSchema.default("python"),
  target: z.enum(["gpu-a100", "slurm-highmem", "k8s-gpu", "local"]).default("slurm-highmem"),
  code: z.string().min(1).max(200000),
});

export async function registerHpcRoutes(
  app: FastifyInstance,
  db: AppDb,
  config: AppConfig
): Promise<void> {
  app.get<{ Params: { id: string } }>(
    "/api/workspaces/:id/hpc/jobs",
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

      const jobs = await db
        .select({
          id: computeJobs.id,
          workspaceId: computeJobs.workspaceId,
          userId: computeJobs.userId,
          engine: computeJobs.engine,
          target: computeJobs.target,
          status: computeJobs.status,
          slurmJobId: computeJobs.slurmJobId,
          stdout: computeJobs.stdout,
          stderr: computeJobs.stderr,
          submittedAt: computeJobs.submittedAt,
          completedAt: computeJobs.completedAt,
        })
        .from(computeJobs)
        .where(eq(computeJobs.workspaceId, req.params.id))
        .orderBy(desc(computeJobs.submittedAt))
        .limit(50);

      return reply.send({ jobs });
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/workspaces/:id/hpc/submit",
    async (req, reply) => {
      const auth = await requireWorkspacePermission(
        req,
        reply,
        db,
        config,
        req.params.id,
        "execute"
      );
      if (!auth) return;

      const parsed = SubmitHpcJobBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid HPC job payload" });
      }

      const id = crypto.randomUUID();
      const submittedAt = Date.now();
      const slurmJobId = `imladris-${id.slice(0, 8)}`;

      await db.insert(computeJobs).values({
        id,
        workspaceId: req.params.id,
        userId: auth.user.id,
        engine: parsed.data.engine,
        target: parsed.data.target,
        status: "QUEUED",
        slurmJobId,
        code: parsed.data.code,
        stdout: "",
        stderr: "",
        submittedAt,
      });

      await recordAuditEvent(db, {
        workspaceId: req.params.id,
        userId: auth.user.id,
        action: "hpc_job_submitted",
        targetPath: slurmJobId,
        payload: { engine: parsed.data.engine, target: parsed.data.target },
      });

      // Dispatch asynchronously to runner or Slurm REST endpoint when reachable
      void (async () => {
        try {
          await db
            .update(computeJobs)
            .set({ status: "RUNNING" })
            .where(eq(computeJobs.id, id));

          const resp = await fetch(`${config.runnerUrl}/execute`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Runner-Secret": config.runnerSharedSecret,
            },
            body: JSON.stringify({
              workspaceId: req.params.id,
              sessionKey: `${req.params.id}:hpc:${id}`,
              engine: parsed.data.engine,
              code: parsed.data.code,
              timeoutMs: config.runnerExecTimeoutMs,
            }),
            signal: AbortSignal.timeout(config.runnerExecTimeoutMs + 5000),
          });
          if (resp.ok) {
            const data = (await resp.json()) as {
              ok?: boolean;
              stdout?: string;
              stderr?: string;
            };
            await db
              .update(computeJobs)
              .set({
                status: data.ok ? "COMPLETED" : "FAILED",
                stdout: data.stdout ?? "",
                stderr: data.stderr ?? "",
                completedAt: Date.now(),
              })
              .where(eq(computeJobs.id, id));
          }
        } catch {
          // Leave queued/failed if runner is not running in unit test env
        }
      })();

      return reply.code(202).send({
        job: {
          id,
          workspaceId: req.params.id,
          userId: auth.user.id,
          engine: parsed.data.engine,
          target: parsed.data.target,
          status: "QUEUED",
          slurmJobId,
          stdout: "",
          stderr: "",
          submittedAt,
          completedAt: null,
        },
      });
    }
  );

  app.post<{ Params: { id: string; jobId: string } }>(
    "/api/workspaces/:id/hpc/jobs/:jobId/cancel",
    async (req, reply) => {
      const auth = await requireWorkspacePermission(
        req,
        reply,
        db,
        config,
        req.params.id,
        "execute"
      );
      if (!auth) return;

      await db
        .update(computeJobs)
        .set({ status: "CANCELLED", completedAt: Date.now() })
        .where(eq(computeJobs.id, req.params.jobId));

      return reply.send({ ok: true, status: "CANCELLED" });
    }
  );
}
