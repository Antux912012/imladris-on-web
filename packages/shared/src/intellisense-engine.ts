// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import type { EnvVariable } from "./schemas.js";

export interface CompletionItem {
  label: string;
  insertText: string;
  kind: "function" | "keyword" | "snippet" | "variable" | "column" | "reference";
  detail?: string;
}

export interface CompletionQuery {
  language: "markdown" | "quarto" | "latex" | "html" | "r" | "python" | "bash";
  documentText: string;
  prefix: string;
  lineBeforeCursor: string;
  environment?: EnvVariable[];
}

const R_FUNCTIONS: CompletionItem[] = [
  { label: "library()", insertText: "library()", kind: "function", detail: "Load R package" },
  { label: "ggplot()", insertText: "ggplot(data, aes(x = , y = ))", kind: "function", detail: "ggplot2 chart" },
  { label: "read.csv()", insertText: "read.csv(\"\", header = TRUE)", kind: "function", detail: "Read CSV file" },
  { label: "summary()", insertText: "summary()", kind: "function", detail: "Summary statistics" },
  { label: "mutate()", insertText: "mutate()", kind: "function", detail: "dplyr column transform" },
  { label: "filter()", insertText: "filter()", kind: "function", detail: "dplyr row filter" },
];

const PY_COMPLETIONS: CompletionItem[] = [
  { label: "import pandas as pd", insertText: "import pandas as pd", kind: "keyword", detail: "Import pandas" },
  { label: "import numpy as np", insertText: "import numpy as np", kind: "keyword", detail: "Import numpy" },
  { label: "pd.read_csv()", insertText: "pd.read_csv(\"\")", kind: "function", detail: "Load CSV DataFrame" },
  { label: "describe()", insertText: "describe()", kind: "function", detail: "DataFrame summary" },
  { label: "head()", insertText: "head(10)", kind: "function", detail: "Top N rows" },
  { label: "groupby()", insertText: "groupby(\"\")", kind: "function", detail: "Group rows" },
];

const LATEX_MACROS: CompletionItem[] = [
  { label: "\\section{}", insertText: "\\section{}", kind: "snippet", detail: "Section heading" },
  { label: "\\begin{equation}", insertText: "\\begin{equation}\n  \n\\end{equation}", kind: "snippet", detail: "Numbered equation" },
  { label: "\\cite{}", insertText: "\\cite{}", kind: "reference", detail: "Citation" },
  { label: "\\frac{}{}", insertText: "\\frac{}{}", kind: "function", detail: "Fraction" },
];

const HTML_TAGS: CompletionItem[] = [
  { label: "<div>", insertText: "<div></div>", kind: "snippet", detail: "Block container" },
  { label: "<section>", insertText: "<section></section>", kind: "snippet", detail: "Section element" },
  { label: "<table>", insertText: "<table>\n  <tr><th></th></tr>\n  <tr><td></td></tr>\n</table>", kind: "snippet", detail: "HTML table" },
];

const BASH_CMDS: CompletionItem[] = [
  { label: "ls -la", insertText: "ls -la", kind: "function", detail: "List files" },
  { label: "quarto render", insertText: "quarto render ", kind: "function", detail: "Render Quarto document" },
  { label: "pip list", insertText: "pip list", kind: "function", detail: "Installed Python packages" },
];

const QUARTO_SNIPPETS: CompletionItem[] = [
  { label: "```{r}", insertText: "```{r}\n#| label: chunk-1\n\n```", kind: "snippet", detail: "R code chunk" },
  { label: "```{python}", insertText: "```{python}\n#| label: chunk-py\n\n```", kind: "snippet", detail: "Python code chunk" },
  { label: "::: {.callout-note}", insertText: "::: {.callout-note}\n\n:::", kind: "snippet", detail: "Quarto callout block" },
];

const DOLLAR_COL_RE = /([A-Za-z_][A-Za-z0-9_.]*)\$([A-Za-z0-9_.]*)$/;
const DOT_COL_RE = /([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z0-9_]*)$/;

export function queryCompletions(query: CompletionQuery): CompletionItem[] {
  const results: CompletionItem[] = [];
  const env = query.environment ?? [];
  const pfx = query.prefix.toLowerCase();

  // 1. Live DataFrame column completion (`df$col` in R or `df.` in Python)
  const dollarMatch = DOLLAR_COL_RE.exec(query.lineBeforeCursor);
  if (dollarMatch) {
    const dfName = dollarMatch[1]!;
    const colPrefix = dollarMatch[2]!.toLowerCase();
    const target = env.find((v) => v.name === dfName && v.isDataFrame);
    if (target) {
      for (const col of target.columns) {
        if (col.toLowerCase().startsWith(colPrefix)) {
          results.push({ label: col, insertText: col, kind: "column", detail: `${dfName} column` });
        }
      }
      return results;
    }
  }

  const dotMatch = DOT_COL_RE.exec(query.lineBeforeCursor);
  if (dotMatch && query.language === "python") {
    const varName = dotMatch[1]!;
    const attrPrefix = dotMatch[2]!.toLowerCase();
    const target = env.find((v) => v.name === varName && v.isDataFrame);
    if (target) {
      for (const col of target.columns) {
        if (col.toLowerCase().startsWith(attrPrefix)) {
          results.push({ label: col, insertText: col, kind: "column", detail: `${varName} column` });
        }
      }
    }
  }

  // 2. Quarto cross-references (@fig-, @tbl-, @sec-, @eq-) extracted from current document
  if (query.lineBeforeCursor.includes("@")) {
    const refRe = /#(fig|tbl|sec|eq)-([A-Za-z0-9_-]+)/g;
    let m: RegExpExecArray | null;
    const seen = new Set<string>();
    while ((m = refRe.exec(query.documentText)) !== null) {
      const refLabel = `@${m[1]}-${m[2]}`;
      if (!seen.has(refLabel)) {
        seen.add(refLabel);
        results.push({ label: refLabel, insertText: refLabel, kind: "reference", detail: "Cross-reference" });
      }
    }
  }

  // 3. Language-specific static & live variable completions
  const pool: CompletionItem[] = [];
  for (const v of env) {
    pool.push({ label: v.name, insertText: v.name, kind: "variable", detail: v.type });
  }

  switch (query.language) {
    case "r":
      pool.push(...R_FUNCTIONS);
      break;
    case "python":
      pool.push(...PY_COMPLETIONS);
      break;
    case "latex":
      pool.push(...LATEX_MACROS);
      break;
    case "html":
      pool.push(...HTML_TAGS);
      break;
    case "bash":
      pool.push(...BASH_CMDS);
      break;
    default:
      pool.push(...QUARTO_SNIPPETS, ...HTML_TAGS);
      break;
  }

  for (const item of pool) {
    if (!pfx || item.label.toLowerCase().includes(pfx)) {
      results.push(item);
    }
  }

  return results;
}
