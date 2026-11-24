// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../server.js";

describe("@imladris/api Core", () => {
  let tmpRoot: string;
  let built: BuiltApp;

  beforeAll(async () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "imladris-api-test-"));
    built = await buildApp({
      databaseUrl: `file:${path.join(tmpRoot, "test.sqlite")}`,
      workspacesRoot: path.join(tmpRoot, "workspaces"),
      jwtSecret: "test-jwt-secret-key-32-chars-minimum",
      authMode: "team",
    });
  });

  afterAll(async () => {
    await built.close();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

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

  it("registers, logs in, reads /me, and logs out", async () => {
    const regRes = await built.app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "alice@example.org",
        displayName: "Alice",
        password: "strong-password-123",
      },
    });
    expect(regRes.statusCode).toBe(201);
    const cookie = extractCookie(regRes);
    expect(cookie).toContain("imladris_session=");

    const meRes = await built.app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie },
    });
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json().user.email).toBe("alice@example.org");

    const badLogin = await built.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "alice@example.org", password: "wrong" },
    });
    expect(badLogin.statusCode).toBe(401);

    const okLogin = await built.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "alice@example.org", password: "strong-password-123" },
    });
    expect(okLogin.statusCode).toBe(200);
  });

  it("enforces RBAC across OWNER, VIEWER, and EDITOR and blocks path traversal", async () => {
    const ownerReg = await built.app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "owner@example.org",
        displayName: "Owner",
        password: "owner-password-123",
      },
    });
    const ownerCookie = extractCookie(ownerReg);

    const viewerReg = await built.app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "viewer@example.org",
        displayName: "Viewer",
        password: "viewer-password-123",
      },
    });
    const viewerCookie = extractCookie(viewerReg);

    const wsRes = await built.app.inject({
      method: "POST",
      url: "/api/workspaces",
      headers: { cookie: ownerCookie },
      payload: { name: "Paper Draft" },
    });
    expect(wsRes.statusCode).toBe(201);
    const wsId = wsRes.json().workspace.id as string;

    // Owner creates VIEWER invite
    const invRes = await built.app.inject({
      method: "POST",
      url: `/api/workspaces/${wsId}/invites`,
      headers: { cookie: ownerCookie },
      payload: { role: "VIEWER", maxUses: 2 },
    });
    expect(invRes.statusCode).toBe(201);
    const token = invRes.json().invite.token as string;

    // Viewer accepts invite
    const accRes = await built.app.inject({
      method: "POST",
      url: `/api/invites/${token}/accept`,
      headers: { cookie: viewerCookie },
    });
    expect(accRes.statusCode).toBe(200);
    expect(accRes.json().role).toBe("VIEWER");

    // Viewer can list files
    const listRes = await built.app.inject({
      method: "GET",
      url: `/api/workspaces/${wsId}/files`,
      headers: { cookie: viewerCookie },
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().files.some((f: { relPath: string }) => f.relPath === "main.qmd")).toBe(true);

    // Viewer cannot write or delete
    const writeByViewer = await built.app.inject({
      method: "POST",
      url: `/api/workspaces/${wsId}/files`,
      headers: { cookie: viewerCookie },
      payload: { path: "hacked.qmd", content: "nope" },
    });
    expect(writeByViewer.statusCode).toBe(403);

    // Owner writes a file
    const writeByOwner = await built.app.inject({
      method: "POST",
      url: `/api/workspaces/${wsId}/files`,
      headers: { cookie: ownerCookie },
      payload: { path: "notes/intro.md", content: "# Hello" },
    });
    expect(writeByOwner.statusCode).toBe(201);

    // Path traversal is rejected
    const traversal = await built.app.inject({
      method: "POST",
      url: `/api/workspaces/${wsId}/files`,
      headers: { cookie: ownerCookie },
      payload: { path: "../../etc/passwd", content: "bad" },
    });
    expect(traversal.statusCode).toBe(400);

    const traversalRead = await built.app.inject({
      method: "GET",
      url: `/api/workspaces/${wsId}/files/content?path=../secret.txt`,
      headers: { cookie: ownerCookie },
    });
    expect(traversalRead.statusCode).toBe(400);

    // Inline comments: VIEWER is blocked, OWNER/REVIEWER can comment & resolve
    const viewerComment = await built.app.inject({
      method: "POST",
      url: `/api/workspaces/${wsId}/comments`,
      headers: { cookie: viewerCookie },
      payload: { path: "notes/intro.md", anchorLine: 1, anchorQuote: "# Hello", body: "No perm" },
    });
    expect(viewerComment.statusCode).toBe(403);

    const ownerComment = await built.app.inject({
      method: "POST",
      url: `/api/workspaces/${wsId}/comments`,
      headers: { cookie: ownerCookie },
      payload: { path: "notes/intro.md", anchorLine: 1, anchorQuote: "# Hello", body: "Please expand intro" },
    });
    expect(ownerComment.statusCode).toBe(201);
    const threadId = ownerComment.json().thread.id as string;

    const replyRes = await built.app.inject({
      method: "POST",
      url: `/api/workspaces/${wsId}/comments/${threadId}/reply`,
      headers: { cookie: ownerCookie },
      payload: { body: "Will do" },
    });
    expect(replyRes.statusCode).toBe(201);

    const resolveRes = await built.app.inject({
      method: "PATCH",
      url: `/api/workspaces/${wsId}/comments/${threadId}`,
      headers: { cookie: ownerCookie },
      payload: { resolved: true },
    });
    expect(resolveRes.statusCode).toBe(200);
    expect(resolveRes.json().resolved).toBe(true);

    // Git-like revision checkpoint, diff, and restore
    const rev1 = await built.app.inject({
      method: "POST",
      url: `/api/workspaces/${wsId}/revisions`,
      headers: { cookie: ownerCookie },
      payload: { path: "notes/intro.md", message: "Initial draft" },
    });
    expect(rev1.statusCode).toBe(201);
    const revId = rev1.json().revision.id as string;

    await built.app.inject({
      method: "POST",
      url: `/api/workspaces/${wsId}/files`,
      headers: { cookie: ownerCookie },
      payload: { path: "notes/intro.md", content: "# Changed\nNew line" },
    });

    const diffRes = await built.app.inject({
      method: "GET",
      url: `/api/workspaces/${wsId}/snapshots/${revId}`,
      headers: { cookie: ownerCookie },
    });
    expect(diffRes.statusCode).toBe(200);
    expect(diffRes.json().diffAgainstCurrent.some((d: { type: string }) => d.type === "add")).toBe(true);

    const restoreRes = await built.app.inject({
      method: "POST",
      url: `/api/workspaces/${wsId}/snapshots/${revId}/restore`,
      headers: { cookie: ownerCookie },
    });
    expect(restoreRes.statusCode).toBe(200);
    expect(restoreRes.json().content).toBe("# Hello");

    // Member management: list, promote VIEWER -> REVIEWER, then remove
    const membersRes = await built.app.inject({
      method: "GET",
      url: `/api/workspaces/${wsId}/members`,
      headers: { cookie: ownerCookie },
    });
    expect(membersRes.statusCode).toBe(200);
    const viewerMember = membersRes
      .json()
      .members.find((m: { email: string }) => m.email === "viewer@example.org");
    expect(viewerMember).toBeDefined();

    const patchRole = await built.app.inject({
      method: "PATCH",
      url: `/api/workspaces/${wsId}/members/${viewerMember.userId}`,
      headers: { cookie: ownerCookie },
      payload: { role: "REVIEWER" },
    });
    expect(patchRole.statusCode).toBe(200);
    expect(patchRole.json().member.role).toBe("REVIEWER");

    const delMember = await built.app.inject({
      method: "DELETE",
      url: `/api/workspaces/${wsId}/members/${viewerMember.userId}`,
      headers: { cookie: ownerCookie },
    });
    expect(delMember.statusCode).toBe(200);
  });
});
