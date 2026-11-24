// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { searchKeymap } from "@codemirror/search";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { autocompletion, type CompletionContext } from "@codemirror/autocomplete";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { yCollab } from "y-codemirror.next";
import * as Y from "yjs";
import { queryCompletions } from "@imladris/shared";
import { getConfiguredServerUrl, isBrowserStandaloneMode } from "../lib/api";
import { localStandaloneApi } from "../lib/localStore";
import { useWorkspaceStore } from "../state/workspaceStore";

export function CollabEditor() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);

  const {
    user,
    activeWorkspace,
    activeFilePath,
    setDocContent,
    setCollabPeers,
    setWsConnected,
    setEditorInsertCallback,
    setEditorReplaceCallback,
  } = useWorkspaceStore();

  useEffect(() => {
    const host = containerRef.current;
    if (!host || !activeWorkspace || !activeFilePath || !user) return;

    const standalone = isBrowserStandaloneMode();
    const readOnly =
      activeWorkspace.role === "VIEWER" || activeWorkspace.role === "REVIEWER";

    const completionSource = (context: CompletionContext) => {
      const word = context.matchBefore(/[\w.@$]+/);
      if (!word || (word.from === word.to && !context.explicit)) return null;
      const env = useWorkspaceStore.getState().envVariables;
      const text = context.state.doc.toString();
      const line = context.state.doc.lineAt(context.pos);
      const lineBeforeCursor = line.text.slice(0, context.pos - line.from);
      const lower = activeFilePath.toLowerCase();
      const lang = lower.endsWith(".py")
        ? "python"
        : lower.endsWith(".r")
          ? "r"
          : lower.endsWith(".tex")
            ? "latex"
            : lower.endsWith(".html")
              ? "html"
              : lower.endsWith(".sh")
                ? "bash"
                : "quarto";
      const items = queryCompletions({
        language: lang,
        prefix: word.text,
        documentText: text,
        lineBeforeCursor,
        environment: env,
      });
      if (items.length === 0) return null;
      return {
        from: word.from,
        options: items.map((it) => ({
          label: it.label,
          type: it.kind,
          detail: it.detail,
        })),
      };
    };

    const langExt = activeFilePath.endsWith(".py") ? python() : markdown();

    if (standalone) {
      const initialDoc = localStandaloneApi.readFile(
        activeWorkspace.id,
        activeFilePath
      );
      const state = EditorState.create({
        doc: initialDoc,
        extensions: [
          lineNumbers(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
          langExt,
          autocompletion({ override: [completionSource] }),
          EditorState.readOnly.of(readOnly),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const nextText = update.state.doc.toString();
              setDocContent(nextText);
              localStandaloneApi.writeFile(activeWorkspace.id, {
                path: activeFilePath,
                content: nextText,
              });
            }
          }),
        ],
      });

      const view = new EditorView({ state, parent: host });
      viewRef.current = view;
      setDocContent(initialDoc);
      setWsConnected(false);

      setEditorInsertCallback((snippet: string) => {
        if (readOnly) return;
        const sel = view.state.selection.main;
        view.dispatch({
          changes: { from: sel.from, to: sel.to, insert: snippet },
        });
        view.focus();
      });

      setEditorReplaceCallback((content: string) => {
        if (readOnly) return;
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: content },
        });
        setDocContent(content);
      });

      return () => {
        setEditorInsertCallback(null);
        setEditorReplaceCallback(null);
        view.destroy();
        viewRef.current = null;
      };
    }

    const ydoc = new Y.Doc();
    const yText = ydoc.getText("codemirror");
    const undoManager = new Y.UndoManager(yText);

    const configuredBase = getConfiguredServerUrl();
    const wsTarget = configuredBase
      ? configuredBase.replace(/^http/i, "ws")
      : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;
    const wsUrl = `${wsTarget}/ws/collab/${activeWorkspace.id}/${encodeURIComponent(
      activeFilePath
    )}`;

    const provider = new HocuspocusProvider({
      url: wsUrl,
      name: `${activeWorkspace.id}/${activeFilePath}`,
      document: ydoc,
    });

    provider.setAwarenessField("user", {
      name: user.displayName,
      color: user.avatarColor,
    });

    provider.on("status", (evt: { status: string }) => {
      setWsConnected(evt.status === "connected");
    });

    const updatePeers = () => {
      const states = provider.awareness?.getStates();
      if (!states) return;
      const peers: Array<{ clientId: number; name: string; color: string }> = [];
      states.forEach((st, clientId) => {
        const u = st.user as { name?: string; color?: string } | undefined;
        if (u?.name) {
          peers.push({
            clientId,
            name: u.name,
            color: u.color ?? "#3584e4",
          });
        }
      });
      setCollabPeers(peers);
    };

    provider.awareness?.on("change", updatePeers);

    const state = EditorState.create({
      doc: yText.toString(),
      extensions: [
        lineNumbers(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        langExt,
        autocompletion({ override: [completionSource] }),
        yCollab(yText, provider.awareness, { undoManager }),
        EditorState.readOnly.of(readOnly),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            setDocContent(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: host });
    viewRef.current = view;
    setDocContent(view.state.doc.toString());

    setEditorInsertCallback((snippet: string) => {
      if (readOnly) return;
      const sel = view.state.selection.main;
      view.dispatch({
        changes: { from: sel.from, to: sel.to, insert: snippet },
      });
      view.focus();
    });

    setEditorReplaceCallback((content: string) => {
      if (readOnly) return;
      ydoc.transact(() => {
        yText.delete(0, yText.length);
        yText.insert(0, content);
      });
      setDocContent(content);
    });

    return () => {
      setEditorInsertCallback(null);
      setEditorReplaceCallback(null);
      setCollabPeers([]);
      setWsConnected(false);
      view.destroy();
      viewRef.current = null;
      provider.destroy();
      ydoc.destroy();
    };
  }, [
    activeWorkspace?.id,
    activeWorkspace?.role,
    activeFilePath,
    user?.id,
    setDocContent,
    setCollabPeers,
    setWsConnected,
    setEditorInsertCallback,
    setEditorReplaceCallback,
  ]);

  if (!activeFilePath) {
    return (
      <div
        className="flex h-full items-center justify-center text-xs"
        style={{ color: "var(--fg-muted)" }}
      >
        Select or create a file from the left tree to start authoring.
      </div>
    );
  }

  return <div ref={containerRef} className="h-full w-full overflow-hidden" />;
}
