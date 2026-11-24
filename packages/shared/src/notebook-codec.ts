// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

export interface NotebookCell {
  id: string;
  cell_type: "markdown" | "code" | "raw";
  metadata: Record<string, unknown>;
  source: string[];
  execution_count?: number | null;
  outputs?: unknown[];
}

export interface NotebookDocument {
  nbformat: number;
  nbformat_minor: number;
  metadata: Record<string, unknown>;
  cells: NotebookCell[];
}

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

function utf8ToBase64(text: string): string {
  const bytes = TEXT_ENCODER.encode(text);
  const chunks: string[] = [];
  const CHUNK_SIZE = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE)));
  }
  return btoa(chunks.join(""));
}

function base64ToUtf8(b64: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return TEXT_DECODER.decode(bytes);
}

function toSourceLines(text: string): string[] {
  if (!text) return [];
  const raw = text.split("\n");
  return raw.map((line, idx) => (idx < raw.length - 1 ? `${line}\n` : line));
}

function joinSource(source: string | string[]): string {
  return Array.isArray(source) ? source.join("") : source;
}

export function ipynbToQuarto(ipynbJson: string): string {
  const nb = JSON.parse(ipynbJson) as NotebookDocument;
  const kernelMeta = (nb.metadata?.kernelspec ?? {}) as Record<string, unknown>;
  const defaultLang =
    typeof kernelMeta.language === "string" && kernelMeta.language.toLowerCase() === "r"
      ? "r"
      : "python";
  const title =
    typeof nb.metadata?.title === "string" ? nb.metadata.title : "Jupyter Notebook";

  const blocks: string[] = [
    "---",
    `title: "${title.replace(/"/g, '\\"')}"`,
    `format: html`,
    `jupyter: ${typeof kernelMeta.name === "string" ? kernelMeta.name : "python3"}`,
    "---",
    "",
  ];

  for (let idx = 0; idx < (nb.cells ?? []).length; idx++) {
    const cell = nb.cells[idx]!;
    const text = joinSource(cell.source);
    if (cell.cell_type === "markdown") {
      blocks.push(text.trimEnd(), "");
    } else if (cell.cell_type === "code") {
      const lang =
        typeof cell.metadata?.language === "string"
          ? cell.metadata.language
          : defaultLang;
      blocks.push(`\`\`\`{${lang}}`);
      if (cell.id) {
        blocks.push(`#| label: ${cell.id}`);
      }
      if (cell.execution_count != null) {
        blocks.push(`#| execution_count: ${cell.execution_count}`);
      }
      if (cell.outputs && cell.outputs.length > 0) {
        const b64 = utf8ToBase64(JSON.stringify(cell.outputs));
        blocks.push(`#| outputs_b64: ${b64}`);
      }
      if (text.length > 0) {
        blocks.push(text.trimEnd());
      }
      blocks.push("```", "");
    } else {
      blocks.push("```{=raw}", text.trimEnd(), "```", "");
    }
  }

  return blocks.join("\n").trimEnd() + "\n";
}

export function quartoToIpynb(qmd: string): string {
  const lines = qmd.split(/\r?\n/);
  let i = 0;
  let title = "Jupyter Notebook";
  let kernelName = "python3";
  let kernelLang = "python";

  if ((lines[0] ?? "").trim() === "---") {
    i = 1;
    while (i < lines.length && (lines[i] ?? "").trim() !== "---") {
      const l = lines[i] ?? "";
      const mTitle = /^title:\s*"?(.*?)"?\s*$/.exec(l);
      if (mTitle) title = mTitle[1]!;
      const mJup = /^jupyter:\s*(.+)$/.exec(l);
      if (mJup) {
        kernelName = mJup[1]!.trim();
        if (kernelName.toLowerCase() === "ir") kernelLang = "r";
      }
      i++;
    }
    i++;
  }

  const cells: NotebookCell[] = [];
  let mdBuf: string[] = [];
  let cellSeq = 1;

  const flushMarkdown = () => {
    const joined = mdBuf.join("\n").trim();
    if (joined.length > 0) {
      cells.push({
        id: `md-${cellSeq++}`,
        cell_type: "markdown",
        metadata: {},
        source: toSourceLines(joined),
      });
    }
    mdBuf = [];
  };

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const codeOpen = /^```\{\s*(r|python|bash)\b[^}]*\}\s*$/i.exec(line.trim());
    if (!codeOpen) {
      mdBuf.push(line);
      i++;
      continue;
    }

    flushMarkdown();
    const lang = codeOpen[1]!.toLowerCase();
    if (lang === "r") kernelLang = "r";
    i++;

    let id = `code-${cellSeq++}`;
    let executionCount: number | null = null;
    let outputs: unknown[] = [];
    const codeLines: string[] = [];

    while (i < lines.length && (lines[i] ?? "").trim() !== "```") {
      const cur = lines[i] ?? "";
      const opt = /^#\|\s*([A-Za-z0-9_.-]+)\s*:\s*(.*)$/.exec(cur.trim());
      if (opt && codeLines.length === 0) {
        const key = opt[1]!;
        const val = opt[2]!.trim();
        if (key === "label") id = val;
        else if (key === "execution_count") {
          const parsed = Number.parseInt(val, 10);
          executionCount = Number.isFinite(parsed) ? parsed : null;
        } else if (key === "outputs_b64") {
          try {
            const jsonStr = base64ToUtf8(val);
            const parsed = JSON.parse(jsonStr);
            if (Array.isArray(parsed)) outputs = parsed;
          } catch {
            outputs = [];
          }
        }
      } else {
        codeLines.push(cur);
      }
      i++;
    }

    cells.push({
      id,
      cell_type: "code",
      metadata: { language: lang },
      source: toSourceLines(codeLines.join("\n")),
      execution_count: executionCount,
      outputs,
    });
    i++;
  }

  flushMarkdown();

  const nb: NotebookDocument = {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      title,
      kernelspec: {
        name: kernelName,
        display_name: kernelLang === "r" ? "R" : "Python 3",
        language: kernelLang,
      },
    },
    cells,
  };

  return JSON.stringify(nb, null, 2) + "\n";
}
