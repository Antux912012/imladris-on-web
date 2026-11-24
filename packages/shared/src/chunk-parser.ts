// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

export type ChunkLanguage = "r" | "python" | "bash" | "ts" | "mermaid";

export interface ParsedChunk {
  id: string;
  language: ChunkLanguage;
  headerLine: number;
  startLine: number;
  endLine: number;
  options: Record<string, string>;
  code: string;
}

const FENCE_HEADER_RE = /^```\{\s*(r|python|bash|ts|mermaid)\b([^}]*)\}\s*$/i;
const QUARTO_OPT_RE = /^#\|\s*([A-Za-z0-9_.-]+)\s*:\s*(.*)$/;

export function parseChunks(source: string): ParsedChunk[] {
  const lines = source.split(/\r?\n/);
  const chunks: ParsedChunk[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const match = FENCE_HEADER_RE.exec(line.trim());
    if (!match) {
      i++;
      continue;
    }

    const lang = match[1]!.toLowerCase() as ChunkLanguage;
    const headerAttrs = (match[2] ?? "").trim();
    const headerLine = i;
    const options: Record<string, string> = {};

    if (headerAttrs.length > 0) {
      // Parse inline comma-separated attributes such as `{r label, echo=FALSE}`
      const parts = headerAttrs.split(",").map((s) => s.trim()).filter(Boolean);
      for (const part of parts) {
        const eq = part.indexOf("=");
        if (eq > 0) {
          options[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
        } else if (!options.label) {
          options.label = part;
        }
      }
    }

    i++;
    const bodyLines: string[] = [];
    const bodyStart = i;
    let closed = false;

    while (i < lines.length) {
      const cur = lines[i] ?? "";
      if (cur.trim() === "```") {
        closed = true;
        break;
      }
      const optMatch = QUARTO_OPT_RE.exec(cur.trim());
      if (optMatch && bodyLines.length === 0) {
        options[optMatch[1]!] = optMatch[2]!.trim();
      } else {
        bodyLines.push(cur);
      }
      i++;
    }

    const endLine = closed ? i : Math.max(bodyStart, lines.length - 1);
    const id = options.label
      ? `chunk-${options.label}`
      : `chunk-${lang}-${headerLine + 1}`;

    chunks.push({
      id,
      language: lang,
      headerLine,
      startLine: bodyStart,
      endLine,
      options,
      code: bodyLines.join("\n"),
    });

    i++;
  }

  return chunks;
}
