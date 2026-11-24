// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

export interface AppConfig {
  mode: "local" | "vps";
  authMode: "local" | "team";
  registrationMode: "open" | "invite" | "closed";
  allowedEmailDomains: string[];
  airGappedMode: boolean;
  publicUrl: string;
  jwtSecret: string;
  runnerSharedSecret: string;
  databaseUrl: string;
  workspacesRoot: string;
  runnerUrl: string;
  runnerExecTimeoutMs: number;
  aiLocalUrl: string;
  aiAllowCloud: boolean;
  port: number;
  host: string;
}

const DEFAULT_DEV_JWT = "imladris-dev-jwt-secret-change-in-production-32chars";
const DEFAULT_DEV_RUNNER = "imladris-dev-runner-secret-change-in-prod";

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const mode = process.env.IMLADRIS_MODE === "vps" ? "vps" : "local";
  const authMode = process.env.AUTH_MODE === "team" ? "team" : "local";
  const rawReg = process.env.REGISTRATION_MODE;
  const registrationMode: "open" | "invite" | "closed" =
    rawReg === "closed" || rawReg === "invite" || rawReg === "open"
      ? rawReg
      : mode === "vps"
        ? "invite"
        : "open";
  const allowedEmailDomains = (process.env.ALLOWED_EMAIL_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  const airGappedMode = process.env.AIR_GAPPED_MODE === "true";
  const publicUrl = process.env.PUBLIC_URL ?? "http://localhost:8080";
  const jwtSecret = process.env.JWT_SECRET ?? DEFAULT_DEV_JWT;
  const runnerSharedSecret = process.env.RUNNER_SHARED_SECRET ?? DEFAULT_DEV_RUNNER;
  const databaseUrl = process.env.DATABASE_URL ?? "file:/data/db/imladris.sqlite";
  const workspacesRoot = process.env.WORKSPACES_ROOT ?? "/data/workspaces";
  const runnerUrl = process.env.RUNNER_URL ?? "http://imladris-runner:9000";
  const runnerExecTimeoutMs = Number.parseInt(
    process.env.RUNNER_EXEC_TIMEOUT_MS ?? "60000",
    10
  );
  const aiLocalUrl = process.env.AI_LOCAL_URL ?? "http://imladris-ollama:11434";
  const aiAllowCloud = !airGappedMode && process.env.AI_ALLOW_CLOUD === "true";
  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  const host = process.env.HOST ?? "0.0.0.0";

  const resolved: AppConfig = {
    mode,
    authMode,
    registrationMode,
    allowedEmailDomains,
    airGappedMode,
    publicUrl,
    jwtSecret,
    runnerSharedSecret,
    databaseUrl,
    workspacesRoot,
    runnerUrl,
    runnerExecTimeoutMs: Number.isFinite(runnerExecTimeoutMs) ? runnerExecTimeoutMs : 60000,
    aiLocalUrl,
    aiAllowCloud,
    port: Number.isFinite(port) ? port : 3000,
    host,
    ...overrides,
  };

  if (resolved.mode === "vps") {
    const insecureSecrets = new Set([
      DEFAULT_DEV_JWT,
      DEFAULT_DEV_RUNNER,
      "change-me-in-production-32-chars",
      "change-me-runner-secret",
    ]);
    if (insecureSecrets.has(resolved.jwtSecret) || resolved.jwtSecret.length < 24) {
      throw new Error(
        "IMLADRIS_MODE=vps requires a strong JWT_SECRET (>= 24 chars, not a default placeholder)"
      );
    }
    if (
      insecureSecrets.has(resolved.runnerSharedSecret) ||
      resolved.runnerSharedSecret.length < 16
    ) {
      throw new Error(
        "IMLADRIS_MODE=vps requires a strong RUNNER_SHARED_SECRET (>= 16 chars, not a default placeholder)"
      );
    }
  }

  return resolved;
}
