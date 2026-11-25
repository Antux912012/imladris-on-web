// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { AppDb } from "../db/client.js";
import { gitRemotes, workspaces } from "../db/schema.js";
import { requireWorkspacePermission } from "../auth/rbac.js";
import { recordAuditEvent } from "../audit/logger.js";

const execFileAsync = promisify(execFile);

const ConfigureGitBody = z.object({
  remoteUrl: z.string().url().max(500),
  branch: z.string().min(1).max(80).default("main"),
});

const SyncGitBody = z.object({
  action: z.enum(["status", "commit", "pull", "push"]).default("commit"),
  message: z.string().min(1).max(200).default("Sync from Imladris on Web"),
});

const DepositArchiveBody = z.object({
  provider: z.enum(["zenodo", "zenodo-sandbox", "dataverse"]).default("zenodo-sandbox"),
  title: z.string().min(1).max(200),
  description: z.string().max(4000).default("Reproducible scientific archive from Imladris on Web"),
  apiToken: z.string().max(300).optional(),
});

async function runGit(cwd: string, args: string[]): Promise<string> {
  const { stdout, stderr } = await execFileAsync("git", args, {
    cwd,
    timeout: 20000,
  });
  return (stdout + (stderr ? `\n${stderr}` : "")).trim();
}

