// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import type { WorkspaceEvent } from "@imladris/shared";
import type { AppConfig } from "../config.js";
import type { AppDb } from "../db/client.js";
import { SESSION_COOKIE_NAME, verifySessionToken } from "../auth/jwt.js";
import { getMemberRole, hasPermission } from "../auth/rbac.js";

export class WorkspaceEventBus {
  private readonly subscribers = new Map<string, Set<WebSocket>>();

  subscribe(workspaceId: string, socket: WebSocket): () => void {
    let set = this.subscribers.get(workspaceId);
    if (!set) {
      set = new Set();
      this.subscribers.set(workspaceId, set);
    }
    set.add(socket);

    return () => {
      const current = this.subscribers.get(workspaceId);
      if (!current) return;
      current.delete(socket);
      if (current.size === 0) {
        this.subscribers.delete(workspaceId);
      }
    };
  }

  publish(workspaceId: string, event: WorkspaceEvent): void {
    const set = this.subscribers.get(workspaceId);
    if (!set || set.size === 0) return;
    const payload = JSON.stringify(event);
    for (const sock of set) {
      if (sock.readyState === 1) {
        sock.send(payload);
      }
    }
  }

  closeAll(): void {
    for (const set of this.subscribers.values()) {
      for (const sock of set) {
        sock.close();
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
      },
    },
    (socket, req) => {
      const { workspaceId } = req.params as { workspaceId: string };
      const unsubscribe = bus.subscribe(workspaceId, socket as unknown as WebSocket);
      socket.on("close", unsubscribe);
      socket.on("error", unsubscribe);
    }
  );
}
