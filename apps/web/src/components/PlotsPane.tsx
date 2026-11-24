// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import { useWorkspaceStore } from "../state/workspaceStore";

export function PlotsPane() {
  const { plots } = useWorkspaceStore();

  if (plots.length === 0) {
    return (
      <div
        className="flex h-full items-center justify-center p-4 text-xs"
        style={{ color: "var(--fg-muted)" }}
      >
        No plots yet. Run a matplotlib Python chunk to render figures here.
      </div>
    );
  }

  return (
    <div
      className="h-full overflow-y-auto p-3 space-y-3"
      style={{ backgroundColor: "var(--bg-surface)" }}
    >
      {plots
        .filter((src) => src.startsWith("data:image/png;base64,"))
        .map((src, idx) => (
        <div
          key={`${idx}-${src.slice(-16)}`}
          className="rounded-lg p-2"
          style={{
            backgroundColor: "var(--bg-window)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <img
            src={src}
            alt={`Figure ${idx + 1}`}
            className="mx-auto max-h-96 rounded object-contain"
          />
        </div>
      ))}
    </div>
  );
}
