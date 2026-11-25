// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import crypto from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { SsoProtocolSchema } from "@imladris/shared";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { AppDb } from "../db/client.js";
import { ssoProviders, users } from "../db/schema.js";
import { SESSION_COOKIE_NAME, signSessionToken } from "../auth/jwt.js";
import { hashPassword } from "../auth/password.js";
import { requireAdmin } from "../auth/rbac.js";
import { recordAuditEvent } from "../audit/logger.js";

const CreateSsoProviderBody = z.object({
  name: z.string().min(1).max(80),
  protocol: SsoProtocolSchema,
  enabled: z.boolean().default(true),
  issuerUrl: z.string().max(500).default(""),
  clientId: z.string().max(255).default(""),
  clientSecret: z.string().max(500).default(""),
  scopes: z.string().max(255).default("openid profile email"),
  roleMappingJson: z.string().max(4000).default("{}"),
});

const PatchSsoProviderBody = CreateSsoProviderBody.partial();

interface OidcDiscovery {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
}

async function discoverEndpoints(
  protocol: string,
  issuerUrl: string
): Promise<OidcDiscovery> {
  if (protocol === "orcid") {
    const base = issuerUrl.replace(/\/+$/, "") || "https://orcid.org";
    return {
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/oauth/token`,
      userinfo_endpoint: `${base}/oauth/userinfo`,
    };
  }
  const wellKnown = `${issuerUrl.replace(/\/+$/, "")}/.well-known/openid-configuration`;
  const resp = await fetch(wellKnown, { signal: AbortSignal.timeout(8000) });
  if (!resp.ok) {
    throw new Error(`OIDC discovery failed (${resp.status})`);
  }
  return (await resp.json()) as OidcDiscovery;
}

export async function registerSsoRoutes(
  app: FastifyInstance,
  db: AppDb,
  config: AppConfig
): Promise<void> {
  app.get("/api/auth/providers", async (_req, reply) => {
    const rows = await db
      .select({
        id: ssoProviders.id,
        name: ssoProviders.name,
        protocol: ssoProviders.protocol,
      })
      .from(ssoProviders)
      .where(eq(ssoProviders.enabled, true))
      .orderBy(desc(ssoProviders.createdAt));

    return reply.send({ providers: rows });
  });

  app.get("/api/admin/sso/providers", async (req, reply) => {
    const admin = await requireAdmin(req, reply, db, config);
    if (!admin) return;
    const rows = await db
      .select({
        id: ssoProviders.id,
        name: ssoProviders.name,
        protocol: ssoProviders.protocol,
        enabled: ssoProviders.enabled,
        issuerUrl: ssoProviders.issuerUrl,
        clientId: ssoProviders.clientId,
        scopes: ssoProviders.scopes,
        roleMappingJson: ssoProviders.roleMappingJson,
        createdAt: ssoProviders.createdAt,
      })
      .from(ssoProviders)
      .orderBy(desc(ssoProviders.createdAt));

    return reply.send({
      providers: rows.map((r) => ({ ...r, enabled: Boolean(r.enabled) })),
    });
  });

  app.post("/api/admin/sso/providers", async (req, reply) => {
    const admin = await requireAdmin(req, reply, db, config);
    if (!admin) return;
    const parsed = CreateSsoProviderBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid SSO provider payload" });
    }
    const id = crypto.randomUUID();
    const createdAt = Date.now();
    await db.insert(ssoProviders).values({
      id,
      name: parsed.data.name.trim(),
      protocol: parsed.data.protocol,
      enabled: parsed.data.enabled,
      issuerUrl: parsed.data.issuerUrl.trim(),
      clientId: parsed.data.clientId.trim(),
      clientSecret: parsed.data.clientSecret,
      scopes: parsed.data.scopes.trim(),
      roleMappingJson: parsed.data.roleMappingJson,
      createdAt,
    });
    await recordAuditEvent(db, {
      userId: admin.id,
      action: "sso_provider_created",
      targetPath: id,
      payload: { name: parsed.data.name, protocol: parsed.data.protocol },
    });
    return reply.code(201).send({
      provider: {
        id,
        name: parsed.data.name.trim(),
        protocol: parsed.data.protocol,
        enabled: parsed.data.enabled,
        issuerUrl: parsed.data.issuerUrl.trim(),
        clientId: parsed.data.clientId.trim(),
        scopes: parsed.data.scopes.trim(),
        roleMappingJson: parsed.data.roleMappingJson,
        createdAt,
      },
    });
  });

  app.patch<{ Params: { id: string } }>(
    "/api/admin/sso/providers/:id",
    async (req, reply) => {
      const admin = await requireAdmin(req, reply, db, config);
      if (!admin) return;
      const parsed = PatchSsoProviderBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid SSO update payload" });
      }
      await db
        .update(ssoProviders)
        .set(parsed.data)
        .where(eq(ssoProviders.id, req.params.id));
      return reply.send({ ok: true });
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/api/admin/sso/providers/:id",
    async (req, reply) => {
      const admin = await requireAdmin(req, reply, db, config);
      if (!admin) return;
      await db.delete(ssoProviders).where(eq(ssoProviders.id, req.params.id));
      return reply.send({ deleted: true });
    }
  );

  app.get<{ Params: { providerId: string } }>(
    "/api/auth/sso/:providerId/start",
    async (req, reply) => {
      const [provider] = await db
        .select()
        .from(ssoProviders)
        .where(eq(ssoProviders.id, req.params.providerId))
        .limit(1);
      if (!provider || !provider.enabled) {
        return reply.code(404).send({ error: "SSO provider not found or disabled" });
      }
      if (provider.protocol !== "oidc" && provider.protocol !== "orcid") {
        return reply.code(400).send({
          error: `Protocol ${provider.protocol.toUpperCase()} requires IdP-initiated assertion or LDAP bind`,
        });
      }
      const discovery = await discoverEndpoints(provider.protocol, provider.issuerUrl);
      const state = crypto.randomBytes(16).toString("hex");
      const redirectUri = `${config.publicUrl.replace(/\/+$/, "")}/api/auth/sso/${provider.id}/callback`;
      const authUrl = new URL(discovery.authorization_endpoint);
      authUrl.searchParams.set("client_id", provider.clientId);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", provider.scopes || "openid profile email");
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("state", state);

      reply.setCookie("imladris_sso_state", state, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: req.protocol === "https",
        maxAge: 600,
      });
      return reply.redirect(authUrl.toString());
    }
  );

  app.get<{
    Params: { providerId: string };
    Querystring: { code?: string; state?: string };
  }>("/api/auth/sso/:providerId/callback", async (req, reply) => {
    const { code, state } = req.query;
    const expectedState = req.cookies?.imladris_sso_state;
    if (!code || !state || !expectedState || state !== expectedState) {
      return reply.code(400).send({ error: "Invalid SSO callback state" });
    }

    const [provider] = await db
      .select()
      .from(ssoProviders)
      .where(eq(ssoProviders.id, req.params.providerId))
      .limit(1);
    if (!provider || !provider.enabled) {
      return reply.code(404).send({ error: "SSO provider not available" });
    }

    const discovery = await discoverEndpoints(provider.protocol, provider.issuerUrl);
    const redirectUri = `${config.publicUrl.replace(/\/+$/, "")}/api/auth/sso/${provider.id}/callback`;

    const tokenResp = await fetch(discovery.token_endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: provider.clientId,
        client_secret: provider.clientSecret,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!tokenResp.ok) {
      return reply.code(401).send({ error: "SSO token exchange failed" });
    }

    const tokenData = (await tokenResp.json()) as {
      access_token?: string;
      orcid?: string;
      name?: string;
    };
    let profile: Record<string, unknown> = {};
    if (discovery.userinfo_endpoint && tokenData.access_token) {
      const uiResp = await fetch(discovery.userinfo_endpoint, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
        signal: AbortSignal.timeout(8000),
      });
      if (uiResp.ok) {
        profile = (await uiResp.json()) as Record<string, unknown>;
      }
    }

    const sub = String(profile.sub ?? tokenData.orcid ?? "");
    const rawEmail = String(
      profile.email ?? (tokenData.orcid ? `${tokenData.orcid}@orcid.org` : "")
    )
      .trim()
      .toLowerCase();
    const displayName = String(
      profile.name ?? profile.given_name ?? tokenData.name ?? rawEmail.split("@")[0] ?? "Researcher"
    );
    if (!sub || !rawEmail) {
      return reply.code(400).send({ error: "SSO provider did not return subject/email" });
    }

    let [existing] = await db
      .select()
      .from(users)
      .where(eq(users.email, rawEmail))
      .limit(1);

    if (existing?.disabled) {
      return reply.code(403).send({ error: "Account is disabled" });
    }

    if (!existing) {
      const id = crypto.randomUUID();
      const randomSecret = crypto.randomBytes(24).toString("hex");
      const passwordHash = await hashPassword(randomSecret);
      await db.insert(users).values({
        id,
        email: rawEmail,
        displayName,
        passwordHash,
        avatarColor: "#3584e4",
        systemRole: "USER",
        accessLevel: "FULL",
        disabled: false,
        authProvider: provider.protocol,
        externalSubject: sub,
        createdAt: Date.now(),
      });
      [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    }

    if (!existing) {
      return reply.code(500).send({ error: "Failed to provision SSO user" });
    }

    const jwt = await signSessionToken(
      { sub: existing.id, email: existing.email, displayName: existing.displayName },
      config.jwtSecret
    );
    reply.clearCookie("imladris_sso_state", { path: "/" });
    reply.setCookie(SESSION_COOKIE_NAME, jwt, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: req.protocol === "https",
      maxAge: 60 * 60 * 24 * 7,
    });
    await recordAuditEvent(db, {
      userId: existing.id,
      action: "sso_login",
      payload: { providerId: provider.id, protocol: provider.protocol },
    });
    return reply.redirect("/");
  });
}
