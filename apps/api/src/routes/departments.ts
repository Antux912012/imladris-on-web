// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { AppDb } from "../db/client.js";
import { departmentMembers, departments, users, workspaces } from "../db/schema.js";
import { requireAdmin, requireAuth, requireWorkspacePermission } from "../auth/rbac.js";
import { recordAuditEvent } from "../audit/logger.js";

const CreateDepartmentBody = z.object({
  name: z.string().min(1).max(120),
  quotaMb: z.number().int().min(256).max(1048576).default(10240),
});

const AddDeptMemberBody = z.object({
  email: z.string().email(),
  role: z.enum(["DEPT_ADMIN", "MEMBER"]).default("MEMBER"),
});

export async function registerDepartmentRoutes(
  app: FastifyInstance,
  db: AppDb,
  config: AppConfig
): Promise<void> {
  app.get("/api/departments", async (req, reply) => {
    const user = await requireAuth(req, reply, db, config);
    if (!user) return;

    if (user.systemRole === "ADMIN") {
      const all = await db
        .select()
        .from(departments)
        .orderBy(desc(departments.createdAt));
      return reply.send({
        departments: all.map((d) => ({ ...d, myRole: "DEPT_ADMIN" })),
      });
    }

    const mine = await db
      .select({
        id: departments.id,
        name: departments.name,
        slug: departments.slug,
        quotaMb: departments.quotaMb,
        createdAt: departments.createdAt,
        myRole: departmentMembers.role,
      })
      .from(departmentMembers)
      .innerJoin(departments, eq(departmentMembers.departmentId, departments.id))
      .where(eq(departmentMembers.userId, user.id));

    return reply.send({ departments: mine });
  });

  app.post("/api/departments", async (req, reply) => {
    const admin = await requireAdmin(req, reply, db, config);
    if (!admin) return;

    const parsed = CreateDepartmentBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid department payload" });
    }

    const id = crypto.randomUUID();
    const slug = `${parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 32)}-${crypto.randomBytes(2).toString("hex")}`;
    const createdAt = Date.now();

    await db.insert(departments).values({
      id,
      name: parsed.data.name.trim(),
      slug,
      quotaMb: parsed.data.quotaMb,
      createdAt,
    });
    await db.insert(departmentMembers).values({
      departmentId: id,
      userId: admin.id,
      role: "DEPT_ADMIN",
      joinedAt: createdAt,
    });

    await recordAuditEvent(db, {
      userId: admin.id,
      action: "department_created",
      targetPath: id,
      payload: { name: parsed.data.name, quotaMb: parsed.data.quotaMb },
    });

    return reply.code(201).send({
      department: {
        id,
        name: parsed.data.name.trim(),
        slug,
        quotaMb: parsed.data.quotaMb,
        myRole: "DEPT_ADMIN",
        createdAt,
      },
    });
  });

  app.get<{ Params: { id: string } }>(
    "/api/departments/:id/members",
    async (req, reply) => {
      const user = await requireAuth(req, reply, db, config);
      if (!user) return;

      const rows = await db
        .select({
          userId: users.id,
          email: users.email,
          displayName: users.displayName,
          role: departmentMembers.role,
          joinedAt: departmentMembers.joinedAt,
        })
        .from(departmentMembers)
        .innerJoin(users, eq(departmentMembers.userId, users.id))
        .where(eq(departmentMembers.departmentId, req.params.id));

      return reply.send({ members: rows });
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/departments/:id/members",
    async (req, reply) => {
      const user = await requireAuth(req, reply, db, config);
      if (!user) return;

      const [membership] = await db
        .select()
        .from(departmentMembers)
        .where(
          and(
            eq(departmentMembers.departmentId, req.params.id),
            eq(departmentMembers.userId, user.id)
          )
        )
        .limit(1);

      if (user.systemRole !== "ADMIN" && membership?.role !== "DEPT_ADMIN") {
        return reply.code(403).send({ error: "Department Admin privileges required" });
      }

      const parsed = AddDeptMemberBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid department member payload" });
      }

      const [targetUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, parsed.data.email.trim().toLowerCase()))
        .limit(1);
      if (!targetUser) {
        return reply.code(404).send({ error: "User not found" });
      }

      await db
        .insert(departmentMembers)
        .values({
          departmentId: req.params.id,
          userId: targetUser.id,
          role: parsed.data.role,
          joinedAt: Date.now(),
        })
        .onConflictDoUpdate({
          target: [departmentMembers.departmentId, departmentMembers.userId],
          set: { role: parsed.data.role },
        });

      return reply.send({ ok: true, userId: targetUser.id, role: parsed.data.role });
    }
  );

  app.patch<{ Params: { id: string }; Body: { departmentId: string | null } }>(
    "/api/workspaces/:id/department",
    async (req, reply) => {
      const auth = await requireWorkspacePermission(
        req,
        reply,
        db,
        config,
        req.params.id,
        "manage_workspace"
      );
      if (!auth) return;

      await db
        .update(workspaces)
        .set({ departmentId: req.body?.departmentId ?? null })
        .where(eq(workspaces.id, req.params.id));

      return reply.send({ ok: true, departmentId: req.body?.departmentId ?? null });
    }
  );
}
