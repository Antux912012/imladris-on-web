// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  HocuspocusProvider,
  HocuspocusProviderWebsocket,
} from "@hocuspocus/provider";
import WebSocket from "ws";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { buildApp, type BuiltApp } from "../server.js";

function extractCookie(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers["set-cookie"];
  if (Array.isArray(raw) && raw.length > 0) {
    return String(raw[0]).split(";")[0] ?? "";
  }
  if (typeof raw === "string") {
    return raw.split(";")[0] ?? "";
  }
  return "";
}

function makeWsWithCookie(cookie: string) {
  return class AuthedWebSocket extends WebSocket {
    constructor(address: string, protocols?: string | string[]) {
      super(address, protocols, {
        headers: { cookie },
      });
    }
  };
}

describe("@imladris/api Real-time Collab", () => {
  let tmpRoot: string;
  let built: BuiltApp;
  let baseWsUrl: string;

  beforeAll(async () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "imladris-collab-test-"));
    built = await buildApp({
      databaseUrl: `file:${path.join(tmpRoot, "collab.sqlite")}`,
      workspacesRoot: path.join(tmpRoot, "workspaces"),
      jwtSecret: "test-jwt-secret-key-32-chars-minimum",
      authMode: "team",
    });
    const addr = await built.app.listen({ port: 0, host: "127.0.0.1" });
    baseWsUrl = addr.replace(/^http/, "ws");
  });

  afterAll(async () => {
    await built.close();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("syncs two concurrent Y.Doc clients and persists to disk + snapshots", async () => {
    const ownerReg = await built.app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "collab-owner@example.org",
        displayName: "Collab Owner",
        password: "owner-password-123",
      },
    });
    const ownerCookie = extractCookie(ownerReg);

    const editorReg = await built.app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "collab-editor@example.org",
        displayName: "Collab Editor",
        password: "editor-password-123",
      },
    });
    const editorCookie = extractCookie(editorReg);

    const wsRes = await built.app.inject({
      method: "POST",
      url: "/api/workspaces",
      headers: { cookie: ownerCookie },
      payload: { name: "Collab Paper" },
    });
    const wsId = wsRes.json().workspace.id as string;

    const invRes = await built.app.inject({
      method: "POST",
      url: `/api/workspaces/${wsId}/invites`,
      headers: { cookie: ownerCookie },
      payload: { role: "EDITOR", maxUses: 1 },
    });
    const token = invRes.json().invite.token as string;
    await built.app.inject({
      method: "POST",
      url: `/api/invites/${token}/accept`,
      headers: { cookie: editorCookie },
    });

    const docName = `${wsId}/main.qmd`;
    const url = `${baseWsUrl}/ws/collab/${wsId}/${encodeURIComponent("main.qmd")}`;

    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    const ws1 = new HocuspocusProviderWebsocket({
      url,
      WebSocketPolyfill: makeWsWithCookie(ownerCookie),
    });
    const ws2 = new HocuspocusProviderWebsocket({
      url,
      WebSocketPolyfill: makeWsWithCookie(editorCookie),
    });

    const p1 = new HocuspocusProvider({
      websocketProvider: ws1,
      name: docName,
      document: doc1,
      preserveConnection: false,
    });
    const p2 = new HocuspocusProvider({
      websocketProvider: ws2,
      name: docName,
      document: doc2,
      preserveConnection: false,
    });

    await Promise.all([
      new Promise<void>((resolve) => p1.on("synced", () => resolve())),
      new Promise<void>((resolve) => p2.on("synced", () => resolve())),
    ]);

    const yText1 = doc1.getText("codemirror");
    const yText2 = doc2.getText("codemirror");
    expect(yText1.toString()).toContain("Welcome to **Imladris on Web**");

    yText1.insert(0, "%% Collab Header\n");

    await new Promise<void>((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error("Sync timeout")), 4000);
      const check = () => {
        if (yText2.toString().startsWith("%% Collab Header\n")) {
          clearTimeout(deadline);
          resolve();
        }
      };
      yText2.observe(check);
      check();
    });

    p1.destroy();
    p2.destroy();
    ws1.destroy();
    ws2.destroy();

    // Wait for debounced onStoreDocument (300ms) + disk write
    await new Promise((r) => setTimeout(r, 600));

    const diskContent = fs.readFileSync(
      path.join(tmpRoot, "workspaces", wsId, "main.qmd"),
      "utf8"
    );
    expect(diskContent.startsWith("%% Collab Header\n")).toBe(true);

    const snapRes = await built.app.inject({
      method: "GET",
      url: `/api/workspaces/${wsId}/snapshots?path=main.qmd`,
      headers: { cookie: ownerCookie },
    });
    expect(snapRes.statusCode).toBe(200);
    expect(snapRes.json().snapshots.length).toBeGreaterThanOrEqual(1);
  });

  it("delivers workspace events over /ws/events/:workspaceId", async () => {
    const userReg = await built.app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "events-user@example.org",
        displayName: "Events User",
        password: "events-password-123",
      },
    });
    const cookie = extractCookie(userReg);

    const wsRes = await built.app.inject({
      method: "POST",
      url: "/api/workspaces",
      headers: { cookie },
      payload: { name: "Events WS" },
    });
    const wsId = wsRes.json().workspace.id as string;

    const wsClient = new WebSocket(`${baseWsUrl}/ws/events/${wsId}`, {
      headers: { cookie },
    });

    const received = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Event timeout")), 3000);
      wsClient.on("message", (data) => {
        clearTimeout(timer);
        resolve(data.toString());
      });
      wsClient.on("open", () => {
        built.eventBus.publish(wsId, {
          type: "stdout",
          payload: { chunk: "Hello from kernel" },
        });
      });
    });

    const rawMsg = await received;
    const parsed = JSON.parse(rawMsg);
    expect(parsed.type).toBe("stdout");
    expect(parsed.payload.chunk).toBe("Hello from kernel");
    wsClient.close();
  });
});
