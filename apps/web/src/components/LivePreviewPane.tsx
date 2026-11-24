// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import { useMemo } from "react";
import { marked } from "marked";
import katex from "katex";
import { useWorkspaceStore } from "../state/workspaceStore";

function stripFrontmatter(src: string): string {
  if (!src.startsWith("---")) return src;
  const end = src.indexOf("\n---", 3);
  if (end === -1) return src;
  return src.slice(end + 4).trimStart();
}

function renderMathAndMarkdown(raw: string): string {
  let text = stripFrontmatter(raw);

  // Replace display math $$...$$
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_m, expr: string) => {
    try {
      return katex.renderToString(expr.trim(), { displayMode: true, throwOnError: false });
    } catch {
      return expr;
    }
  });

  // Replace inline math $...$
  text = text.replace(/\$([^\n$]+?)\$/g, (_m, expr: string) => {
    try {
      return katex.renderToString(expr.trim(), { displayMode: false, throwOnError: false });
    } catch {
      return expr;
    }
  });

  const bodyHtml = marked.parse(text, { async: false }) as string;
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body {
    font-family: system-ui, -apple-system, sans-serif;
    line-height: 1.6;
    max-width: 780px;
    margin: 0 auto;
    padding: 20px 24px;
    color: #2e3436;
    background: #ffffff;
  }
  pre, code {
    font-family: ui-monospace, monospace;
    background: #f3f3f3;
    border-radius: 4px;
  }
  pre { padding: 10px 12px; overflow-x: auto; }
  code { padding: 1px 4px; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  th, td { border: 1px solid #d5d5d5; padding: 6px 10px; text-align: left; }
  th { background: #f5f5f5; }
  blockquote { border-left: 3px solid #3584e4; margin: 10px 0; padding-left: 12px; color: #555; }
</style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

export function LivePreviewPane() {
  const { docContent, activeFilePath } = useWorkspaceStore();
  const isRawHtml = Boolean(activeFilePath?.toLowerCase().endsWith(".html"));
  const srcDoc = useMemo(() => {
    if (isRawHtml) {
      return docContent;
    }
    return renderMathAndMarkdown(docContent);
  }, [docContent, isRawHtml]);

  return (
    <iframe
      title="Imladris Live Preview"
      sandbox={isRawHtml ? "allow-scripts" : ""}
      srcDoc={srcDoc}
      className="h-full w-full border-0 bg-white"
    />
  );
}
