// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { AppDb } from "../db/client.js";
import { requireAuth } from "../auth/rbac.js";

function sanitizeBibKey(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || "ref";
}

export async function registerCitationRoutes(
  app: FastifyInstance,
  db: AppDb,
  config: AppConfig
): Promise<void> {
  app.get("/api/citations/resolve", async (req, reply) => {
    const user = await requireAuth(req, reply, db, config);
    if (!user) return;

    if (config.airGappedMode) {
      return reply.code(403).send({
        error: "External DOI/arXiv lookups are disabled in AIR_GAPPED_MODE",
      });
    }

    const query = req.query as { id?: string };
    const rawId = query.id?.trim();
    if (!rawId) {
      return reply.code(400).send({ error: "Missing ?id= parameter (DOI or arXiv ID)" });
    }

    const cleaned = rawId.replace(/^doi:/i, "").replace(/^arxiv:/i, "").trim();
    const isArxiv = /^\d{4}\.\d{4,5}(v\d+)?$/i.test(cleaned) || /^[a-z-]+\/\d{7}$/i.test(cleaned);

    if (isArxiv) {
      const resp = await fetch(
        `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(cleaned)}`
      );
      if (!resp.ok) {
        return reply.code(502).send({ error: "arXiv lookup failed" });
      }
      const xml = await resp.text();
      const titleMatch = xml.match(/<entry>[\s\S]*?<title>([\s\S]*?)<\/title>/);
      const publishedMatch = xml.match(/<published>(\d{4})/);
      const authorMatches = [...xml.matchAll(/<author>\s*<name>([^<]+)<\/name>/g)].map(
        (m) => m[1] ?? ""
      );
      if (!titleMatch) {
        return reply.code(404).send({ error: "arXiv entry not found" });
      }
      const title = (titleMatch[1] ?? "").replace(/\s+/g, " ").trim();
      const year = publishedMatch?.[1] ?? "2026";
      const key = sanitizeBibKey(`arxiv${cleaned}`);
      const bibtex = [
        `@article{${key},`,
        `  title = {${title}},`,
        `  author = {${authorMatches.join(" and ") || "Unknown"}},`,
        `  year = {${year}},`,
        `  eprint = {${cleaned}},`,
        `  archivePrefix = {arXiv}`,
        `}`,
      ].join("\n");

      return reply.send({ key, title, authors: authorMatches, year, bibtex });
    }

    const doiResp = await fetch(
      `https://api.crossref.org/works/${encodeURIComponent(cleaned)}`
    );
    if (doiResp.status === 404) {
      return reply.code(404).send({ error: "DOI not found" });
    }
    if (!doiResp.ok) {
      return reply.code(502).send({ error: "Crossref lookup failed" });
    }

    const data = (await doiResp.json()) as {
      message?: {
        title?: string[];
        author?: Array<{ given?: string; family?: string }>;
        published?: { "date-parts"?: number[][] };
        "container-title"?: string[];
      };
    };
    const msg = data.message;
    const title = msg?.title?.[0] ?? cleaned;
    const authors = (msg?.author ?? []).map((a) =>
      [a.given, a.family].filter(Boolean).join(" ")
    );
    const year = String(msg?.published?.["date-parts"]?.[0]?.[0] ?? "2026");
    const journal = msg?.["container-title"]?.[0] ?? "";
    const key = sanitizeBibKey(`${authors[0]?.split(" ").pop() ?? "ref"}${year}`);
    const bibtex = [
      `@article{${key},`,
      `  title = {${title}},`,
      `  author = {${authors.join(" and ") || "Unknown"}},`,
      journal ? `  journal = {${journal}},` : null,
      `  year = {${year}},`,
      `  doi = {${cleaned}}`,
      `}`,
    ]
      .filter(Boolean)
      .join("\n");

    return reply.send({ key, title, authors, year, bibtex });
  });
}
