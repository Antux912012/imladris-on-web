# Security Policy

## Reporting a Vulnerability

Please do **not** open a public GitHub issue for security vulnerabilities.
Report security issues privately via GitHub Security Advisories or contact the maintainer directly.

## Self-Hosting Hardening Checklist

1. Set `IMLADRIS_MODE=vps` in production; startup will fail if `JWT_SECRET` or `RUNNER_SHARED_SECRET` are left at default placeholder values.
2. Set `REGISTRATION_MODE=invite` (or `closed`) and optionally `ALLOWED_EMAIL_DOMAINS=your-university.edu` so uninvited users cannot register.
3. Set `AIR_GAPPED_MODE=true` for PHI/restricted lab environments to block external DOI/arXiv and cloud AI calls.
4. Keep `imladris-runner` on the internal network (`imladris-internal`) with `no-new-privileges: true` and `cap_drop: [ALL]`.
