<!--
SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
SPDX-License-Identifier: Apache-2.0
-->

<p align="center">
  <img src="apps/web/public/favicon.svg" width="96" height="96" alt="Imladris on Web icon" />
</p>

<h1 align="center">Imladris on Web</h1>
<h3 align="center">Self-Hosted Collaborative Scientific Authoring &amp; Execution Studio</h3>

<p align="center">
  <em>Browser-based sister project to native <a href="https://github.com/Antux912012/imladris">Imladris</a>. Real-time CRDT co-authoring, line-anchored peer review, git-like revision checkpoints, and isolated container execution for research labs and universities.</em>
</p>

<p align="center">
  <a href="https://github.com/Antux912012/imladris"><img src="https://img.shields.io/badge/Sister%20Project-Imladris%20v0.42.1-5E81AC?style=flat-square" alt="Native Imladris"></a>
  <img src="https://img.shields.io/badge/Version-v0.2.0-blue?style=flat-square" alt="Version v0.2.0">
  <img src="https://img.shields.io/badge/Docker%20%7C%20Podman%20%7C%20K8s-Ready-2496ED?style=flat-square" alt="Container Ready">
  <img src="https://img.shields.io/badge/License-Apache--2.0-brightgreen?style=flat-square" alt="Apache-2.0 License">
</p>

<p align="center">
  <strong><a href="#quick-start">Quick Start</a></strong> ·
  <strong><a href="#collaboration--review-workflow">Collaboration &amp; Review</a></strong> ·
  <strong><a href="#parity-with-native-imladris">Parity Matrix</a></strong> ·
  <strong><a href="#architecture--security-boundary">Architecture</a></strong> ·
  <strong><a href="docs/DEPLOYMENT.md">Deployment Guide</a></strong> ·
  <strong><a href="SECURITY.md">Security</a></strong>
</p>

---

## Why Imladris on Web?

