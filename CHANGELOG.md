# Changelog

All notable changes to **Imladris on Web** are documented in this file.

## [0.1.0] - 2026-11-24

### Added
- **Real-Time Collaborative Workbench**: Yjs CRDT + Hocuspocus WebSocket server, CodeMirror 6 editor, Focus & 4-Pane RStudio workbench modes, live presence avatars, and atomic disk persistence.
- **Inline Article Comments**: Line-anchored comment threads, replies, resolve/reopen workflow, and RBAC gating (`OWNER`, `EDITOR`, `REVIEWER`).
- **Git-Like Revision History**: Content-deduplicated Yjs snapshots, named checkpoints (`POST /api/workspaces/:id/revisions`), unified line diff viewer, and one-click revision restore.
- **Lab & University Access Control**: Invite token generation with role scoping (`EDITOR`, `REVIEWER`, `VIEWER`), atomic token redemption, member role management & revocation, `REGISTRATION_MODE` (`open`, `invite`, `closed`), `ALLOWED_EMAIL_DOMAINS`, and `AIR_GAPPED_MODE`.
- **Execution & Export**: Isolated FastAPI runner (`imladris-runner`) with persistent stateful Python worker, matplotlib plot capture, Shared/Personal kernel modes, Pandoc export (`html`, `pdf`, `docx`, `rtf`, `odt`, `latex`, `revealjs`, `ipynb`), and `.mallorn.json` provenance bundles.
- **Self-Hosting**: Docker Compose, rootless Podman Compose (`scripts/install-web.sh`), Caddy TLS VPS overlay, and Kubernetes base manifests (`deploy/k8s/`).
