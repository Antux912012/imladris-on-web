// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { AppDb } from "../db/client.js";
import { requireAuth } from "../auth/rbac.js";

const ChatBody = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string().min(1).max(32000),
      })
    )
    .min(1)
    .max(50),
  provider: z.enum(["local", "cloud"]).default("local"),
  model: z.string().min(1).max(120).optional(),
});

export async function registerAiRoutes(
  app: FastifyInstance,
  db: AppDb,
  config: AppConfig
): Promise<void> {
  app.post("/api/ai/chat", async (req, reply) => {
    const user = await requireAuth(req, reply, db, config);
    if (!user) return;

    const parsed = ChatBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid chat payload" });
    }

    if (parsed.data.provider === "cloud" && !config.aiAllowCloud) {
      return reply.code(403).send({
        error: "Cloud AI providers are disabled by server policy (AI_ALLOW_CLOUD=false)",
      });
    }

    if (parsed.data.provider === "local") {
      try {
        const resp = await fetch(`${config.aiLocalUrl}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: parsed.data.model ?? "llama3.2",
            messages: parsed.data.messages,
            stream: false,
          }),
          signal: AbortSignal.timeout(30000),
        });
        if (!resp.ok) {
          return reply.code(502).send({
            error: `Local AI provider returned HTTP ${resp.status}`,
          });
        }
        const data = (await resp.json()) as {
          message?: { content?: string };
          response?: string;
        };
        return reply.send({
          reply: data.message?.content ?? data.response ?? "",
          provider: "local",
        });
      } catch {
        return reply.code(502).send({
          error: "Local Ollama instance unreachable or timed out",
        });
      }
    }

    return reply.code(501).send({
      error: "Cloud AI provider adapter requires server-side API key configuration",
    });
  });
}
