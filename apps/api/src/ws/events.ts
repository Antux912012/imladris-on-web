// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import type { WorkspaceEvent } from "@imladris/shared";
import type { AppConfig } from "../config.js";
import type { AppDb } from "../db/client.js";
import { SESSION_COOKIE_NAME, verifySessionToken } from "../auth/jwt.js";
import { getMemberRole, hasPermission } from "../auth/rbac.js";

interface Subscriber {
  socket: WebSocket;
  userId: string;
}

export class WorkspaceEventBus {
  private readonly subscribers = new Map<string, Set<Subscriber>>();

  subscribe(workspaceId: string, socket: WebSocket, userId = ""): () => void {
    let set = this.subscribers.get(workspaceId);
    if (!set) {
      set = new Set();
      this.subscribers.set(workspaceId, set);
    }
    const entry: Subscriber = { socket, userId };
    set.add(entry);

    return () => {
      const current = this.subscribers.get(workspaceId);
      if (!current) return;
      current.delete(entry);
      if (current.size === 0) {
        this.subscribers.delete(workspaceId);
      }
    };
  }

  publish(workspaceId: string, event: WorkspaceEvent, targetUserId?: string): void {
    const set = this.subscribers.get(workspaceId);
    if (!set || set.size === 0) return;
    const payload = JSON.stringify(event);
    for (const sub of set) {
      if (targetUserId && sub.userId !== targetUserId) continue;
      if (sub.socket.readyState === 1) {
        sub.socket.send(payload);
      }
    }
  }

  disconnectUser(workspaceId: string, userId: string): void {
    const set = this.subscribers.get(workspaceId);
    if (!set) return;
    for (const sub of [...set]) {
      if (sub.userId === userId) {
        sub.socket.close(4003, "Workspace permissions changed");
        set.delete(sub);
      }
    }
    if (set.size === 0) {
      this.subscribers.delete(workspaceId);
    }
  }

  closeAll(): void {
    for (const set of this.subscribers.values()) {
      for (const sub of set) {
        sub.socket.close();
      }
    }
    this.subscribers.clear();
  }
}

export async function registerEventRoutes(
  app: FastifyInstance,
  db: AppDb,
  config: AppConfig,
  bus: WorkspaceEventBus
): Promise<void> {
  app.get(
    "/ws/events/:workspaceId",
    {
      websocket: true,
      preValidation: async (req, reply) => {
        const { workspaceId } = req.params as { workspaceId: string };
        const token = req.cookies?.[SESSION_COOKIE_NAME];
        if (!token) {
          return reply.code(401).send({ error: "Authentication required" });
        }
        const payload = await verifySessionToken(token, config.jwtSecret);
        if (!payload) {
          return reply.code(401).send({ error: "Invalid session" });
        }
        const role = await getMemberRole(db, workspaceId, payload.sub);
        if (!role || !hasPermission(role, "read")) {
          return reply.code(403).send({ error: "Forbidden" });
        }
        (req as unknown as { wsUserId?: string }).wsUserId = payload.sub;
      },
    },
    (socket, req) => {
      const { workspaceId } = req.params as { workspaceId: string };
      const userId = (req as unknown as { wsUserId?: string }).wsUserId ?? "";
      const unsubscribe = bus.subscribe(
        workspaceId,
        socket as unknown as WebSocket,
        userId
      );
      socket.on("close", unsubscribe);
      socket.on("error", unsubscribe);
    }
  );
}
