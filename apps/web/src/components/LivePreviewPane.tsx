// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useMemo, useState } from "react";
import { marked } from "marked";
import katex from "katex";
import { useWorkspaceStore } from "../state/workspaceStore";

function stripFrontmatter(src: string): string {
  if (!src.startsWith("---")) return src;
  const end = src.indexOf("\n---", 3);
  if (end === -1) return src;
  return src.slice(end + 4).trimStart();
}

function renderMathAndMarkdown(raw: string, dark: boolean): string {
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
  const bg = dark ? "#1e1e1e" : "#ffffff";
  const fg = dark ? "#eeeeee" : "#2e3436";
  const codeBg = dark ? "#2a2a2a" : "#f3f3f3";
  const border = dark ? "#3d3d3d" : "#d5d5d5";
  const thBg = dark ? "#262626" : "#f5f5f5";
  const muted = dark ? "#9a9996" : "#555555";

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
    color: ${fg};
    background: ${bg};
  }
  pre, code {
    font-family: ui-monospace, monospace;
    background: ${codeBg};
    border-radius: 4px;
  }
  pre { padding: 10px 12px; overflow-x: auto; }
  code { padding: 1px 4px; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  th, td { border: 1px solid ${border}; padding: 6px 10px; text-align: left; }
  th { background: ${thBg}; }
  blockquote { border-left: 3px solid #3584e4; margin: 10px 0; padding-left: 12px; color: ${muted}; }
</style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

export function LivePreviewPane() {
  const { docContent, activeFilePath, theme } = useWorkspaceStore();
  const [debouncedContent, setDebouncedContent] = useState(docContent);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedContent(docContent);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [docContent]);

  const isRawHtml = Boolean(activeFilePath?.toLowerCase().endsWith(".html"));
  const srcDoc = useMemo(() => {
    if (isRawHtml) {
      return debouncedContent;
    }
    return renderMathAndMarkdown(debouncedContent, theme === "dark");
  }, [debouncedContent, isRawHtml, theme]);

  return (
    <iframe
      title="Imladris Live Preview"
      sandbox={isRawHtml ? "allow-scripts" : ""}
      srcDoc={srcDoc}
      className="h-full w-full border-0"
      style={{ backgroundColor: "var(--bg-surface)" }}
    />
  );
}
