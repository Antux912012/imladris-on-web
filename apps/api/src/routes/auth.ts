// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import crypto from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { AppDb } from "../db/client.js";
import { inviteTokens, users } from "../db/schema.js";
import { SESSION_COOKIE_NAME, signSessionToken } from "../auth/jwt.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { authenticateRequest } from "../auth/rbac.js";

const AVATAR_COLORS = [
  "#3584e4",
  "#26a269",
  "#e66100",
  "#9141ac",
  "#c01c28",
  "#1c71d8",
];

const RegisterBody = z.object({
  email: z.string().email().max(254),
  displayName: z.string().min(1).max(80),
  password: z.string().min(8).max(200),
  inviteToken: z.string().min(1).optional(),
});

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function setSessionCookie(
  reply: { setCookie: (name: string, val: string, opts: Record<string, unknown>) => unknown },
  token: string,
  config: AppConfig
): void {
  reply.setCookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: config.publicUrl.startsWith("https://"),
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  db: AppDb,
  config: AppConfig
): Promise<void> {
  app.post("/api/auth/register", async (req, reply) => {
    const parsed = RegisterBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid registration payload" });
    }
    const email = parsed.data.email.trim().toLowerCase();
    const displayName = parsed.data.displayName.trim();

    if (config.allowedEmailDomains.length > 0) {
      const domain = email.split("@")[1] ?? "";
      if (!config.allowedEmailDomains.includes(domain)) {
        return reply.code(403).send({
          error: "Email domain is not permitted on this server",
        });
      }
    }

    if (config.registrationMode === "closed") {
      const [userCountRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(users);
      if ((userCountRow?.count ?? 0) > 0) {
        return reply.code(403).send({ error: "Public registration is disabled" });
      }
    } else if (config.registrationMode === "invite") {
      const [userCountRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(users);
      if ((userCountRow?.count ?? 0) > 0) {
        if (!parsed.data.inviteToken) {
          return reply
            .code(403)
            .send({ error: "An invite token is required to register on this server" });
        }
        const [inv] = await db
          .select()
          .from(inviteTokens)
          .where(
            and(
              eq(inviteTokens.token, parsed.data.inviteToken),
              gt(inviteTokens.expiresAt, Date.now()),
              lt(inviteTokens.useCount, inviteTokens.maxUses)
            )
          )
          .limit(1);
        if (!inv) {
          return reply.code(403).send({ error: "Invalid or expired invite token" });
        }
      }
    }

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing) {
      return reply.code(409).send({ error: "Email already registered" });
    }

    const id = crypto.randomUUID();
    const passwordHash = await hashPassword(parsed.data.password);
    const avatarColor =
      AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)] ?? "#3584e4";
    const createdAt = Date.now();

    await db.insert(users).values({
      id,
      email,
      displayName,
      passwordHash,
      avatarColor,
      createdAt,
    });

    const token = await signSessionToken(
      { sub: id, email, displayName },
      config.jwtSecret
    );
    setSessionCookie(reply, token, config);

    return reply.code(201).send({
      user: { id, email, displayName, avatarColor },
    });
  });

  app.post("/api/auth/login", async (req, reply) => {
    const parsed = LoginBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid login payload" });
    }
    const email = parsed.data.email.trim().toLowerCase();

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user || !(await verifyPassword(user.passwordHash, parsed.data.password))) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }

    const token = await signSessionToken(
      { sub: user.id, email: user.email, displayName: user.displayName },
      config.jwtSecret
    );
    setSessionCookie(reply, token, config);

    return reply.send({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarColor: user.avatarColor,
      },
    });
  });

  app.post("/api/auth/logout", async (_req, reply) => {
    reply.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    return reply.send({ ok: true });
  });

  app.get("/api/auth/me", async (req, reply) => {
    const user = await authenticateRequest(req, db, config);
    if (!user) {
      return reply.code(401).send({ error: "Not authenticated" });
    }
    return reply.send({ user, authMode: config.authMode });
  });
}
