// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import { and, eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Role } from "@imladris/shared";
import type { AppDb } from "../db/client.js";
import { users, workspaceMembers } from "../db/schema.js";
import type { AppConfig } from "../config.js";
import { SESSION_COOKIE_NAME, verifySessionToken } from "./jwt.js";

export type WorkspaceAction =
  | "read"
  | "comment"
  | "edit"
  | "execute"
  | "export"
  | "manage_invites"
  | "manage_workspace";

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<WorkspaceAction>> = {
  OWNER: new Set([
    "read",
    "comment",
    "edit",
    "execute",
    "export",
    "manage_invites",
    "manage_workspace",
  ]),
  EDITOR: new Set(["read", "comment", "edit", "execute", "export"]),
  REVIEWER: new Set(["read", "comment", "export"]),
  VIEWER: new Set(["read"]),
};

export function hasPermission(role: Role, action: WorkspaceAction): boolean {
  return ROLE_PERMISSIONS[role]?.has(action) ?? false;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  avatarColor: string;
}

export async function authenticateRequest(
  req: FastifyRequest,
  db: AppDb,
  config: AppConfig
): Promise<AuthenticatedUser | null> {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (!token) return null;
  const payload = await verifySessionToken(token, config.jwtSecret);
  if (!payload) return null;

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      avatarColor: users.avatarColor,
    })
    .from(users)
    .where(eq(users.id, payload.sub))
    .limit(1);

  return user ?? null;
}

export async function requireAuth(
  req: FastifyRequest,
  reply: FastifyReply,
  db: AppDb,
  config: AppConfig
): Promise<AuthenticatedUser | null> {
  const user = await authenticateRequest(req, db, config);
  if (!user) {
    reply.code(401).send({ error: "Authentication required" });
    return null;
  }
  return user;
}

export async function getMemberRole(
  db: AppDb,
  workspaceId: string,
  userId: string
): Promise<Role | null> {
  const [membership] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId)
      )
    )
    .limit(1);

  if (!membership) return null;
  return membership.role as Role;
}

export async function requireWorkspacePermission(
  req: FastifyRequest,
  reply: FastifyReply,
  db: AppDb,
  config: AppConfig,
  workspaceId: string,
  action: WorkspaceAction
): Promise<{ user: AuthenticatedUser; role: Role } | null> {
  const user = await requireAuth(req, reply, db, config);
  if (!user) return null;

  const role = await getMemberRole(db, workspaceId, user.id);
  if (!role) {
    reply.code(403).send({ error: "Not a member of this workspace" });
    return null;
  }
  if (!hasPermission(role, action)) {
    reply.code(403).send({ error: `Role ${role} lacks '${action}' permission` });
    return null;
  }
  return { user, role };
}
