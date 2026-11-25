// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState, type FormEvent } from "react";
import type { SsoProviderPublic, User } from "@imladris/shared";
import {
  api,
  getConfiguredServerUrl,
  setConfiguredServerUrl,
} from "../lib/api";

interface Props {
  onAuthenticated: (user: User) => void;
}

export function AuthGate({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [serverUrl, setServerUrl] = useState(getConfiguredServerUrl);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [ssoProviders, setSsoProviders] = useState<SsoProviderPublic[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api.listAuthProviders().then((res) => setSsoProviders(res.providers));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      setConfiguredServerUrl(serverUrl);
      const resp =
        mode === "login"
          ? await api.login(email, password)
          : await api.register(
              email,
              displayName,
              password,
              inviteToken.trim() || undefined
            );
      onAuthenticated(resp.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleBrowserStandalone() {
    setBusy(true);
    try {
      const resp = await api.enterStandaloneMode();
      onAuthenticated(resp.user);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="flex h-full w-full items-center justify-center p-6"
      style={{ backgroundColor: "var(--bg-window)" }}
    >
      <div
        className="w-full max-w-md rounded-xl p-6 shadow-lg"
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <div className="mb-4 flex items-center gap-3">
          <img
            src="./favicon.svg"
            alt="Imladris on Web"
            className="h-9 w-9 shrink-0"
          />
          <div>
            <h1 className="text-xl font-semibold leading-tight">Imladris on Web</h1>
            <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
              Collaborative Scientific Authoring &amp; Execution Studio
            </p>
          </div>
        </div>

        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => setMode("login")}
            className="flex-1 rounded-lg px-3 py-1.5 text-xs font-medium"
            style={{
              backgroundColor: mode === "login" ? "var(--accent)" : "var(--bg-sidebar)",
              color: mode === "login" ? "var(--accent-fg)" : "var(--fg-primary)",
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setMode("register")}
            className="flex-1 rounded-lg px-3 py-1.5 text-xs font-medium"
            style={{
              backgroundColor: mode === "register" ? "var(--accent)" : "var(--bg-sidebar)",
              color: mode === "register" ? "var(--accent-fg)" : "var(--fg-primary)",
            }}
          >
            Create Account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="auth-server-url" className="mb-1 block text-xs font-medium">
              Server URL <span style={{ color: "var(--fg-muted)" }}>(leave blank for same-origin)</span>
            </label>
            <input
              id="auth-server-url"
              type="url"
              autoComplete="url"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="https://imladris.example.org"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                backgroundColor: "var(--bg-window)",
                border: "1px solid var(--border-subtle)",
              }}
            />
          </div>

          {mode === "register" && (
            <div>
              <label htmlFor="auth-display-name" className="mb-1 block text-xs font-medium">Display Name</label>
              <input
                id="auth-display-name"
                type="text"
                autoComplete="name"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ada Lovelace"
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{
                  backgroundColor: "var(--bg-window)",
                  border: "1px solid var(--border-subtle)",
                }}
              />
            </div>
          )}

          <div>
            <label htmlFor="auth-email" className="mb-1 block text-xs font-medium">Email</label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              spellCheck={false}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="researcher@example.org"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                backgroundColor: "var(--bg-window)",
                border: "1px solid var(--border-subtle)",
              }}
            />
          </div>

          <div>
            <label htmlFor="auth-password" className="mb-1 block text-xs font-medium">Password</label>
            <input
              id="auth-password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                backgroundColor: "var(--bg-window)",
                border: "1px solid var(--border-subtle)",
              }}
            />
          </div>

          {mode === "register" && (
            <div>
              <label htmlFor="auth-invite-token" className="mb-1 block text-xs font-medium">
                Invite Token <span style={{ color: "var(--fg-muted)" }}>(optional)</span>
              </label>
              <input
                id="auth-invite-token"
                type="text"
                autoComplete="off"
                value={inviteToken}
                onChange={(e) => setInviteToken(e.target.value)}
                placeholder="Paste workspace invite token"
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{
                  backgroundColor: "var(--bg-window)",
                  border: "1px solid var(--border-subtle)",
                }}
              />
            </div>
          )}

          {error && (
            <div className="rounded-lg px-3 py-2 text-xs" style={{ color: "var(--danger)" }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
            style={{
              backgroundColor: "var(--accent)",
              color: "var(--accent-fg)",
            }}
          >
            {busy
              ? "Please wait..."
              : mode === "login"
                ? "Sign In to Server"
                : "Register & Continue"}
          </button>
        </form>

        <div
          className="mt-4 space-y-2 border-t pt-4"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          {ssoProviders.map((prov) => (
            <a
              key={prov.id}
              href={api.getSsoStartUrl(prov.id)}
              className="ui-control flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold"
            >
              <span>
                {prov.protocol === "orcid" ? "ORCID" : prov.protocol.toUpperCase()}
              </span>
              <span>Sign in with {prov.name}</span>
            </a>
          ))}
          <button
            type="button"
            onClick={handleBrowserStandalone}
            disabled={busy}
            className="ui-control w-full rounded-lg px-4 py-2 text-xs font-medium"
          >
            Open Browser Workspace (Offline / No Server)
          </button>
        </div>
      </div>
    </div>
  );
}
