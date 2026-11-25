// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../server.js";

describe("@imladris/api SSO, Classroom, Toolchains & 21 CFR Part 11", () => {
  let built: BuiltApp;
  let tmpDir: string;
  let adminCookie = "";
  let workspaceId = "";

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "imladris-acad-test-"));
    built = await buildApp({
      databaseUrl: ":memory:",
      workspacesRoot: path.join(tmpDir, "workspaces"),
      jwtSecret: "test-jwt-secret-must-be-at-least-32-characters-long",
      runnerSharedSecret: "test-runner-secret-must-be-16chars",
      adminEmail: "prof@uni.edu",
      adminPassword: "ProfPassword123!",
      adminDisplayName: "Prof. Elrond",
    });

    const loginRes = await built.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "prof@uni.edu", password: "ProfPassword123!" },
    });
    adminCookie = String(loginRes.headers["set-cookie"]).split(";")[0]!;

    const wsRes = await built.app.inject({
      method: "POST",
      url: "/api/workspaces",
      headers: { cookie: adminCookie },
      payload: { name: "BIO-401 Template" },
    });
    workspaceId = wsRes.json().workspace.id;
  });

  afterAll(async () => {
    await built.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("configures and lists OIDC & ORCID SSO providers", async () => {
    const createRes = await built.app.inject({
      method: "POST",
      url: "/api/admin/sso/providers",
      headers: { cookie: adminCookie },
      payload: {
        name: "ORCID Researcher ID",
        protocol: "orcid",
        issuerUrl: "https://orcid.org",
        clientId: "APP-1234",
        clientSecret: "secret-xyz",
      },
    });
    expect(createRes.statusCode).toBe(201);

    const publicRes = await built.app.inject({
      method: "GET",
      url: "/api/auth/providers",
    });
    expect(publicRes.statusCode).toBe(200);
    expect(publicRes.json().providers).toHaveLength(1);
    expect(publicRes.json().providers[0].protocol).toBe("orcid");
  });

  it("supports seeded container toolchains and workspace pinning", async () => {
    const listRes = await built.app.inject({
      method: "GET",
      url: "/api/toolchains",
      headers: { cookie: adminCookie },
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().toolchains.length).toBeGreaterThanOrEqual(4);

    const pinRes = await built.app.inject({
      method: "PATCH",
      url: `/api/workspaces/${workspaceId}/toolchain`,
      headers: { cookie: adminCookie },
      payload: { toolchainId: "r-44-bioc" },
    });
    expect(pinRes.statusCode).toBe(200);
    expect(pinRes.json().toolchainId).toBe("r-44-bioc");
  });

  it("creates a course, syncs roster, distributes forks, and grades submissions", async () => {
    const courseRes = await built.app.inject({
      method: "POST",
      url: "/api/classroom/courses",
      headers: { cookie: adminCookie },
      payload: {
        code: "BIO-401",
        title: "Computational Genomics",
        term: "Fall 2026",
        templateWorkspaceId: workspaceId,
      },
    });
    expect(courseRes.statusCode).toBe(201);
    const courseId = courseRes.json().course.id;

    const rosterRes = await built.app.inject({
      method: "POST",
      url: `/api/classroom/courses/${courseId}/roster`,
      headers: { cookie: adminCookie },
      payload: {
        members: [
          { email: "student@uni.edu", displayName: "Ada Student", role: "STUDENT" },
        ],
      },
    });
    expect(rosterRes.statusCode).toBe(200);
    expect(rosterRes.json().enrolled).toBe(1);

    const assignRes = await built.app.inject({
      method: "POST",
      url: `/api/classroom/courses/${courseId}/assignments`,
      headers: { cookie: adminCookie },
      payload: { title: "Lab 1", instructions: "Run survival curve" },
    });
    expect(assignRes.statusCode).toBe(201);
    expect(assignRes.json().forksCreated).toBe(1);

    const listAssignRes = await built.app.inject({
      method: "GET",
      url: `/api/classroom/courses/${courseId}/assignments`,
      headers: { cookie: adminCookie },
    });
    const subId = listAssignRes.json().assignments[0].submissions[0].id;

    const gradeRes = await built.app.inject({
      method: "POST",
      url: `/api/classroom/submissions/${subId}/grade`,
      headers: { cookie: adminCookie },
      payload: { grade: "98/100", feedback: "Excellent analysis" },
    });
    expect(gradeRes.statusCode).toBe(200);
  });

  it("records 21 CFR Part 11 electronic signatures and exports audit CSV", async () => {
    const badSign = await built.app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/signatures`,
      headers: { cookie: adminCookie },
      payload: {
        path: "main.qmd",
        meaning: "QA / GLP Release",
        reason: "Batch check",
        password: "WrongPassword!",
      },
    });
    expect(badSign.statusCode).toBe(401);

    const goodSign = await built.app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/signatures`,
      headers: { cookie: adminCookie },
      payload: {
        path: "main.qmd",
        meaning: "QA / GLP Release",
        reason: "Final verified manuscript",
        password: "ProfPassword123!",
      },
    });
    expect(goodSign.statusCode).toBe(201);
    expect(goodSign.json().signature.sha256Hash).toHaveLength(64);
    expect(goodSign.json().signature.signatureHash).toHaveLength(64);

    const csvRes = await built.app.inject({
      method: "GET",
      url: "/api/admin/audit/export?format=csv",
      headers: { cookie: adminCookie },
    });
    expect(csvRes.statusCode).toBe(200);
    expect(csvRes.body).toContain("document_signed");
  });
});
