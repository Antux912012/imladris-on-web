// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { and, eq, lt, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Hocuspocus } from "@hocuspocus/server";
import { z } from "zod";
import { KernelModeSchema, RoleSchema } from "@imladris/shared";
import type { AppConfig } from "../config.js";
import type { AppDb } from "../db/client.js";
import {
  auditEvents,
  inviteTokens,
  users,
  workspaceMembers,
  workspaces,
} from "../db/schema.js";
import { requireWorkspacePermission, requireAuth } from "../auth/rbac.js";
import { disconnectUserFromCollab } from "../collab/hocuspocus.js";
import type { WorkspaceEventBus } from "../ws/events.js";

const CreateWorkspaceBody = z.object({
  name: z.string().min(1).max(120),
  kernelMode: KernelModeSchema.default("SHARED"),
});

const PatchWorkspaceBody = z.object({
  name: z.string().min(1).max(120).optional(),
  kernelMode: KernelModeSchema.optional(),
});

const CreateInviteBody = z.object({
  role: RoleSchema.exclude(["OWNER"]).default("EDITOR"),
  maxUses: z.number().int().min(1).max(100).default(5),
  expiresInHours: z.number().int().min(1).max(720).default(72),
});

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const suffix = crypto.randomBytes(3).toString("hex");
  return `${base || "workspace"}-${suffix}`;
}

const STARTER_QMD = `---
title: "Untitled Document"
format: html
---

# Introduction

Welcome to **Imladris on Web**.

\`\`\`{python}
#| label: setup
x = [1, 2, 3, 4]
print("Sum:", sum(x))
\`\`\`
`;

