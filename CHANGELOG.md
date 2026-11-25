# Changelog

All notable changes to **Imladris on Web** are documented in this file.

## [0.2.0] - 2026-11-25

### Added
- **Authentication, Admin Panel Center & Database**: User management (create, enable/disable, password reset), global access levels (`FULL`, `EDITOR`, `REVIEWER`, `VIEWER`), PostgreSQL 16 + SQLite dual-dialect support, and Nginx reverse-proxy compatibility for internal networks and external HTTPS deployments.
- **Institutional SSO**: Dynamic OIDC, ORCID, SAML, and LDAP provider configuration and login flow.
- **Classroom & Lab Assignments**: Course management, bulk CSV roster sync, LTI 1.3 launch endpoint, 1-click per-student workspace forking, SHA-256 submission snapshots, and grading.
- **Multi-Environment Container Toolchains**: Selectable Python 3.12, R 4.4 + Bioconductor, Julia 1.11, and Quarto + TeXLive runtime profiles.
- **Compliance & 21 CFR Part 11**: Searchable audit log with CSV/JSON export and cryptographic electronic signatures with password re-verification.
- **Double-Blind Peer Review, Git/Zenodo Archival, Template/Zotero Hub, Departments & HPC/GPU Queue**: Expiring anonymized referee links, Git commit/push & `.mallorn.json` archival deposits, shared journal/ICH E9 templates, delegated Department Admins, and Slurm/GPU batch job queuing.
- **Branding**: Transparent SVG branding icon and favicon.

## [0.1.0] - 2026-11-24

### Added
- **Real-Time Collaborative Workbench**: Yjs CRDT + Hocuspocus WebSocket server, CodeMirror 6 editor, Focus & 4-Pane RStudio workbench modes, live presence avatars, and atomic disk persistence.
- **Inline Article Comments**: Line-anchored comment threads, replies, resolve/reopen workflow, and RBAC gating (`OWNER`, `EDITOR`, `REVIEWER`).
- **Git-Like Revision History**: Content-deduplicated Yjs snapshots, named checkpoints (`POST /api/workspaces/:id/revisions`), unified line diff viewer, and one-click revision restore.
- **Lab & University Access Control**: Invite token generation with role scoping (`EDITOR`, `REVIEWER`, `VIEWER`), atomic token redemption, member role management & revocation, `REGISTRATION_MODE` (`open`, `invite`, `closed`), `ALLOWED_EMAIL_DOMAINS`, and `AIR_GAPPED_MODE`.
- **Execution & Export**: Isolated FastAPI runner (`imladris-runner`) with persistent stateful Python worker, matplotlib plot capture, Shared/Personal kernel modes, Pandoc export (`html`, `pdf`, `docx`, `rtf`, `odt`, `latex`, `revealjs`, `ipynb`), and `.mallorn.json` provenance bundles.
- **Self-Hosting**: Docker Compose, rootless Podman Compose (`scripts/install-web.sh`), Caddy TLS VPS overlay, and Kubernetes base manifests (`deploy/k8s/`).
