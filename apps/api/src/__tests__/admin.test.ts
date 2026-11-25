// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../server.js";

describe("@imladris/api Admin Panel & Access Control", () => {
  let built: BuiltApp;
  let tmpDir: string;
  let adminCookie = "";
  let createdUserId = "";
  let workspaceId = "";

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "imladris-admin-test-"));
    built = await buildApp({
      databaseUrl: ":memory:",
      workspacesRoot: path.join(tmpDir, "workspaces"),
      jwtSecret: "test-jwt-secret-must-be-at-least-32-characters-long",
      runnerSharedSecret: "test-runner-secret-must-be-16chars",
      adminEmail: "admin@lab.org",
      adminPassword: "AdminPassword123!",
      adminDisplayName: "Lab Admin",
    });
  });

  afterAll(async () => {
    await built.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("logs in seeded admin and creates a workspace", async () => {
    const loginRes = await built.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "admin@lab.org", password: "AdminPassword123!" },
    });
    expect(loginRes.statusCode).toBe(200);
    expect(loginRes.json().user.systemRole).toBe("ADMIN");
    const setCookie = loginRes.headers["set-cookie"];
    adminCookie = Array.isArray(setCookie)
      ? (setCookie[0] ?? "").split(";")[0]!
      : (setCookie ?? "").split(";")[0]!;

    const wsRes = await built.app.inject({
      method: "POST",
      url: "/api/workspaces",
      headers: { cookie: adminCookie },
      payload: { name: "Genomics Study", kernelMode: "SHARED" },
    });
    expect(wsRes.statusCode).toBe(201);
    workspaceId = wsRes.json().workspace.id;
  });

  it("allows admin to create a user with REVIEWER access and workspace membership", async () => {
    const createRes = await built.app.inject({
      method: "POST",
      url: "/api/admin/users",
      headers: { cookie: adminCookie },
      payload: {
        email: "reviewer@lab.org",
        displayName: "Peer Reviewer",
        password: "ReviewerPass123!",
        systemRole: "USER",
        accessLevel: "REVIEWER",
        workspaceId,
        workspaceRole: "EDITOR",
      },
    });
    expect(createRes.statusCode).toBe(201);
    createdUserId = createRes.json().user.id;
    expect(createRes.json().user.accessLevel).toBe("REVIEWER");

    const userLogin = await built.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "reviewer@lab.org", password: "ReviewerPass123!" },
    });
    expect(userLogin.statusCode).toBe(200);
    const userCookie = String(userLogin.headers["set-cookie"]).split(";")[0]!;

    // Non-admin cannot access admin endpoints
    const forbiddenAdmin = await built.app.inject({
      method: "GET",
      url: "/api/admin/users",
      headers: { cookie: userCookie },
    });
    expect(forbiddenAdmin.statusCode).toBe(403);

    // REVIEWER global access level cannot create workspaces or write files
    const createWsDenied = await built.app.inject({
      method: "POST",
      url: "/api/workspaces",
      headers: { cookie: userCookie },
      payload: { name: "Unauthorized WS" },
    });
    expect(createWsDenied.statusCode).toBe(403);

    const writeFileDenied = await built.app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/files`,
      headers: { cookie: userCookie },
      payload: { path: "notes.md", content: "blocked" },
    });
    expect(writeFileDenied.statusCode).toBe(403);
  });

  it("allows admin to disable and re-enable a user", async () => {
    const disableRes = await built.app.inject({
      method: "PATCH",
      url: `/api/admin/users/${createdUserId}`,
      headers: { cookie: adminCookie },
      payload: { disabled: true },
    });
    expect(disableRes.statusCode).toBe(200);
    expect(disableRes.json().user.disabled).toBe(true);

    const blockedLogin = await built.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "reviewer@lab.org", password: "ReviewerPass123!" },
    });
    expect(blockedLogin.statusCode).toBe(403);

    const enableRes = await built.app.inject({
      method: "PATCH",
      url: `/api/admin/users/${createdUserId}`,
      headers: { cookie: adminCookie },
      payload: { disabled: false, accessLevel: "FULL" },
    });
    expect(enableRes.statusCode).toBe(200);
    expect(enableRes.json().user.disabled).toBe(false);
    expect(enableRes.json().user.accessLevel).toBe("FULL");
  });
});
