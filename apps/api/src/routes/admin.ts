// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import crypto from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { AccessLevelSchema, RoleSchema, SystemRoleSchema } from "@imladris/shared";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { AppDb } from "../db/client.js";
import { users, workspaceMembers, workspaces } from "../db/schema.js";
import { hashPassword } from "../auth/password.js";
import { requireAdmin } from "../auth/rbac.js";

const AVATAR_COLORS = [
  "#3584e4",
  "#26a269",
  "#e66100",
  "#9141ac",
  "#c01c28",
  "#1c71d8",
];

const CreateUserBody = z.object({
  email: z.string().email().max(254),
  displayName: z.string().min(1).max(80),
  password: z.string().min(8).max(200),
  systemRole: SystemRoleSchema.default("USER"),
  accessLevel: AccessLevelSchema.default("FULL"),
  disabled: z.boolean().default(false),
  workspaceId: z.string().min(1).optional(),
  workspaceRole: RoleSchema.optional(),
});

const UpdateUserBody = z.object({
  displayName: z.string().min(1).max(80).optional(),
  systemRole: SystemRoleSchema.optional(),
  accessLevel: AccessLevelSchema.optional(),
  disabled: z.boolean().optional(),
  password: z.string().min(8).max(200).optional(),
});

const AssignWorkspaceBody = z.object({
  role: RoleSchema,
});