[Native Imladris](https://github.com/Antux912012/imladris) is a compiled Vala/GTK4 desktop studio built for single-workstation performance. However, multi-author manuscript preparation, classroom instruction, and cross-institutional peer review often require:

1. **Zero client installation** — collaborators, co-authors, and external reviewers open a browser URL without configuring local Python, R, Quarto, or Pandoc toolchains.
2. **Conflict-free concurrent editing** — real-time Yjs CRDT synchronization over WebSockets avoids manual Git merge conflicts on `.qmd`, `.Rmd`, and `.ipynb` files while preserving atomic disk persistence.
3. **Institutional data sovereignty** — labs and universities host the full stack on-premises (Docker, rootless Podman, or Kubernetes) with invite-only registration, domain allowlists, and an optional air-gapped mode.

---

## Collaboration & Review Workflow

### Role-Based Access Control (RBAC)
Workspace owners generate expiring, use-limited invite tokens scoped to a specific role, and can update or revoke member access at any time:

| Role | Read &amp; Preview | Inline Comments | Edit &amp; Execute | Export | Manage Invites &amp; Members |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **OWNER** | Yes | Yes | Yes | Yes | Yes |
| **EDITOR** | Yes | Yes | Yes | Yes | No |
| **REVIEWER** | Yes | Yes | No | Yes | No |
| **VIEWER** | Yes | No | No | No | No |

### Inline Article Comments
- Reviewers and editors attach comment threads to specific line numbers and quoted passages in any workspace document (`POST /api/workspaces/:id/comments`).
- Supports threaded replies, resolve/reopen state tracking, and real-time workspace event notifications.

### Git-Like Revision History, Diff &amp; Rollback
- **Deduplicated auto-snapshots**: Hocuspocus Yjs persistence writes atomic `.tmp` + `rename` updates to disk and records a binary Y.Doc snapshot only when the SHA-256 content hash changes.
- **Named checkpoints**: Authors can save explicit, labeled checkpoints (`POST /api/workspaces/:id/revisions`, e.g., *"Submitted Methods v2"*).
- **Line diff &amp; 1-click restore**: Inspect line-by-line diffs against the current file and restore any prior revision (`POST /api/workspaces/:id/snapshots/:snapshotId/restore`), updating both disk and connected editor buffers.

### Kernel Execution Modes
Each workspace selects one of two execution models in `imladris-runner`:
- **`SHARED` (Pair Research)**: One persistent stateful Python session per workspace; stdout, plots, and environment variables broadcast to all connected collaborators.
- **`PERSONAL` (Classrooms &amp; Labs)**: Shared document edits in Yjs with isolated per-user execution state (`<workspaceId>:<userId>`).

---

## Parity with Native Imladris

`imladris-on-web` shares format profiles, chunk parsing, and lossless `.ipynb` round-trip logic with [native Imladris (`v0.42.1`)](https://github.com/Antux912012/imladris), adapted for browser and container execution:

| Capability | Native Imladris (`v0.43.2`) | Imladris on Web (`v0.2.0`) |
| :--- | :--- | :--- |
| **Workbench Layout** | Focus Mode + 4-Quadrant `RStudioDockGrid` | Focus Mode + 4-Quadrant `react-resizable-panels` |
| **Document Formats** | `.qmd`, `.Rmd`, `.ipynb`, `.md`, `.tex`, `.R`, `.py`, `.ts`, `.html`, `.rtf`, `.csv`, `.tsv`, `.Rproj`, `.bib` | Shared `FormatProfile` parity (CodeMirror 6 + Yjs CRDT) |
| **Table Picker** | 8×8 grid (`Ctrl+Alt+T`) for MD, HTML, LaTeX, RTF | 8×8 format-aware popover (Markdown, HTML, LaTeX) |
| **Live Preview** | WebKitGTK 6.0 + Cairo | Sandboxed `<iframe sandbox="allow-scripts">` (Marked + KaTeX + HTML) |
| **Execution Kernels** | Host / Flatpak-bridge R, Python, Julia, SQL, Bash | Containerized FastAPI runner (stateful Python + `matplotlib`, R/Bash subprocesses) |
| **Export &amp; Provenance** | PDF, HTML, ODT, RTF, `.mallorn`, SHA-256 lockfiles | Pandoc (`html`, `pdf`, `docx`, `rtf`, `odt`, `latex`, `revealjs`, `ipynb`), `.mallorn.json`, `.provenance.json` |
| **AI Copilot (Elrond)** | Local `llama-server`/Ollama + Cloud failover | Local Ollama (`AI_LOCAL_URL`) with `AIR_GAPPED_MODE` enforcement |
| **Collaboration** | Single-user local buffer | Multi-user Yjs CRDT, presence avatars, inline comments, revision diff/restore |

> **Current Scope &amp; Known Limits:**
> - The default `services/runner/Dockerfile` bundles Python 3.12 (`numpy`, `pandas`, `matplotlib`) and Pandoc; R, Quarto CLI, and TeXLive/Tectonic must be added to the runner image for full R/Quarto/PDF rendering.
> - Domain-specific native studios (`Elbereth` Biostatistics, `Arekyer` Galaxy, `Taniquetil` AlphaFold, `Yavanna` Bio-Entity, WYSIWYG `.rtf`, and `DataGridViewer`) are tracked for future web ports.
> - Default Kubernetes deployment uses `replicas: 1` (`strategy: Recreate`) for SQLite WAL + shared workspace PVC consistency; multi-pod horizontal scaling requires PostgreSQL + Redis.

---

## Architecture &amp; Security Boundary

```text
Browser Clients (React 19 + CodeMirror 6 + Yjs)
        │  HTTPS / WSS
        ▼
Caddy 2 Reverse Proxy (imladris-edge)
   ├──► imladris-web  (Static SPA)
   └──► imladris-api  (Fastify 5 + Hocuspocus Yjs + SQLite/Drizzle, UID 10001)
           │  Internal network only (imladris-internal, X-Runner-Secret)
           ├──► imladris-runner (FastAPI + Python 3.12 + Pandoc, UID 10001, cap_drop: ALL)
           └──► imladris-ollama (Optional local LLM profile)
```

- **Zero-trust execution**: Browsers never connect directly to `imladris-runner`; `imladris-api` verifies HttpOnly JWT cookies and workspace RBAC before proxying execution.
- **Filesystem confinement**: `resolveSafeWorkspacePath` normalizes relative paths and canonicalizes ancestors with `realpathSync` to block path and symlink traversal.
- **Production fail-fast**: `IMLADRIS_MODE=vps` refuses to start with placeholder `JWT_SECRET` or `RUNNER_SHARED_SECRET` values.
- **Air-gapped &amp; lab controls**: `REGISTRATION_MODE=invite|closed`, `ALLOWED_EMAIL_DOMAINS`, and `AIR_GAPPED_MODE=true` (blocks external DOI/arXiv and cloud AI requests).

---

## Quick Start

### 1. Docker Compose or Rootless Podman

```bash
git clone https://github.com/Antux912012/imladris-on-web.git
cd imladris-on-web

# Local mode on http://localhost:8080 (auto-detects docker compose or podman compose)
./scripts/install-web.sh

# Production VPS mode with Caddy automatic TLS
./scripts/install-web.sh --vps
```

For a university or lab server, configure `.env` before running `--vps`:

```dotenv
IMLADRIS_MODE=vps
AUTH_MODE=team
REGISTRATION_MODE=invite
ALLOWED_EMAIL_DOMAINS=university.edu,lab.org
PUBLIC_URL=https://imladris.university.edu
IMLADRIS_DOMAIN=imladris.university.edu
```

### 2. Kubernetes

```bash
# Edit secrets and PUBLIC_URL in deploy/k8s/deployment.yaml first
kubectl apply -k deploy/k8s/
```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for rootless Podman SELinux volume labeling (`:Z,U`) and Kubernetes storage details.

---

## Repository Structure

- `packages/shared` (`@imladris/shared`) — Format profiles, chunk parser, lossless `.ipynb <-> .qmd` codec, IntelliSense engine, and Zod contracts.
- `apps/api` (`@imladris/api`) — Fastify 5 REST/WebSocket server, Drizzle ORM + `node:sqlite`, Argon2id auth, RBAC, comments, revision checkpoints/diff/restore, and Hocuspocus Yjs sync.
- `apps/web` (`@imladris/web`) — React 19 + Vite 6 + Tailwind CSS v4 + CodeMirror 6 workbench, Comments pane, Revision History modal, and Web Worker plugin host.
- `services/runner` — Isolated FastAPI execution and Pandoc/Mallorn export service.
- `deploy/k8s` &amp; `infra/caddy` — Kubernetes Kustomize manifests and Caddy reverse-proxy config.

---

## Development &amp; Verification

```bash
pnpm install
pnpm --filter @imladris/shared build
pnpm -r typecheck
pnpm -r build
pnpm -r test

# Python runner tests
python3 -m venv services/runner/.venv
services/runner/.venv/bin/pip install -r services/runner/requirements.txt pytest httpx
PYTHONPATH=services/runner services/runner/.venv/bin/pytest services/runner/tests/test_runner.py -v
```

---

## License

Licensed under the **Apache License 2.0** (`Apache-2.0`). See [LICENSE](LICENSE) and [NOTICE](NOTICE).
