// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import { Check, Copy, Download, Server, X } from "lucide-react";
import { useWorkspaceStore } from "../state/workspaceStore";

const DEPLOY_COMMANDS = [
  {
    id: "docker",
    label: "Docker Compose",
    cmd: "git clone https://github.com/Antux912012/imladris-on-web && cd imladris-on-web && docker compose up -d",
  },
  {
    id: "podman",
    label: "Rootless Podman",
    cmd: "git clone https://github.com/Antux912012/imladris-on-web && cd imladris-on-web && podman compose up -d",
  },
  {
    id: "k8s",
    label: "Kubernetes (Kustomize)",
    cmd: "git clone https://github.com/Antux912012/imladris-on-web && cd imladris-on-web && kubectl apply -k deploy/k8s",
  },
];

export function DemoUpgradeModal() {
  const { showDemoUpgradeModal, setShowDemoUpgradeModal } = useWorkspaceStore();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!showDemoUpgradeModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowDemoUpgradeModal(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showDemoUpgradeModal, setShowDemoUpgradeModal]);

  if (!showDemoUpgradeModal) return null;

  async function copyCmd(id: string, cmd: string) {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // Ignore clipboard failures
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
      style={{ backdropFilter: "blur(4px)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-upgrade-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) setShowDemoUpgradeModal(false);
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
          <div>
            <span
              className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
              style={{
                backgroundColor: "rgba(53, 132, 228, 0.14)",
                color: "var(--accent)",
              }}
            >
              Interactive Browser Preview
            </span>
            <h2 id="demo-upgrade-title" className="mt-2 text-lg font-bold">
              Ready for Full R, Python, Quarto &amp; Real-Time Execution?
            </h2>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--fg-muted)" }}>
              You are exploring the static GitHub Pages mock of <strong>Imladris on Web</strong>.
              To run real R/Python/Quarto kernels, export PDF/ODT/ODP/Mallorn bundles, or collaborate live,
              download <strong>Imladris Desktop</strong> for offline work or deploy <strong>Imladris on Web</strong> on your own machine.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowDemoUpgradeModal(false)}
            aria-label="Close dialog"
            className="ui-hover rounded-lg p-1.5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div
            className="flex flex-col justify-between rounded-lg p-4"
            style={{
              backgroundColor: "var(--bg-sidebar)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Download className="h-4 w-4" style={{ color: "var(--accent)" }} />
                Imladris Desktop (Offline)
              </div>
              <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                Native GTK4 &amp; Vala scientific workbench with isolated in-sandbox R/Python/Quarto toolchains,
                4/6-quadrant docking, Elrond local AI, and zero telemetry.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-mono">
                <span className="rounded px-1.5 py-0.5" style={{ backgroundColor: "var(--bg-surface)" }}>.flatpak</span>
                <span className="rounded px-1.5 py-0.5" style={{ backgroundColor: "var(--bg-surface)" }}>.deb</span>
                <span className="rounded px-1.5 py-0.5" style={{ backgroundColor: "var(--bg-surface)" }}>.rpm</span>
                <span className="rounded px-1.5 py-0.5" style={{ backgroundColor: "var(--bg-surface)" }}>FlatPark</span>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href="https://github.com/Antux912012/imladris/releases/latest"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "var(--accent-fg)",
                }}
              >
                <Download className="h-3.5 w-3.5" /> Download Imladris
              </a>
              <a
                href="https://flatpark.org/apps/io.github.Antux912012.Imladris/"
                target="_blank"
                rel="noopener noreferrer"
                className="ui-control inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium"
              >
                FlatPark
              </a>
            </div>
          </div>

          <div
            className="flex flex-col justify-between rounded-lg p-4"
            style={{
              backgroundColor: "var(--bg-sidebar)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Server className="h-4 w-4" style={{ color: "var(--success)" }} />
                Deploy Imladris on Web
              </div>
              <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                Self-host the full FastAPI + Yjs CRDT + Python/R runner stack on your workstation, lab server, or cluster:
              </p>
              <div className="mt-2.5 space-y-2">
                {DEPLOY_COMMANDS.map((item) => (
                  <div
                    key={item.id}
                    className="rounded p-2 text-[11px]"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{item.label}</span>
                      <button
                        type="button"
                        onClick={() => copyCmd(item.id, item.cmd)}
                        className="ui-hover inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]"
                      >
                        {copiedId === item.id ? (
                          <>
                            <Check className="h-3 w-3" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" /> Copy
                          </>
                        )}
                      </button>
                    </div>
                    <code className="mt-1 block overflow-x-auto whitespace-nowrap font-mono text-[10px]" style={{ color: "var(--fg-muted)" }}>
                      {item.cmd}
                    </code>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3">
              <a
                href="https://github.com/Antux912012/imladris-on-web"
                target="_blank"
                rel="noopener noreferrer"
                className="ui-control inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium"
              >
                Self-Hosting Guide on GitHub
              </a>
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={() => setShowDemoUpgradeModal(false)}
            className="ui-control rounded-md px-3.5 py-1.5 text-xs font-medium"
          >
            Continue Exploring Mock
          </button>
        </div>
      </div>
    </div>
  );
}
