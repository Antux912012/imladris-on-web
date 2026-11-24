// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import type { FastifyInstance } from "fastify";
import type { CommunityPluginEntry } from "@imladris/shared";
import type { AppConfig } from "../config.js";
import type { AppDb } from "../db/client.js";
import { requireAuth } from "../auth/rbac.js";

const BUILTIN_PLUGINS: CommunityPluginEntry[] = [
  {
    id: "word-count-studio",
    name: "Academic Word & Reading-Time Counter",
    version: "1.0.0",
    author: "Imladris Core",
    description:
      "Computes manuscript word count, chunk count, and estimated reading time in a sandboxed Web Worker.",
    entryUrl: "builtin://word-count-studio",
    tags: ["metrics", "manuscript"],
  },
  {
    id: "citation-audit",
    name: "Pandoc Citation Key Auditor",
    version: "1.0.0",
    author: "Imladris Core",
    description:
      "Scans Quarto/Markdown text for @citekey references and reports unique keys.",
    entryUrl: "builtin://citation-audit",
    tags: ["citations", "bibtex"],
  },
  {
    id: "chunk-linter",
    name: "Reproducible Chunk Label Linter",
    version: "1.0.0",
    author: "Imladris Core",
    description:
      "Checks fenced {python}/{r}/{bash} chunks for missing #| label: metadata.",
    entryUrl: "builtin://chunk-linter",
    tags: ["quarto", "reproducibility"],
  },
];

export async function registerPluginRoutes(
  app: FastifyInstance,
  db: AppDb,
  config: AppConfig
): Promise<void> {
  app.get("/api/plugins/registry", async (req, reply) => {
    const user = await requireAuth(req, reply, db, config);
    if (!user) return;
    return reply.send({ plugins: BUILTIN_PLUGINS });
  });
}
