// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { AppDb } from "../db/client.js";
import {
  institutionalTemplates,
  workspaceMembers,
  workspaces,
  zoteroLibraries,
} from "../db/schema.js";
import { requireAdmin, requireAuth } from "../auth/rbac.js";

const CreateTemplateBody = z.object({
  name: z.string().min(1).max(120),
  category: z.string().min(1).max(60),
  description: z.string().max(500).default(""),
  files: z.array(z.object({ path: z.string().min(1), content: z.string() })).min(1),
});

const SyncZoteroBody = z.object({
  name: z.string().min(1).max(120),
  groupId: z.string().min(1).max(64),
  apiKey: z.string().max(200).optional(),
  bibtexFallback: z.string().max(100000).optional(),
});

const BUILTIN_TEMPLATES = [
  {
    id: "tpl-journal-quarto",
    name: "Peer-Reviewed Journal Manuscript (Quarto)",
    category: "Journal",
    description: "IMRaD scientific paper template with BibTeX citations and reproducible Python/R figures.",
    files: [
      {
        path: "main.qmd",
        content: "---\ntitle: \"Title of Research Manuscript\"\nauthor: \"Research Team\"\nbibliography: references.bib\nformat: html\n---\n\n## Abstract\n\nConcise summary of background, methods, and findings.\n\n## Methods & Analysis\n\n```{python}\nprint('Reproducible pipeline ready')\n```\n",
      },
      {
        path: "references.bib",
        content: "@article{smith2026,\n  title={Reproducible Computational Workflows},\n  author={Smith, J.},\n  journal={Journal of Open Science},\n  year={2026}\n}\n",
      },
    ],
  },
  {
    id: "tpl-ich-e9-sap",
    name: "ICH E9 Clinical Biostatistics SAP",
    category: "Biostatistics ICH E9",
    description: "Regulated Statistical Analysis Plan template with survival and power chunk scaffolding.",
    files: [
      {
        path: "sap.qmd",
        content: "---\ntitle: \"ICH E9 Statistical Analysis Plan\"\nformat: html\n---\n\n## 1. Study Objectives & Estimands\n\nPrimary endpoint power and survival analysis specification.\n\n```{r}\n# Power & Survival scaffold\nalpha <- 0.05\npower <- 0.90\ncat('Alpha:', alpha, 'Target Power:', power)\n```\n",
      },
    ],
  },
  {
    id: "tpl-university-thesis",
    name: "University Thesis & Dissertation",
    category: "Thesis",
    description: "Multi-chapter academic thesis template with LaTeX math and figure cross-references.",
    files: [
      {
        path: "thesis.qmd",
        content: "---\ntitle: \"Doctoral Dissertation\"\nformat: pdf\n---\n\n# Chapter 1: Introduction\n\n$$\n\\hat{\\theta} = \\arg\\max_{\\theta} \\mathcal{L}(\\theta; X)\n$$\n",
      },
    ],
  },
];

export async function seedDefaultTemplates(db: AppDb): Promise<void> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(institutionalTemplates);
  if (Number(row?.count ?? 0) > 0) return;

  const now = Date.now();
  for (const tpl of BUILTIN_TEMPLATES) {
    await db
      .insert(institutionalTemplates)
      .values({
        id: tpl.id,
        name: tpl.name,
        category: tpl.category,
        description: tpl.description,
        filesJson: JSON.stringify(tpl.files),
        createdAt: now,
      })
      .onConflictDoNothing();
  }
}

