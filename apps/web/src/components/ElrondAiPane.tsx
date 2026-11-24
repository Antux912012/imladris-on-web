// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import { useState, type FormEvent } from "react";
import { Sparkles, Send } from "lucide-react";
import { api } from "../lib/api";
import { useWorkspaceStore } from "../state/workspaceStore";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function ElrondAiPane() {
  const { docContent, insertIntoEditor } = useWorkspaceStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() || busy) return;
    const promptText = input.trim();
    setInput("");
    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: promptText },
    ];
    setMessages(nextMessages);
    setBusy(true);

    try {
      const res = await api.chatAi(
        [
          {
            role: "system",
            content: `You are Elrond, a scientific writing and data analysis assistant inside Imladris. Current document excerpt:\n${docContent.slice(
              0,
              2000
            )}`,
          },
          ...nextMessages,
        ],
        "local"
      );
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: res.reply },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Elrond AI unavailable: ${
            err instanceof Error ? err.message : "Error"
          }`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="flex h-full flex-col"
      style={{ backgroundColor: "var(--bg-surface)" }}
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2.5">
        {messages.length === 0 ? (
          <div
            className="flex items-center gap-1.5 text-xs"
            style={{ color: "var(--fg-muted)" }}
          >
            <Sparkles className="h-3.5 w-3.5" /> Ask Elrond to draft sections,
            review math, or debug chunks.
          </div>
        ) : (
          messages.map((m, idx) => (
            <div
              key={idx}
              className="rounded-lg p-2.5 text-xs space-y-1.5"
              style={{
                backgroundColor:
                  m.role === "user" ? "var(--bg-sidebar)" : "var(--bg-window)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div className="font-semibold capitalize">{m.role}</div>
              <div className="whitespace-pre-wrap">{m.content}</div>
              {m.role === "assistant" && (
                <button
                  type="button"
                  onClick={() => insertIntoEditor(`\n${m.content}\n`)}
                  className="rounded px-2 py-0.5 text-[11px] font-medium"
                  style={{
                    backgroundColor: "var(--accent)",
                    color: "var(--accent-fg)",
                  }}
                >
                  Insert into Document
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <form
        onSubmit={handleSend}
        className="flex shrink-0 gap-1.5 p-2"
        style={{ borderTop: "1px solid var(--border-subtle)" }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
          placeholder="Ask Elrond AI..."
          className="flex-1 rounded px-2.5 py-1.5 text-xs outline-none"
          style={{
            backgroundColor: "var(--bg-window)",
            border: "1px solid var(--border-subtle)",
          }}
        />
        <button
          type="submit"
          disabled={busy}
          className="flex items-center gap-1 rounded px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
          style={{ backgroundColor: "var(--accent)", color: "var(--accent-fg)" }}
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}
