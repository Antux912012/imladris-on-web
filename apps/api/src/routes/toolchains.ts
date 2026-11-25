// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { AppDb } from "../db/client.js";
import { toolchainProfiles, workspaces } from "../db/schema.js";
import { requireAdmin, requireAuth, requireWorkspacePermission } from "../auth/rbac.js";
import { recordAuditEvent } from "../audit/logger.js";

const CreateToolchainBody = z.object({
  name: z.string().min(1).max(100),
  language: z.enum(["python", "r", "julia", "quarto"]),
  imageRef: z.string().min(1).max(300),
  packages: z.array(z.string()).default([]),
  isDefault: z.boolean().default(false),
  enabled: z.boolean().default(true),
});

const PatchToolchainBody = CreateToolchainBody.partial();

const PinWorkspaceToolchainBody = z.object({
  toolchainId: z.string().min(1),
});

const DEFAULT_TOOLCHAINS = [
  {
    id: "py-312-sci",
    name: "Python 3.12 + Scientific (NumPy, Pandas, Matplotlib)",
    language: "python",
    imageRef: "ghcr.io/antux912012/imladris-runner-py312:latest",
    packagesJson: JSON.stringify(["python=3.12", "numpy", "pandas", "matplotlib", "scipy"]),
    isDefault: true,
  },
  {
    id: "r-44-bioc",
    name: "R 4.4 + Tidyverse & Bioconductor",
    language: "r",
    imageRef: "ghcr.io/antux912012/imladris-runner-r44:latest",
    packagesJson: JSON.stringify(["r-base=4.4", "tidyverse", "survival", "ggplot2", "BiocManager"]),
    isDefault: false,
  },
  {
    id: "julia-111",
    name: "Julia 1.11 + DataFrames & Plots",
    language: "julia",
    imageRef: "ghcr.io/antux912012/imladris-runner-julia:latest",
    packagesJson: JSON.stringify(["julia=1.11", "DataFrames", "Plots", "CSV"]),
    isDefault: false,
  },
  {
    id: "quarto-texlive",
    name: "Quarto CLI + Pandoc + TeXLive",
    language: "quarto",
    imageRef: "ghcr.io/antux912012/imladris-runner-quarto:latest",
    packagesJson: JSON.stringify(["quarto", "pandoc", "texlive-latex-recommended"]),
    isDefault: false,
  },
];

export async function seedDefaultToolchains(db: AppDb): Promise<void> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(toolchainProfiles);
  if (Number(row?.count ?? 0) > 0) return;

  const now = Date.now();
  for (const tc of DEFAULT_TOOLCHAINS) {
    await db
      .insert(toolchainProfiles)
      .values({
        id: tc.id,
        name: tc.name,
        language: tc.language,
        imageRef: tc.imageRef,
        packagesJson: tc.packagesJson,
        isDefault: tc.isDefault,
        enabled: true,
        createdAt: now,
      })
      .onConflictDoNothing();
  }
}

export async function registerToolchainRoutes(
  app: FastifyInstance,
  db: AppDb,
  config: AppConfig
): Promise<void> {
  app.get("/api/toolchains", async (req, reply) => {
    const user = await requireAuth(req, reply, db, config);
    if (!user) return;

    const rows = await db
      .select()
      .from(toolchainProfiles)
      .where(eq(toolchainProfiles.enabled, true));

    return reply.send({
      toolchains: rows.map((r) => ({
        id: r.id,
        name: r.name,
        language: r.language,
        imageRef: r.imageRef,
        packages: JSON.parse(r.packagesJson || "[]") as string[],
        isDefault: Boolean(r.isDefault),
        enabled: Boolean(r.enabled),
      })),
    });
  });

  app.get("/api/admin/toolchains", async (req, reply) => {
    const admin = await requireAdmin(req, reply, db, config);
    if (!admin) return;
    const rows = await db.select().from(toolchainProfiles);
    return reply.send({
      toolchains: rows.map((r) => ({
        id: r.id,
        name: r.name,
        language: r.language,
        imageRef: r.imageRef,
        packages: JSON.parse(r.packagesJson || "[]") as string[],
        isDefault: Boolean(r.isDefault),
        enabled: Boolean(r.enabled),
      })),
    });
  });

  app.post("/api/admin/toolchains", async (req, reply) => {
    const admin = await requireAdmin(req, reply, db, config);
    if (!admin) return;
    const parsed = CreateToolchainBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid toolchain payload" });
    }
    const id = crypto.randomUUID();
    await db.insert(toolchainProfiles).values({
      id,
      name: parsed.data.name.trim(),
      language: parsed.data.language,
      imageRef: parsed.data.imageRef.trim(),
      packagesJson: JSON.stringify(parsed.data.packages),
      isDefault: parsed.data.isDefault,
      enabled: parsed.data.enabled,
      createdAt: Date.now(),
    });
    await recordAuditEvent(db, {
      userId: admin.id,
      action: "toolchain_registered",
      targetPath: id,
      payload: { name: parsed.data.name, imageRef: parsed.data.imageRef },
    });
    return reply.code(201).send({
      toolchain: {
        id,
        ...parsed.data,
      },
    });
  });

  app.patch<{ Params: { id: string } }>(
    "/api/admin/toolchains/:id",
    async (req, reply) => {
      const admin = await requireAdmin(req, reply, db, config);
      if (!admin) return;
      const parsed = PatchToolchainBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid toolchain update payload" });
      }
      const updates: Record<string, unknown> = {};
      if (parsed.data.name !== undefined) updates.name = parsed.data.name.trim();
      if (parsed.data.language !== undefined) updates.language = parsed.data.language;
      if (parsed.data.imageRef !== undefined) updates.imageRef = parsed.data.imageRef.trim();
      if (parsed.data.packages !== undefined) {
        updates.packagesJson = JSON.stringify(parsed.data.packages);
      }
      if (parsed.data.isDefault !== undefined) updates.isDefault = parsed.data.isDefault;
      if (parsed.data.enabled !== undefined) updates.enabled = parsed.data.enabled;

      if (Object.keys(updates).length > 0) {
        await db
          .update(toolchainProfiles)
          .set(updates)
          .where(eq(toolchainProfiles.id, req.params.id));
      }
      return reply.send({ ok: true });
    }
  );

  app.patch<{ Params: { id: string } }>(
    "/api/workspaces/:id/toolchain",
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

      const parsed = PinWorkspaceToolchainBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid toolchainId" });
      }

      const [tc] = await db
        .select()
        .from(toolchainProfiles)
        .where(eq(toolchainProfiles.id, parsed.data.toolchainId))
        .limit(1);
      if (!tc || !tc.enabled) {
        return reply.code(404).send({ error: "Toolchain profile not found or disabled" });
      }

      await db
        .update(workspaces)
        .set({ toolchainId: tc.id })
        .where(eq(workspaces.id, req.params.id));

      await recordAuditEvent(db, {
        workspaceId: req.params.id,
        userId: auth.user.id,
        action: "toolchain_changed",
        payload: { toolchainId: tc.id, imageRef: tc.imageRef },
      });

      return reply.send({ workspaceId: req.params.id, toolchainId: tc.id });
    }
  );
}