export async function registerWorkspaceRoutes(
  app: FastifyInstance,
  db: AppDb,
  config: AppConfig,
  bus?: WorkspaceEventBus,
  hocuspocus?: Hocuspocus
): Promise<void> {
  app.get("/api/workspaces", async (req, reply) => {
    const user = await requireAuth(req, reply, db, config);
    if (!user) return;

    const rows = await db
      .select({
        id: workspaces.id,
        slug: workspaces.slug,
        name: workspaces.name,
        kernelMode: workspaces.kernelMode,
        ownerId: workspaces.ownerId,
        createdAt: workspaces.createdAt,
        role: workspaceMembers.role,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(eq(workspaceMembers.userId, user.id));

    return reply.send({ workspaces: rows });
  });

  app.post("/api/workspaces", async (req, reply) => {
    const user = await requireAuth(req, reply, db, config);
    if (!user) return;

    const parsed = CreateWorkspaceBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid workspace payload" });
    }

    const id = crypto.randomUUID();
    const slug = slugify(parsed.data.name);
    const createdAt = Date.now();

    const wsDir = path.join(config.workspacesRoot, id);
    await fs.mkdir(wsDir, { recursive: true });
    await fs.writeFile(path.join(wsDir, "main.qmd"), STARTER_QMD, "utf8");

    await db.insert(workspaces).values({
      id,
      slug,
      name: parsed.data.name.trim(),
      kernelMode: parsed.data.kernelMode,
      ownerId: user.id,
      createdAt,
    });

    await db.insert(workspaceMembers).values({
      workspaceId: id,
      userId: user.id,
      role: "OWNER",
      joinedAt: createdAt,
    });

    await db.insert(auditEvents).values({
      id: crypto.randomUUID(),
      workspaceId: id,
      userId: user.id,
      action: "workspace_created",
      targetPath: "main.qmd",
      payloadJson: JSON.stringify({ name: parsed.data.name }),
      createdAt,
    });

    return reply.code(201).send({
      workspace: {
        id,
        slug,
        name: parsed.data.name.trim(),
        kernelMode: parsed.data.kernelMode,
        ownerId: user.id,
        createdAt,
        role: "OWNER",
      },
    });
  });

  app.patch("/api/workspaces/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const auth = await requireWorkspacePermission(
      req,
      reply,
      db,
      config,
      id,
      "manage_workspace"
    );
    if (!auth) return;

    const parsed = PatchWorkspaceBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid workspace update payload" });
    }

    const updates: Partial<{ name: string; kernelMode: string }> = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name.trim();
    if (parsed.data.kernelMode !== undefined) updates.kernelMode = parsed.data.kernelMode;

    if (Object.keys(updates).length > 0) {
      await db.update(workspaces).set(updates).where(eq(workspaces.id, id));
    }

    const [updated] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, id))
      .limit(1);

    return reply.send({ workspace: updated });
  });

  app.post("/api/workspaces/:id/invites", async (req, reply) => {
    const { id } = req.params as { id: string };
    const auth = await requireWorkspacePermission(
      req,
      reply,
      db,
      config,
      id,
      "manage_invites"
    );
    if (!auth) return;

    const parsed = CreateInviteBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid invite payload" });
    }

    const token = crypto.randomBytes(24).toString("base64url");
    const expiresAt = Date.now() + parsed.data.expiresInHours * 3600 * 1000;

    await db.insert(inviteTokens).values({
      token,
      workspaceId: id,
      role: parsed.data.role,
      expiresAt,
      maxUses: parsed.data.maxUses,
      useCount: 0,
    });

    return reply.code(201).send({
      invite: {
        token,
        workspaceId: id,
        role: parsed.data.role,
        expiresAt,
        maxUses: parsed.data.maxUses,
      },
    });
  });

  app.post("/api/invites/:token/accept", async (req, reply) => {
    const user = await requireAuth(req, reply, db, config);
    if (!user) return;

    const { token } = req.params as { token: string };
    const [invite] = await db
      .select()
      .from(inviteTokens)
      .where(eq(inviteTokens.token, token))
      .limit(1);

    if (!invite) {
      return reply.code(404).send({ error: "Invite token not found" });
    }
    if (invite.expiresAt < Date.now()) {
      return reply.code(410).send({ error: "Invite token expired" });
    }
    if (invite.useCount >= invite.maxUses) {
      return reply.code(410).send({ error: "Invite token exhausted" });
    }

    const now = Date.now();
    const claimed = await db
      .update(inviteTokens)
      .set({ useCount: sql`${inviteTokens.useCount} + 1` })
      .where(
        and(
          eq(inviteTokens.token, token),
          lt(inviteTokens.useCount, inviteTokens.maxUses)
        )
      )
      .returning({ token: inviteTokens.token });

    if (claimed.length === 0) {
      return reply.code(410).send({ error: "Invite token exhausted" });
    }

    const [existingMember] = await db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, invite.workspaceId),
          eq(workspaceMembers.userId, user.id)
        )
      )
      .limit(1);

    if (!existingMember) {
      await db.insert(workspaceMembers).values({
        workspaceId: invite.workspaceId,
        userId: user.id,
        role: invite.role,
        joinedAt: now,
      });
    }

    await db.insert(auditEvents).values({
      id: crypto.randomUUID(),
      workspaceId: invite.workspaceId,
      userId: user.id,
      action: "member_joined",
      payloadJson: JSON.stringify({ role: invite.role }),
      createdAt: now,
    });

    return reply.send({
      workspaceId: invite.workspaceId,
      role: existingMember ? existingMember.role : invite.role,
    });
  });

  app.get("/api/workspaces/:id/members", async (req, reply) => {
    const { id } = req.params as { id: string };
    const auth = await requireWorkspacePermission(req, reply, db, config, id, "read");
    if (!auth) return;

    const members = await db
      .select({
        userId: workspaceMembers.userId,
        email: users.email,
        displayName: users.displayName,
        avatarColor: users.avatarColor,
        role: workspaceMembers.role,
        joinedAt: workspaceMembers.joinedAt,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(workspaceMembers.userId, users.id))
      .where(eq(workspaceMembers.workspaceId, id));

    return reply.send({ members });
  });

  const UpdateMemberRoleBody = z.object({
    role: RoleSchema.exclude(["OWNER"]),
  });

  app.patch("/api/workspaces/:id/members/:userId", async (req, reply) => {
    const { id, userId } = req.params as { id: string; userId: string };
    const auth = await requireWorkspacePermission(
      req,
      reply,
      db,
      config,
      id,
      "manage_workspace"
    );
    if (!auth) return;

    if (userId === auth.user.id) {
      return reply.code(400).send({ error: "Owner cannot change their own role" });
    }

    const parsed = UpdateMemberRoleBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid role payload" });
    }

    const updated = await db
      .update(workspaceMembers)
      .set({ role: parsed.data.role })
      .where(
        and(
          eq(workspaceMembers.workspaceId, id),
          eq(workspaceMembers.userId, userId)
        )
      )
      .returning({ userId: workspaceMembers.userId, role: workspaceMembers.role });

    if (updated.length === 0) {
      return reply.code(404).send({ error: "Member not found" });
    }

    await db.insert(auditEvents).values({
      id: crypto.randomUUID(),
      workspaceId: id,
      userId: auth.user.id,
      action: "member_role_updated",
      payloadJson: JSON.stringify({ targetUserId: userId, role: parsed.data.role }),
      createdAt: Date.now(),
    });

    bus?.disconnectUser(id, userId);
    if (hocuspocus) disconnectUserFromCollab(hocuspocus, id, userId);

    return reply.send({ member: updated[0] });
  });

  app.delete("/api/workspaces/:id/members/:userId", async (req, reply) => {
    const { id, userId } = req.params as { id: string; userId: string };
    const auth = await requireWorkspacePermission(
      req,
      reply,
      db,
      config,
      id,
      "manage_workspace"
    );
    if (!auth) return;

    if (userId === auth.user.id) {
      return reply.code(400).send({ error: "Owner cannot remove themselves" });
    }

    const deleted = await db
      .delete(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, id),
          eq(workspaceMembers.userId, userId)
        )
      )
      .returning({ userId: workspaceMembers.userId });

    if (deleted.length === 0) {
      return reply.code(404).send({ error: "Member not found" });
    }

    await db.insert(auditEvents).values({
      id: crypto.randomUUID(),
      workspaceId: id,
      userId: auth.user.id,
      action: "member_removed",
      payloadJson: JSON.stringify({ targetUserId: userId }),
      createdAt: Date.now(),
    });

    bus?.disconnectUser(id, userId);
    if (hocuspocus) disconnectUserFromCollab(hocuspocus, id, userId);

    return reply.send({ removedUserId: userId });
  });

  app.get("/api/workspaces/:id/invites", async (req, reply) => {
    const { id } = req.params as { id: string };
    const auth = await requireWorkspacePermission(
      req,
      reply,
      db,
      config,
      id,
      "manage_invites"
    );
    if (!auth) return;

    const invites = await db
      .select()
      .from(inviteTokens)
      .where(eq(inviteTokens.workspaceId, id));

    return reply.send({ invites });
  });

  app.delete("/api/workspaces/:id/invites/:token", async (req, reply) => {
    const { id, token } = req.params as { id: string; token: string };
    const auth = await requireWorkspacePermission(
      req,
      reply,
      db,
      config,
      id,
      "manage_invites"
    );
    if (!auth) return;

    const deleted = await db
      .delete(inviteTokens)
      .where(and(eq(inviteTokens.workspaceId, id), eq(inviteTokens.token, token)))
      .returning({ token: inviteTokens.token });

    if (deleted.length === 0) {
      return reply.code(404).send({ error: "Invite token not found" });
    }
    return reply.send({ revoked: token });
  });

  app.delete("/api/workspaces/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const auth = await requireWorkspacePermission(
      req,
      reply,
      db,
      config,
      id,
      "manage_workspace"
    );
    if (!auth) return;

    await db.delete(workspaces).where(eq(workspaces.id, id));
    const wsDir = path.resolve(config.workspacesRoot, id);
    await fs.rm(wsDir, { recursive: true, force: true });
    return reply.send({ deletedWorkspaceId: id });
  });
}
