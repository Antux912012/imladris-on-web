# Self-Hosting & Deployment Guide

Imladris on Web supports **Docker Compose**, **Podman Compose (rootless)**, and **Kubernetes**.

## 1. Docker Compose (Local or University/Lab VPS)

```bash
./scripts/install-web.sh        # Local mode on http://localhost:8080
./scripts/install-web.sh --vps  # Production VPS mode with Caddy automatic HTTPS
```

For a lab or university server, edit `.env` before starting in `--vps` mode:

```dotenv
IMLADRIS_MODE=vps
AUTH_MODE=team
REGISTRATION_MODE=invite
ALLOWED_EMAIL_DOMAINS=university.edu,lab.org
PUBLIC_URL=https://imladris.university.edu
IMLADRIS_DOMAIN=imladris.university.edu
AIR_GAPPED_MODE=false
```

- `REGISTRATION_MODE=invite` allows the first administrator account to bootstrap the server, then requires a valid invite token for all subsequent registrations.
- `REGISTRATION_MODE=closed` disables self-registration completely after the first admin account is created.
- `AIR_GAPPED_MODE=true` disables external DOI/arXiv lookups and cloud AI endpoints.

## 2. Podman (Rootless)

`scripts/install-web.sh` automatically detects `podman compose` or `podman-compose`.

Both `imladris-api` and `imladris-runner` run as UID/GID `10001:10001`. When using rootless Podman with host bind mounts on SELinux-enabled distributions (Fedora, RHEL, Rocky), ensure host directories are labeled and owned for the container user namespace (`podman unshare chown -R 10001:10001 ./data` or `:Z,U` volume flags).

## 3. Kubernetes

Base Kustomize manifests are provided in `deploy/k8s/`:

1. Edit `deploy/k8s/deployment.yaml` to set `PUBLIC_URL`, `ALLOWED_EMAIL_DOMAINS`, and replace `JWT_SECRET` and `RUNNER_SHARED_SECRET` (e.g., `openssl rand -hex 32`).
2. Apply the manifests:

```bash
kubectl apply -k deploy/k8s/
```

The default manifest uses `replicas: 1` and `strategy: Recreate` so SQLite WAL and the shared `/data/workspaces` PVC remain consistent without requiring `ReadWriteMany` (RWX) storage.