export async function registerHubRoutes(
  app: FastifyInstance,
  db: AppDb,
  config: AppConfig
): Promise<void> {
  app.get("/api/hub/templates", async (req, reply) => {
    const user = await requireAuth(req, reply, db, config);
    if (!user) return;
    const rows = await db
      .select()
      .from(institutionalTemplates)
      .orderBy(desc(institutionalTemplates.createdAt));

    return reply.send({
      templates: rows.map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        description: r.description,
        files: JSON.parse(r.filesJson || "[]") as Array<{ path: string; content: string }>,
      })),
    });
  });

  app.post("/api/hub/templates", async (req, reply) => {
    const admin = await requireAdmin(req, reply, db, config);
    if (!admin) return;
    const parsed = CreateTemplateBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid template payload" });
    }
    const id = crypto.randomUUID();
    await db.insert(institutionalTemplates).values({
      id,
      name: parsed.data.name.trim(),
      category: parsed.data.category.trim(),
      description: parsed.data.description.trim(),
      filesJson: JSON.stringify(parsed.data.files),
      createdBy: admin.id,
      createdAt: Date.now(),
    });
    return reply.code(201).send({ id, ...parsed.data });
  });

  app.post<{ Params: { id: string }; Body: { name?: string } }>(
    "/api/hub/templates/:id/instantiate",
    async (req, reply) => {
      const user = await requireAuth(req, reply, db, config);
      if (!user) return;
      if (user.systemRole !== "ADMIN" && user.accessLevel !== "FULL") {
        return reply.code(403).send({ error: "Insufficient access level to create workspaces" });
      }

      const [tpl] = await db
        .select()
        .from(institutionalTemplates)
        .where(eq(institutionalTemplates.id, req.params.id))
        .limit(1);
      if (!tpl) {
        return reply.code(404).send({ error: "Template not found" });
      }

      const wsId = crypto.randomUUID();
      const wsName = req.body?.name?.trim() || tpl.name;
      const slug = `${wsName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 32)}-${crypto.randomBytes(3).toString("hex")}`;
      const now = Date.now();

      const wsDir = path.join(config.workspacesRoot, wsId);
      await fs.mkdir(wsDir, { recursive: true });
      const files = JSON.parse(tpl.filesJson || "[]") as Array<{ path: string; content: string }>;
      for (const f of files) {
        const safePath = path.resolve(wsDir, f.path);
        if (safePath.startsWith(wsDir + path.sep)) {
          await fs.mkdir(path.dirname(safePath), { recursive: true });
          await fs.writeFile(safePath, f.content, "utf8");
        }
      }

      await db.insert(workspaces).values({
        id: wsId,
        slug,
        name: wsName,
        kernelMode: "SHARED",
        ownerId: user.id,
        createdAt: now,
      });
      await db.insert(workspaceMembers).values({
        workspaceId: wsId,
        userId: user.id,
        role: "OWNER",
        joinedAt: now,
      });

      return reply.code(201).send({
        workspace: {
          id: wsId,
          slug,
          name: wsName,
          kernelMode: "SHARED",
          ownerId: user.id,
          role: "OWNER",
          createdAt: now,
        },
      });
    }
  );

  app.get("/api/hub/zotero", async (req, reply) => {
    const user = await requireAuth(req, reply, db, config);
    if (!user) return;
    const rows = await db
      .select()
      .from(zoteroLibraries)
      .orderBy(desc(zoteroLibraries.syncedAt));
    return reply.send({ libraries: rows });
  });

  app.post("/api/hub/zotero/sync", async (req, reply) => {
    const user = await requireAuth(req, reply, db, config);
    if (!user) return;
    const parsed = SyncZoteroBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid Zotero sync payload" });
    }

    let bibtex = parsed.data.bibtexFallback ?? "";
    if (!config.airGappedMode && !bibtex) {
      try {
        const url = `https://api.zotero.org/groups/${encodeURIComponent(parsed.data.groupId)}/items?format=bibtex&limit=100`;
        const resp = await fetch(url, {
          headers: parsed.data.apiKey
            ? { "Zotero-API-Key": parsed.data.apiKey }
            : {},
          signal: AbortSignal.timeout(8000),
        });
        if (resp.ok) {
          bibtex = await resp.text();
        }
      } catch {
        // Keep empty or fallback
      }
    }

    const id = crypto.randomUUID();
    const syncedAt = Date.now();
    await db.insert(zoteroLibraries).values({
      id,
      name: parsed.data.name.trim(),
      groupId: parsed.data.groupId.trim(),
      bibtexCache: bibtex,
      syncedAt,
    });

    return reply.code(201).send({
      library: {
        id,
        name: parsed.data.name.trim(),
        groupId: parsed.data.groupId.trim(),
        bibtexCache: bibtex,
        syncedAt,
      },
    });
  });
}
