// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

export type WorkbenchMode = "focus" | "rstudio";
export type DocumentLanguageId =
  | "quarto"
  | "rmarkdown"
  | "jupyter"
  | "markdown"
  | "latex"
  | "r"
  | "python"
  | "typescript"
  | "html"
  | "rtf"
  | "csv"
  | "tsv"
  | "plaintext"
  | "rproj"
  | "bibtex";

export interface FormatProfile {
  id: DocumentLanguageId;
  extension: string;
  label: string;
  workbenchMode: WorkbenchMode;
  citationStyle: "pandoc" | "bibtex" | "none";
  supportsChunks: boolean;
  defaultEngine: "r" | "python" | "bash" | null;
  previewable: boolean;
}

const PROFILES: Record<string, FormatProfile> = {
  ".qmd": {
    id: "quarto",
    extension: ".qmd",
    label: "Quarto Document",
    workbenchMode: "rstudio",
    citationStyle: "pandoc",
    supportsChunks: true,
    defaultEngine: "r",
    previewable: true,
  },
  ".rmd": {
    id: "rmarkdown",
    extension: ".Rmd",
    label: "R Markdown",
    workbenchMode: "rstudio",
    citationStyle: "pandoc",
    supportsChunks: true,
    defaultEngine: "r",
    previewable: true,
  },
  ".ipynb": {
    id: "jupyter",
    extension: ".ipynb",
    label: "Jupyter Notebook",
    workbenchMode: "rstudio",
    citationStyle: "pandoc",
    supportsChunks: true,
    defaultEngine: "python",
    previewable: true,
  },
  ".md": {
    id: "markdown",
    extension: ".md",
    label: "Markdown",
    workbenchMode: "focus",
    citationStyle: "pandoc",
    supportsChunks: false,
    defaultEngine: null,
    previewable: true,
  },
  ".tex": {
    id: "latex",
    extension: ".tex",
    label: "LaTeX",
    workbenchMode: "focus",
    citationStyle: "bibtex",
    supportsChunks: false,
    defaultEngine: null,
    previewable: true,
  },
  ".r": {
    id: "r",
    extension: ".R",
    label: "R Script",
    workbenchMode: "rstudio",
    citationStyle: "none",
    supportsChunks: false,
    defaultEngine: "r",
    previewable: false,
  },
  ".py": {
    id: "python",
    extension: ".py",
    label: "Python Script",
    workbenchMode: "rstudio",
    citationStyle: "none",
    supportsChunks: false,
    defaultEngine: "python",
    previewable: false,
  },
  ".ts": {
    id: "typescript",
    extension: ".ts",
    label: "TypeScript",
    workbenchMode: "rstudio",
    citationStyle: "none",
    supportsChunks: false,
    defaultEngine: null,
    previewable: false,
  },
  ".html": {
    id: "html",
    extension: ".html",
    label: "HTML Document",
    workbenchMode: "focus",
    citationStyle: "none",
    supportsChunks: false,
    defaultEngine: null,
    previewable: true,
  },
  ".rtf": {
    id: "rtf",
    extension: ".rtf",
    label: "Rich Text Format",
    workbenchMode: "focus",
    citationStyle: "none",
    supportsChunks: false,
    defaultEngine: null,
    previewable: true,
  },
  ".csv": {
    id: "csv",
    extension: ".csv",
    label: "CSV Dataset",
    workbenchMode: "rstudio",
    citationStyle: "none",
    supportsChunks: false,
    defaultEngine: null,
    previewable: false,
  },
  ".tsv": {
    id: "tsv",
    extension: ".tsv",
    label: "TSV Dataset",
    workbenchMode: "rstudio",
    citationStyle: "none",
    supportsChunks: false,
    defaultEngine: null,
    previewable: false,
  },
  ".txt": {
    id: "plaintext",
    extension: ".txt",
    label: "Plain Text",
    workbenchMode: "focus",
    citationStyle: "none",
    supportsChunks: false,
    defaultEngine: null,
    previewable: false,
  },
  ".rproj": {
    id: "rproj",
    extension: ".Rproj",
    label: "RStudio Project",
    workbenchMode: "rstudio",
    citationStyle: "none",
    supportsChunks: false,
    defaultEngine: "r",
    previewable: false,
  },
  ".bib": {
    id: "bibtex",
    extension: ".bib",
    label: "BibTeX Bibliography",
    workbenchMode: "focus",
    citationStyle: "bibtex",
    supportsChunks: false,
    defaultEngine: null,
    previewable: false,
  },
};

export function fromFilename(filename: string): FormatProfile {
  const lower = filename.trim().toLowerCase();
  const dot = lower.lastIndexOf(".");
  const ext = dot >= 0 ? lower.slice(dot) : ".md";
  return PROFILES[ext] ?? PROFILES[".md"]!;
}

export function listFormatProfiles(): FormatProfile[] {
  return Object.values(PROFILES);
}
