// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import { X, Play } from "lucide-react";
import type { CommunityPluginEntry } from "@imladris/shared";
import { api } from "../lib/api";
import { useWorkspaceStore } from "../state/workspaceStore";

export function PluginBrowserModal() {
  const { showPluginModal, setShowPluginModal, docContent } = useWorkspaceStore();
  const [plugins, setPlugins] = useState<CommunityPluginEntry[]>([]);
  const [outputs, setOutputs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!showPluginModal) return;
    api
      .listPlugins()
      .then((res) => setPlugins(res.plugins))
      .catch(() => setPlugins([]));
  }, [showPluginModal]);

  if (!showPluginModal) return null;

  function runPluginInWorker(pluginId: string) {
    const worker = new Worker(
      new URL("../workers/pluginWorker.ts", import.meta.url),
      { type: "module" }
    );
    const timer = window.setTimeout(() => {
      worker.terminate();
      setOutputs((prev) => ({ ...prev, [pluginId]: "Plugin timed out (5s limit)." }));
    }, 5000);
    worker.onmessage = (evt: MessageEvent<{ pluginId: string; summary: string }>) => {
      window.clearTimeout(timer);
      setOutputs((prev) => ({
        ...prev,
        [evt.data.pluginId]: evt.data.summary,
      }));
      worker.terminate();
    };
    worker.onerror = () => {
      window.clearTimeout(timer);
      setOutputs((prev) => ({ ...prev, [pluginId]: "Plugin execution error." }));
      worker.terminate();
    };
    worker.postMessage({ pluginId, documentText: docContent });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-lg rounded-xl p-5 shadow-xl"
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">
            Sandboxed Web Worker Plugins
          </h2>
          <button
            type="button"
            onClick={() => setShowPluginModal(false)}
            className="rounded p-1 hover:opacity-80"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2.5">
          {plugins.map((plugin) => (
            <div
              key={plugin.id}
              className="rounded-lg p-3 text-xs space-y-1.5"
              style={{
                backgroundColor: "var(--bg-window)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">
                  {plugin.name} <span className="opacity-60">v{plugin.version}</span>
                </span>
                <button
                  type="button"
                  onClick={() => runPluginInWorker(plugin.id)}
                  className="flex items-center gap-1 rounded px-2 py-1 font-medium"
                  style={{
                    backgroundColor: "var(--accent)",
                    color: "var(--accent-fg)",
                  }}
                >
                  <Play className="h-3 w-3" /> Run
                </button>
              </div>
              <div style={{ color: "var(--fg-muted)" }}>{plugin.description}</div>
              {outputs[plugin.id] && (
                <div
                  className="rounded px-2 py-1 font-mono"
                  style={{
                    backgroundColor: "var(--bg-sidebar)",
                    color: "var(--success)",
                  }}
                >
                  {outputs[plugin.id]}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
