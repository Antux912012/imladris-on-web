# Self-Hosting & Deployment Guide

Imladris on Web supports **Docker Compose**, **Podman Compose (rootless)**, and **Kubernetes**, with **PostgreSQL 16** and **Nginx** reverse-proxy compatibility for internal networks and external HTTPS deployments.

## 1. Docker Compose (PostgreSQL + Nginx)

Copy `.env.example` to `.env`, set strong secrets, and optionally configure an initial bootstrap administrator account:

```bash
cp .env.example .env
# Edit JWT_SECRET, RUNNER_SHARED_SECRET, POSTGRES_PASSWORD, and ADMIN_PASSWORD
docker compose up -d --build
```

The built-in `proxy` service runs `nginx:1.27-alpine` on port `${NGINX_HTTP_PORT:-8080}` (or port `80` when paired with `docker-compose.vps.yml`), serving the web UI and proxying `/api/*`, `/ws/*` (WebSockets), and `/health` to `imladris-api`.

### Internal Network vs. External Exposure (Host Nginx)

- **Internal Network (LAN / Lab Intranet):** Set `NGINX_HTTP_PORT=80` (or `8080`) and `CORS_ORIGINS=*` (or your internal hostname/IP). Users can visit `http://<server-ip>/` directly as a normal webpage.
- **External Exposure (Public HTTPS via Host Nginx):** Keep Docker bound to `127.0.0.1:8080` and place your host Nginx in front using [infra/nginx/external-site.conf.example](../infra/nginx/external-site.conf.example). `imladris-api` has `trustProxy: true` enabled and sets `Secure` cookies automatically when `X-Forwarded-Proto: https` is present.

### Admin Panel Center & User Management

- Set `ADMIN_EMAIL`, `ADMIN_DISPLAY_NAME`, and `ADMIN_PASSWORD` in `.env` to auto-seed an administrator on startup (or register the first account in an empty database, which is automatically promoted to `ADMIN`).
- Administrators see an **Admin** button in the top bar opening the **Admin Panel Center** to create users, enable/disable accounts, assign global access levels (`FULL`, `EDITOR`, `REVIEWER`, `VIEWER`), reset passwords, and manage per-workspace memberships.

### Registration & Air-Gapped Controls

- `REGISTRATION_MODE=invite` allows the first admin account to bootstrap the server, then requires an invite token (or admin creation) for new accounts.
- `REGISTRATION_MODE=closed` disables public self-registration completely; only admins can create accounts from the Admin Panel Center.
- `ALLOWED_EMAIL_DOMAINS=university.edu,lab.org` restricts self-registration to institutional email domains.
- `AIR_GAPPED_MODE=true` disables external DOI/arXiv lookups and cloud AI endpoints.

## 2. Podman (Rootless)

`scripts/install-web.sh` automatically detects `podman compose` or `podman-compose`.

Both `imladris-api` and `imladris-runner` run as UID/GID `10001:10001`. When using rootless Podman with host bind mounts on SELinux-enabled distributions (Fedora, RHEL, Rocky), ensure host directories are labeled and owned for the container user namespace (`podman unshare chown -R 10001:10001 ./data` or `:Z,U` volume flags).

## 3. Kubernetes

Base Kustomize manifests are provided in `deploy/k8s/`:

1. Edit `deploy/k8s/deployment.yaml` to set `PUBLIC_URL`, `ALLOWED_EMAIL_DOMAINS`, `DATABASE_URL` (PostgreSQL or SQLite), and replace `JWT_SECRET` and `RUNNER_SHARED_SECRET` (e.g., `openssl rand -hex 32`).
2. Apply the manifests:

```bash
kubectl apply -k deploy/k8s/
```
