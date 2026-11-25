// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { pathToFileURL } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyWebsocket from "@fastify/websocket";
import type { Hocuspocus } from "@hocuspocus/server";
import { loadConfig, type AppConfig } from "./config.js";
import { createDb, type AppDb } from "./db/client.js";
import { users } from "./db/schema.js";
import { hashPassword } from "./auth/password.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerWorkspaceRoutes } from "./routes/workspaces.js";
import { registerFileRoutes } from "./routes/files.js";
import { registerExecuteRoutes } from "./routes/execute.js";
import { registerExportRoutes } from "./routes/export.js";
import { registerCitationRoutes } from "./routes/citations.js";
import { registerAiRoutes } from "./routes/ai.js";
import { registerPluginRoutes } from "./routes/plugins.js";
import { registerCommentRoutes } from "./routes/comments.js";
import { WorkspaceEventBus, registerEventRoutes } from "./ws/events.js";
import { createHocuspocusServer, registerCollabRoutes } from "./collab/hocuspocus.js";

export interface BuiltApp {
  app: FastifyInstance;
  db: AppDb;
  config: AppConfig;
  eventBus: WorkspaceEventBus;
  hocuspocus: Hocuspocus;
  close: () => Promise<void>;
}

async function seedInitialAdmin(db: AppDb, config: AppConfig): Promise<void> {
  if (!config.adminEmail || !config.adminPassword) return;
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, config.adminEmail))
    .limit(1);
  if (existing) {
    await db
      .update(users)
      .set({ systemRole: "ADMIN", accessLevel: "FULL", disabled: false })
      .where(eq(users.id, existing.id));
    return;
  }
  const passwordHash = await hashPassword(config.adminPassword);
  await db.insert(users).values({
    id: crypto.randomUUID(),
    email: config.adminEmail,
    displayName: config.adminDisplayName ?? "Administrator",
    passwordHash,
    avatarColor: "#3584e4",
    systemRole: "ADMIN",
    accessLevel: "FULL",
    disabled: false,
    createdAt: Date.now(),
  });
}

export async function buildApp(overrides: Partial<AppConfig> = {}): Promise<BuiltApp> {
  const config = loadConfig(overrides);
  const { db, close: closeDb } = await createDb(config.databaseUrl);
  await seedInitialAdmin(db, config);
  const eventBus = new WorkspaceEventBus();
  const hocuspocus = createHocuspocusServer(db, config, eventBus);

  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
    bodyLimit: 10 * 1024 * 1024,
    trustProxy: true,
  });

  await app.register(fastifyCookie);
  await app.register(fastifyCors, {
    origin: (origin, cb) => {
      if (!origin || config.corsOrigins.includes("*")) {
        cb(null, true);
        return;
      }
      if (config.corsOrigins.includes(origin)) {
        cb(null, true);
        return;
      }
      cb(null, false);
    },
    credentials: true,
  });
  await app.register(fastifyRateLimit, {
    max: 300,
    timeWindow: "1 minute",
  });
  await app.register(fastifyWebsocket);

  app.addHook("onSend", async (_req, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    return payload;
  });

  app.get("/health", async () => ({
    ok: true,
    service: "imladris-api",
    mode: config.mode,
    authMode: config.authMode,
  }));

  await registerAuthRoutes(app, db, config);
  await registerAdminRoutes(app, db, config);
  await registerWorkspaceRoutes(app, db, config, eventBus, hocuspocus);
  await registerFileRoutes(app, db, config);
  await registerExecuteRoutes(app, db, config, eventBus);
  await registerExportRoutes(app, db, config);
  await registerCitationRoutes(app, db, config);
  await registerAiRoutes(app, db, config);
  await registerPluginRoutes(app, db, config);
  await registerCommentRoutes(app, db, config, eventBus);
  await registerEventRoutes(app, db, config, eventBus);
  await registerCollabRoutes(app, hocuspocus);

  const close = async (): Promise<void> => {
    eventBus.closeAll();
    await hocuspocus.destroy();
    await app.close();
    await closeDb();
  };

  return { app, db, config, eventBus, hocuspocus, close };
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const { app, config } = await buildApp();
  await app.listen({ port: config.port, host: config.host });
}
