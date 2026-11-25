// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../server.js";

describe("@imladris/api Review, Git/Archive, Hub, Departments & HPC", () => {
  let built: BuiltApp;
  let tmpDir: string;
  let adminCookie = "";
  let workspaceId = "";

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "imladris-hub-test-"));
    built = await buildApp({
      databaseUrl: ":memory:",
      workspacesRoot: path.join(tmpDir, "workspaces"),
      jwtSecret: "test-jwt-secret-must-be-at-least-32-characters-long",
      runnerSharedSecret: "test-runner-secret-must-be-16chars",
      adminEmail: "lead@lab.org",
      adminPassword: "LeadPassword123!",
      adminDisplayName: "Dr. Lead",
      airGappedMode: true,
    });

    const loginRes = await built.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "lead@lab.org", password: "LeadPassword123!" },
    });
    adminCookie = String(loginRes.headers["set-cookie"]).split(";")[0]!;

    const wsRes = await built.app.inject({
      method: "POST",
      url: "/api/workspaces",
      headers: { cookie: adminCookie },
      payload: { name: "Oncology Manuscript" },
    });
    workspaceId = wsRes.json().workspace.id;
  });

  afterAll(async () => {
    await built.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("creates double-blind review links and anonymizes manuscript output", async () => {
    await built.app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/files`,
      headers: { cookie: adminCookie },
      payload: {
        path: "paper.qmd",
        content: "---\ntitle: Trial\nauthor: Dr. Lead\n---\nBody text",
      },
    });

    const linkRes = await built.app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/review-links`,
      headers: { cookie: adminCookie },
      payload: { label: "Referee 1", blindAuthors: true, expiresInHours: 48 },
    });
    expect(linkRes.statusCode).toBe(201);
    const token = linkRes.json().link.token;

    const viewRes = await built.app.inject({
      method: "GET",
      url: `/api/review/${token}`,
    });
    expect(viewRes.statusCode).toBe(200);
    expect(viewRes.json().workspaceName).toBe("Anonymized Manuscript");
    const paper = viewRes.json().files.find((f: { path: string }) => f.path === "paper.qmd");
    expect(paper.content).toContain("Anonymous (Double-Blind Review)");
  });

  it("commits workspace to Git and creates a .mallorn.json archival deposit", async () => {
    const commitRes = await built.app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/git/sync`,
      headers: { cookie: adminCookie },
      payload: { action: "commit", message: "Initial manuscript commit" },
    });
    expect(commitRes.statusCode).toBe(200);
    expect(commitRes.json().commitHash).toBeTruthy();

    const depositRes = await built.app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/archive/deposit`,
      headers: { cookie: adminCookie },
      payload: {
        provider: "zenodo-sandbox",
        title: "Oncology Dataset & Paper",
        description: "Reproducible bundle",
      },
    });
    expect(depositRes.statusCode).toBe(201);
    expect(depositRes.json().archiveFileName).toMatch(/\.mallorn\.json$/);
  });

  it("instantiates institutional templates and syncs Zotero cache", async () => {
    const tpls = await built.app.inject({
      method: "GET",
      url: "/api/hub/templates",
      headers: { cookie: adminCookie },
    });
    expect(tpls.statusCode).toBe(200);
    expect(tpls.json().templates.length).toBeGreaterThanOrEqual(3);

    const instRes = await built.app.inject({
      method: "POST",
      url: "/api/hub/templates/tpl-ich-e9-sap/instantiate",
      headers: { cookie: adminCookie },
      payload: { name: "Phase III SAP" },
    });
    expect(instRes.statusCode).toBe(201);
    expect(instRes.json().workspace.name).toBe("Phase III SAP");

    const zotRes = await built.app.inject({
      method: "POST",
      url: "/api/hub/zotero/sync",
      headers: { cookie: adminCookie },
      payload: {
        name: "Biostats Group",
        groupId: "998877",
        bibtexFallback: "@article{demo2026, title={Demo}}",
      },
    });
    expect(zotRes.statusCode).toBe(201);
  });

  it("creates departments and queues HPC/GPU batch jobs", async () => {
    const deptRes = await built.app.inject({
      method: "POST",
      url: "/api/departments",
      headers: { cookie: adminCookie },
      payload: { name: "Bioinformatics Dept", quotaMb: 51200 },
    });
    expect(deptRes.statusCode).toBe(201);
    expect(deptRes.json().department.quotaMb).toBe(51200);

    const jobRes = await built.app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/hpc/submit`,
      headers: { cookie: adminCookie },
      payload: {
        engine: "python",
        target: "gpu-a100",
        code: "print('GPU job')",
      },
    });
    expect(jobRes.statusCode).toBe(202);
    const jobId = jobRes.json().job.id;

    const cancelRes = await built.app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/hpc/jobs/${jobId}/cancel`,
      headers: { cookie: adminCookie },
    });
    expect(cancelRes.statusCode).toBe(200);
    expect(cancelRes.json().status).toBe("CANCELLED");
  });
});