export async function registerAdminRoutes(
  app: FastifyInstance,
  db: AppDb,
  config: AppConfig
): Promise<void> {
  app.get("/api/admin/users", async (req, reply) => {
    const admin = await requireAdmin(req, reply, db, config);
    if (!admin) return;

    const allUsers = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        avatarColor: users.avatarColor,
        systemRole: users.systemRole,
        accessLevel: users.accessLevel,
        disabled: users.disabled,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt));

    const membershipCounts = await db
      .select({
        userId: workspaceMembers.userId,
        count: sql<number>`count(*)`,
      })
      .from(workspaceMembers)
      .groupBy(workspaceMembers.userId);

    const countMap = new Map(membershipCounts.map((m) => [m.userId, Number(m.count)]));

    const allWorkspaces = await db
      .select({
        id: workspaces.id,
        slug: workspaces.slug,
        name: workspaces.name,
        ownerId: workspaces.ownerId,
      })
      .from(workspaces)
      .orderBy(desc(workspaces.createdAt));

    return reply.send({
      users: allUsers.map((u) => ({
        ...u,
        disabled: Boolean(u.disabled),
        workspaceCount: countMap.get(u.id) ?? 0,
      })),
      workspaces: allWorkspaces,
    });
  });

  app.post("/api/admin/users", async (req, reply) => {
    const admin = await requireAdmin(req, reply, db, config);
    if (!admin) return;

    const parsed = CreateUserBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid user creation payload" });
    }

    const email = parsed.data.email.trim().toLowerCase();
    const displayName = parsed.data.displayName.trim();

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
      systemRole: parsed.data.systemRole,
      accessLevel: parsed.data.accessLevel,
      disabled: parsed.data.disabled,
      createdAt,
    });

    let workspaceCount = 0;
    if (parsed.data.workspaceId) {
      const [ws] = await db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.id, parsed.data.workspaceId))
        .limit(1);
      if (ws) {
        await db
          .insert(workspaceMembers)
          .values({
            workspaceId: ws.id,
            userId: id,
            role: parsed.data.workspaceRole ?? "EDITOR",
            joinedAt: createdAt,
          })
          .onConflictDoNothing();
        workspaceCount = 1;
      }
    }

    return reply.code(201).send({
      user: {
        id,
        email,
        displayName,
        avatarColor,
        systemRole: parsed.data.systemRole,
        accessLevel: parsed.data.accessLevel,
        disabled: parsed.data.disabled,
        createdAt,
        workspaceCount,
      },
    });
  });

  app.patch<{ Params: { userId: string } }>(
    "/api/admin/users/:userId",
    async (req, reply) => {
      const admin = await requireAdmin(req, reply, db, config);
      if (!admin) return;

      const parsed = UpdateUserBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid user update payload" });
      }

      const { userId } = req.params;
      if (userId === admin.id) {
        if (parsed.data.disabled === true) {
          return reply.code(400).send({ error: "You cannot disable your own admin account" });
        }
        if (parsed.data.systemRole === "USER") {
          return reply.code(400).send({ error: "You cannot demote your own admin account" });
        }
      }

      const [existing] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!existing) {
        return reply.code(404).send({ error: "User not found" });
      }

      const updates: Partial<typeof users.$inferInsert> = {};
      if (parsed.data.displayName !== undefined) {
        updates.displayName = parsed.data.displayName.trim();
      }
      if (parsed.data.systemRole !== undefined) {
        updates.systemRole = parsed.data.systemRole;
      }
      if (parsed.data.accessLevel !== undefined) {
        updates.accessLevel = parsed.data.accessLevel;
      }
      if (parsed.data.disabled !== undefined) {
        updates.disabled = parsed.data.disabled;
      }
      if (parsed.data.password !== undefined) {
        updates.passwordHash = await hashPassword(parsed.data.password);
      }

      if (Object.keys(updates).length > 0) {
        await db.update(users).set(updates).where(eq(users.id, userId));
      }

      const [updated] = await db
        .select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          avatarColor: users.avatarColor,
          systemRole: users.systemRole,
          accessLevel: users.accessLevel,
          disabled: users.disabled,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      return reply.send({
        user: updated ? { ...updated, disabled: Boolean(updated.disabled) } : null,
      });
    }
  );

  app.get<{ Params: { userId: string } }>(
    "/api/admin/users/:userId/workspaces",
    async (req, reply) => {
      const admin = await requireAdmin(req, reply, db, config);
      if (!admin) return;

      const rows = await db
        .select({
          workspaceId: workspaces.id,
          name: workspaces.name,
          slug: workspaces.slug,
          role: workspaceMembers.role,
          joinedAt: workspaceMembers.joinedAt,
        })
        .from(workspaceMembers)
        .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
        .where(eq(workspaceMembers.userId, req.params.userId));

      return reply.send({ memberships: rows });
    }
  );

  app.put<{ Params: { userId: string; workspaceId: string } }>(
    "/api/admin/users/:userId/workspaces/:workspaceId",
    async (req, reply) => {
      const admin = await requireAdmin(req, reply, db, config);
      if (!admin) return;

      const parsed = AssignWorkspaceBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid workspace role" });
      }

      const { userId, workspaceId } = req.params;
      const [userRow] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!userRow) {
        return reply.code(404).send({ error: "User not found" });
      }

      const [wsRow] = await db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);
      if (!wsRow) {
        return reply.code(404).send({ error: "Workspace not found" });
      }

      await db
        .insert(workspaceMembers)
        .values({
          workspaceId,
          userId,
          role: parsed.data.role,
          joinedAt: Date.now(),
        })
        .onConflictDoUpdate({
          target: [workspaceMembers.workspaceId, workspaceMembers.userId],
          set: { role: parsed.data.role },
        });

      return reply.send({ workspaceId, userId, role: parsed.data.role });
    }
  );

  app.delete<{ Params: { userId: string; workspaceId: string } }>(
    "/api/admin/users/:userId/workspaces/:workspaceId",
    async (req, reply) => {
      const admin = await requireAdmin(req, reply, db, config);
      if (!admin) return;

      await db
        .delete(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.userId, req.params.userId),
            eq(workspaceMembers.workspaceId, req.params.workspaceId)
          )
        );

      return reply.send({
        removed: true,
        userId: req.params.userId,
        workspaceId: req.params.workspaceId,
      });
    }
  );
}
