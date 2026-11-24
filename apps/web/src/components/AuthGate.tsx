// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import { useState, type FormEvent } from "react";
import type { User } from "@imladris/shared";
import { api } from "../lib/api";

interface Props {
  onAuthenticated: (user: User) => void;
}

export function AuthGate({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
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
        <h1 className="mb-1 text-xl font-semibold">Imladris on Web</h1>
        <p className="mb-5 text-xs" style={{ color: "var(--fg-muted)" }}>
          Collaborative Scientific Authoring &amp; Execution Studio
        </p>

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
          {mode === "register" && (
            <div>
              <label className="mb-1 block text-xs font-medium">Display Name</label>
              <input
                type="text"
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
            <label className="mb-1 block text-xs font-medium">Email</label>
            <input
              type="email"
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
            <label className="mb-1 block text-xs font-medium">Password</label>
            <input
              type="password"
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
              <label className="mb-1 block text-xs font-medium">
                Invite Token <span style={{ color: "var(--fg-muted)" }}>(optional, required on invite-only servers)</span>
              </label>
              <input
                type="text"
                value={inviteToken}
                onChange={(e) => setInviteToken(e.target.value)}
                placeholder="Paste workspace invite token if provided"
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
                ? "Sign In to Workbench"
                : "Register & Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
