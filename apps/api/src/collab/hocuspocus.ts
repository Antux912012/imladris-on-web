// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import { Hocuspocus } from "@hocuspocus/server";
import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import type { AppConfig } from "../config.js";
import type { AppDb } from "../db/client.js";
import { SESSION_COOKIE_NAME, verifySessionToken } from "../auth/jwt.js";
import { getMemberRole, hasPermission } from "../auth/rbac.js";
import { resolveSafeWorkspacePath } from "../routes/files.js";
import type { WorkspaceEventBus } from "../ws/events.js";
import { loadDocumentToYDoc, persistYDocToDiskAndSnapshot } from "./disk-sync.js";

function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = decodeURIComponent(part.slice(idx + 1).trim());
    if (k) result[k] = v;
  }
  return result;
}

interface CollabContext {
  workspaceId: string;
  relPath: string;
  userId?: string;
}

function extractTarget(
  documentName: string,
  context: unknown
): { workspaceId: string; relPath: string } {
  const ctx = context as Partial<CollabContext> | undefined;
  if (ctx?.workspaceId && ctx?.relPath) {
    return { workspaceId: ctx.workspaceId, relPath: ctx.relPath };
  }
  const slashIdx = documentName.indexOf("/");
  if (slashIdx <= 0) {
    throw new Error(`Invalid document name: ${documentName}`);
  }
  return {
    workspaceId: documentName.slice(0, slashIdx),
    relPath: documentName.slice(slashIdx + 1),
  };
}

export function createHocuspocusServer(
  db: AppDb,
  config: AppConfig,
  bus: WorkspaceEventBus
): Hocuspocus {
  return new Hocuspocus({
    debounce: 300,
    maxDebounce: 1000,
    async onConnect(data) {
      const cookies = parseCookieHeader(data.requestHeaders.cookie);
      const token = cookies[SESSION_COOKIE_NAME];
      if (!token) {
        throw new Error("Authentication required");
      }
      const payload = await verifySessionToken(token, config.jwtSecret);
      if (!payload) {
        throw new Error("Invalid session token");
      }

      const { workspaceId, relPath } = extractTarget(data.documentName, data.context);
      resolveSafeWorkspacePath(config.workspacesRoot, workspaceId, relPath);

      const role = await getMemberRole(db, workspaceId, payload.sub);
      if (!role || !hasPermission(role, "read")) {
        throw new Error("Workspace access denied");
      }

      data.connection.readOnly = !hasPermission(role, "edit");
      const ctx: CollabContext = {
        workspaceId,
        relPath,
        userId: payload.sub,
      };
      Object.assign(data.context as Record<string, unknown>, ctx);
      return ctx;
    },
    async onLoadDocument(data) {
      const { workspaceId, relPath } = extractTarget(data.documentName, data.context);
      await loadDocumentToYDoc(
        db,
        config.workspacesRoot,
        workspaceId,
        relPath,
        data.document
      );
    },
    async onStoreDocument(data) {
      const { workspaceId, relPath } = extractTarget(data.documentName, data.context);
      const ctx = data.context as Partial<CollabContext> | undefined;
      await persistYDocToDiskAndSnapshot(
        db,
        config.workspacesRoot,
        workspaceId,
        relPath,
        data.document,
        ctx?.userId ?? null,
        bus
      );
    },
  });
}

export function disconnectUserFromCollab(
  hocuspocus: Hocuspocus,
  workspaceId: string,
  userId: string
): void {
  const prefix = `${workspaceId}/`;
  for (const [docName, document] of hocuspocus.documents.entries()) {
    if (!docName.startsWith(prefix)) continue;
    for (const conn of document.connections.values()) {
      const ctx = conn.connection.context as Partial<CollabContext> | undefined;
      if (ctx?.userId === userId) {
        conn.connection.close({ code: 4003, reason: "Workspace permissions changed" });
      }
    }
  }
}

export async function registerCollabRoutes(
  app: FastifyInstance,
  hocuspocus: Hocuspocus
): Promise<void> {
  app.get(
    "/ws/collab/:workspaceId/:encodedRelPath",
    { websocket: true },
    (socket, req) => {
      const { workspaceId, encodedRelPath } = req.params as {
        workspaceId: string;
        encodedRelPath: string;
      };
      const relPath = decodeURIComponent(encodedRelPath);
      hocuspocus.handleConnection(
        socket as unknown as WebSocket,
        req.raw,
        { workspaceId, relPath } satisfies CollabContext
      );
    }
  );
}
