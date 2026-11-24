// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

interface WorkerRequest {
  pluginId: string;
  documentText: string;
}

self.onmessage = (evt: MessageEvent<WorkerRequest>) => {
  const { pluginId, documentText } = evt.data;

  if (pluginId === "word-count-studio") {
    const words = documentText.trim() ? documentText.trim().split(/\s+/).length : 0;
    const minutes = Math.max(1, Math.ceil(words / 220));
    self.postMessage({
      pluginId,
      summary: `${words} words (~${minutes} min read)`,
    });
    return;
  }

  if (pluginId === "citation-audit") {
    const matches = [...documentText.matchAll(/@([a-zA-Z0-9_:-]+)/g)].map(
      (m) => m[1]
    );
    const unique = Array.from(new Set(matches));
    self.postMessage({
      pluginId,
      summary:
        unique.length === 0
          ? "No citation keys found."
          : `${unique.length} unique citations: ${unique.join(", ")}`,
    });
    return;
  }

  if (pluginId === "chunk-linter") {
    const chunkStarts = [...documentText.matchAll(/```\{(python|r|bash)\}/g)];
    const labeled = [...documentText.matchAll(/#\|\s*label:/g)];
    self.postMessage({
      pluginId,
      summary: `${chunkStarts.length} executable chunks found, ${labeled.length} labeled.`,
    });
  }
};
