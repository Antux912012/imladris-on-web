// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import { useState, type FormEvent } from "react";
import { BookOpen, Plus } from "lucide-react";
import { api } from "../lib/api";
import { useWorkspaceStore } from "../state/workspaceStore";

interface ResolvedCitation {
  key: string;
  title: string;
  authors: string[];
  year: string;
  bibtex: string;
}

export function CitationsPane() {
  const { insertIntoEditor } = useWorkspaceStore();
  const [queryId, setQueryId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ResolvedCitation[]>([]);

  async function handleResolve(e: FormEvent) {
    e.preventDefault();
    if (!queryId.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.resolveCitation(queryId.trim());
      setResults((prev) => [res, ...prev]);
      setQueryId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Citation lookup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="flex h-full flex-col p-2 space-y-2"
      style={{ backgroundColor: "var(--bg-surface)" }}
    >
      <form onSubmit={handleResolve} className="flex gap-1.5">
        <input
          type="text"
          value={queryId}
          onChange={(e) => setQueryId(e.target.value)}
          placeholder="DOI or arXiv ID (e.g. 2301.00001)"
          className="flex-1 rounded px-2 py-1 text-xs outline-none"
          style={{
            backgroundColor: "var(--bg-window)",
            border: "1px solid var(--border-subtle)",
          }}
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded px-2.5 py-1 text-xs font-medium disabled:opacity-50"
          style={{ backgroundColor: "var(--accent)", color: "var(--accent-fg)" }}
        >
          {loading ? "..." : "Resolve"}
        </button>
      </form>

      {error && (
        <div className="text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto space-y-2">
        {results.length === 0 ? (
          <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--fg-muted)" }}>
            <BookOpen className="h-3.5 w-3.5" /> Resolve a DOI or arXiv ID to insert citations.
          </div>
        ) : (
          results.map((cit) => (
            <div
              key={cit.key + cit.title}
              className="rounded-lg p-2 text-xs space-y-1"
              style={{
                backgroundColor: "var(--bg-window)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div className="font-medium">{cit.title}</div>
              <div style={{ color: "var(--fg-muted)" }}>
                {cit.authors.slice(0, 3).join(", ")} ({cit.year})
              </div>
              <div className="flex gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => insertIntoEditor(`[@${cit.key}]`)}
                  className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium"
                  style={{
                    backgroundColor: "var(--accent)",
                    color: "var(--accent-fg)",
                  }}
                >
                  <Plus className="h-3 w-3" /> Insert @{cit.key}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