export async function registerGitAndArchiveRoutes(
  app: FastifyInstance,
  db: AppDb,
  config: AppConfig
): Promise<void> {
  app.get<{ Params: { id: string } }>(
    "/api/workspaces/:id/git",
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

      const [remote] = await db
        .select()
        .from(gitRemotes)
        .where(eq(gitRemotes.workspaceId, req.params.id))
        .limit(1);

      const wsDir = path.join(config.workspacesRoot, req.params.id);
      let status = "";
      try {
        status = await runGit(wsDir, ["status", "--short"]);
      } catch {
        status = "Not initialized as Git repository yet.";
      }

      return reply.send({ remote: remote ?? null, status });
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/workspaces/:id/git/config",
    async (req, reply) => {
      const auth = await requireWorkspacePermission(
        req,
        reply,
        db,
        config,
        req.params.id,
        "edit"
      );
      if (!auth) return;

      const parsed = ConfigureGitBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid Git remote configuration" });
      }

      const wsDir = path.join(config.workspacesRoot, req.params.id);
      await fs.mkdir(wsDir, { recursive: true });
      try {
        await runGit(wsDir, ["rev-parse", "--is-inside-work-tree"]);
      } catch {
        await runGit(wsDir, ["init", "-b", parsed.data.branch]);
      }

      try {
        await runGit(wsDir, ["remote", "set-url", "origin", parsed.data.remoteUrl]);
      } catch {
        await runGit(wsDir, ["remote", "add", "origin", parsed.data.remoteUrl]);
      }

      await db
        .insert(gitRemotes)
        .values({
          workspaceId: req.params.id,
          remoteUrl: parsed.data.remoteUrl,
          branch: parsed.data.branch,
        })
        .onConflictDoUpdate({
          target: gitRemotes.workspaceId,
          set: { remoteUrl: parsed.data.remoteUrl, branch: parsed.data.branch },
        });

      return reply.send({ ok: true, remoteUrl: parsed.data.remoteUrl, branch: parsed.data.branch });
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/workspaces/:id/git/sync",
    async (req, reply) => {
      const auth = await requireWorkspacePermission(
        req,
        reply,
        db,
        config,
        req.params.id,
        "edit"
      );
      if (!auth) return;

      const parsed = SyncGitBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid Git sync payload" });
      }

      const wsDir = path.join(config.workspacesRoot, req.params.id);
      await fs.mkdir(wsDir, { recursive: true });

      try {
        await runGit(wsDir, ["rev-parse", "--is-inside-work-tree"]);
      } catch {
        await runGit(wsDir, ["init", "-b", "main"]);
      }

      let output = "";
      let commitHash: string | null = null;
      if (parsed.data.action === "status") {
        output = await runGit(wsDir, ["status", "--short"]);
      } else if (parsed.data.action === "commit") {
        await runGit(wsDir, ["add", "-A"]);
        try {
          output = await runGit(wsDir, [
            "-c",
            `user.name=${auth.user.displayName}`,
            "-c",
            `user.email=${auth.user.email}`,
            "commit",
            "-m",
            parsed.data.message,
          ]);
        } catch (err) {
          output = err instanceof Error ? err.message : "Nothing to commit";
        }
        try {
          commitHash = await runGit(wsDir, ["rev-parse", "--short", "HEAD"]);
        } catch {
          commitHash = null;
        }
      } else if (parsed.data.action === "pull") {
        output = await runGit(wsDir, ["pull", "--rebase"]);
      } else if (parsed.data.action === "push") {
        output = await runGit(wsDir, ["push", "-u", "origin", "HEAD"]);
      }

      await db
        .update(gitRemotes)
        .set({
          lastSyncedAt: Date.now(),
          ...(commitHash ? { lastCommitHash: commitHash } : {}),
        })
        .where(eq(gitRemotes.workspaceId, req.params.id));

      await recordAuditEvent(db, {
        workspaceId: req.params.id,
        userId: auth.user.id,
        action: `git_${parsed.data.action}`,
        payload: { commitHash, message: parsed.data.message },
      });

      return reply.send({ ok: true, output, commitHash });
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/workspaces/:id/archive/deposit",
    async (req, reply) => {
      const auth = await requireWorkspacePermission(
        req,
        reply,
        db,
        config,
        req.params.id,
        "export"
      );
      if (!auth) return;

      const parsed = DepositArchiveBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid archive deposit payload" });
      }

      const [ws] = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, req.params.id))
        .limit(1);

      const wsDir = path.join(config.workspacesRoot, req.params.id);
      const manifestFiles: Array<{ path: string; sha256: string; bytes: number }> = [];
      try {
        const entries = await fs.readdir(wsDir, { withFileTypes: true });
        for (const ent of entries) {
          if (ent.isFile()) {
            const buf = await fs.readFile(path.join(wsDir, ent.name));
            manifestFiles.push({
              path: ent.name,
              sha256: crypto.createHash("sha256").update(buf).digest("hex"),
              bytes: buf.byteLength,
            });
          }
        }
      } catch {
        // Empty workspace
      }

      const bundle = {
        schema: "imladris-mallorn-deposit/v1",
        provider: parsed.data.provider,
        workspace: ws?.name ?? req.params.id,
        title: parsed.data.title.trim(),
        description: parsed.data.description.trim(),
        creator: { name: auth.user.displayName, email: auth.user.email },
        createdAt: new Date().toISOString(),
        files: manifestFiles,
      };

      const archiveFileName = `archive-${Date.now()}.mallorn.json`;
      await fs.writeFile(
        path.join(wsDir, archiveFileName),
        JSON.stringify(bundle, null, 2),
        "utf8"
      );

      let depositId: string | null = null;
      let doiUrl: string | null = null;
      if (
        !config.airGappedMode &&
        parsed.data.apiToken &&
        (parsed.data.provider === "zenodo" || parsed.data.provider === "zenodo-sandbox")
      ) {
        const host =
          parsed.data.provider === "zenodo"
            ? "https://zenodo.org"
            : "https://sandbox.zenodo.org";
        const resp = await fetch(`${host}/api/deposit/depositions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${parsed.data.apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            metadata: {
              title: parsed.data.title.trim(),
              upload_type: "publication",
              publication_type: "article",
              description: parsed.data.description.trim(),
              creators: [{ name: auth.user.displayName }],
            },
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (resp.ok) {
          const data = (await resp.json()) as {
            id?: number;
            metadata?: { prereserve_doi?: { doi?: string } };
          };
          depositId = data.id ? String(data.id) : null;
          doiUrl = data.metadata?.prereserve_doi?.doi
            ? `https://doi.org/${data.metadata.prereserve_doi.doi}`
            : null;
        }
      }

      await recordAuditEvent(db, {
        workspaceId: req.params.id,
        userId: auth.user.id,
        action: "archive_deposited",
        targetPath: archiveFileName,
        payload: { provider: parsed.data.provider, depositId, doiUrl },
      });

      return reply.code(201).send({
        archiveFileName,
        depositId,
        doiUrl,
        fileCount: manifestFiles.length,
      });
    }
  );
}
