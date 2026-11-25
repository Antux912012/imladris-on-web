// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { ElectronicSignature } from "@imladris/shared";
import { FileSignature, ShieldCheck, X } from "lucide-react";
import { api } from "../lib/api";
import { useWorkspaceStore } from "../state/workspaceStore";

export function ComplianceSignModal() {
  const { activeWorkspace, activeFilePath, showSignModal, setShowSignModal } =
    useWorkspaceStore();
  const [signatures, setSignatures] = useState<ElectronicSignature[]>([]);
  const [meaning, setMeaning] = useState("Author Approval");
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadSignatures = useCallback(async () => {
    if (!activeWorkspace) return;
    try {
      const res = await api.listSignatures(
        activeWorkspace.id,
        activeFilePath ?? undefined
      );
      setSignatures(res.signatures);
    } catch {
      // Ignore load failure
    }
  }, [activeWorkspace, activeFilePath]);

  useEffect(() => {
    if (showSignModal) {
      void loadSignatures();
    }
  }, [showSignModal, loadSignatures]);

  if (!showSignModal || !activeWorkspace) return null;

  async function handleSign(e: FormEvent) {
    e.preventDefault();
    if (!activeWorkspace || !activeFilePath) return;
    setError(null);
    setBusy(true);
    try {
      await api.signDocument(activeWorkspace.id, {
        path: activeFilePath,
        meaning,
        reason,
        password,
      });
      setPassword("");
      setReason("");
      await loadSignatures();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signing failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      style={{ backdropFilter: "blur(4px)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="e-sign-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) setShowSignModal(false);
      }}
    >
      <div
        className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-xl p-6 shadow-2xl"
        style={{
          backgroundColor: "var(--bg-surface)",
          color: "var(--fg-primary)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <FileSignature className="h-5 w-5" style={{ color: "var(--accent)" }} />
            <div>
              <h2 id="e-sign-title" className="text-lg font-bold">
                21 CFR Part 11 Electronic Signature
              </h2>
              <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
                Cryptographically sign <code>{activeFilePath ?? "no file selected"}</code> with password re-verification.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowSignModal(false)}
            aria-label="Close Electronic Signature"
            className="ui-hover rounded-lg p-1.5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {activeFilePath ? (
          <form
            onSubmit={handleSign}
            className="mt-4 space-y-3 rounded-xl p-4"
            style={{ backgroundColor: "var(--bg-sidebar)", border: "1px solid var(--border-subtle)" }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium">Signature Meaning</label>
                <select
                  value={meaning}
                  onChange={(e) => setMeaning(e.target.value)}
                  className="ui-control w-full rounded px-2.5 py-1.5 text-xs"
                >
                  <option value="Author Approval">Author Approval</option>
                  <option value="Peer Review Sign-Off">Peer Review Sign-Off</option>
                  <option value="QA / GLP Release">QA / GLP Release</option>
                  <option value="Biostatistics ICH E9 Verification">Biostatistics ICH E9 Verification</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Re-enter Password (21 CFR §11.200)</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Confirm account password"
                  className="w-full rounded px-2.5 py-1.5 text-xs outline-none"
                  style={{ backgroundColor: "var(--bg-window)", border: "1px solid var(--border-subtle)" }}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Reason / Notes</label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Final statistical manuscript verification"
                className="w-full rounded px-2.5 py-1.5 text-xs outline-none"
                style={{ backgroundColor: "var(--bg-window)", border: "1px solid var(--border-subtle)" }}
              />
            </div>
            {error && (
              <div className="text-xs" style={{ color: "var(--danger)" }}>
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-semibold"
              style={{ backgroundColor: "var(--accent)", color: "var(--accent-fg)" }}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {busy ? "Signing..." : "Apply Electronic Signature"}
            </button>
          </form>
        ) : (
          <p className="mt-4 text-xs" style={{ color: "var(--fg-muted)" }}>
            Open a document in the editor first to apply an electronic signature.
          </p>
        )}

        <div className="mt-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--fg-muted)" }}>
            Signature Ledger
          </h3>
          {signatures.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
              No signatures recorded for this document yet.
            </p>
          ) : (
            <div className="space-y-2">
              {signatures.map((sig) => (
                <div
                  key={sig.id}
                  className="rounded-lg p-3 text-xs"
                  style={{ backgroundColor: "var(--bg-sidebar)", border: "1px solid var(--border-subtle)" }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">
                      {sig.userName} ({sig.userEmail}) — {sig.meaning}
                    </span>
                    <span style={{ color: "var(--fg-muted)" }}>
                      {new Date(sig.signedAt).toLocaleString()}
                    </span>
                  </div>
                  {sig.reason && (
                    <div className="mt-1" style={{ color: "var(--fg-muted)" }}>
                      Reason: {sig.reason}
                    </div>
                  )}
                  <div className="mt-1 font-mono text-[10px]" style={{ color: "var(--fg-muted)" }}>
                    Doc SHA-256: {sig.sha256Hash.slice(0, 20)}... · Sig HMAC: {sig.signatureHash.slice(0, 20)}...
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
