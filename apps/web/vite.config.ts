// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "zustand"],
          codemirror: [
            "@codemirror/autocomplete",
            "@codemirror/commands",
            "@codemirror/lang-markdown",
            "@codemirror/lang-python",
            "@codemirror/search",
            "@codemirror/state",
            "@codemirror/view",
            "y-codemirror.next",
            "yjs",
            "@hocuspocus/provider",
          ],
          preview: ["katex", "marked"],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:3000",
        ws: true,
      },
    },
  },
});
