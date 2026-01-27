# Migration checklist (ZIP export)

This project can be transferred as a ZIP archive, but some elements are not inside the
repo and must be exported manually. Use the list below to avoid losing critical data
or secrets during the migration.

## 1) Source code & config files (inside the repo)

Make sure the ZIP includes these directories and files:

- `backend/` (service code and `pyproject.toml` for back-end apps).
- `services/` (currently `services/auth` for the auth service).
- `frontend/` (front-end application, if used).
- `infra/` (Helm/Kubernetes manifests, monitoring/logging configs).
- `docs/` (specs and migration notes).
- `src/`, `tests/`, `requirements.txt`, `setup.py`.
- Top-level `docker-compose.yml` for local environment.

## 2) Environment variables & secrets (NOT in repo)

ZIP does **not** include secrets. Export and transfer securely:

- `.env` files referenced by compose:
  - `services/auth/.env`
  - `backend/*/.env` (auth, courses, crm, docs, exams, notification)
- CI/CD secrets in GitHub/GitLab (tokens, registry credentials, etc.).
- Any cloud credentials (S3/MinIO keys, SMTP, OAuth, etc.).
- TLS certificates and private keys used by ingress or reverse proxies.

**Recommendation:** create `.env.example` files on the new repo and store real values
in a secrets manager (GitHub Secrets, Vault, AWS SSM, etc.).

## 3) Data & stateful services (NOT in repo)

When you migrate to a new account, these data stores must be copied explicitly:

- PostgreSQL database (dump/restore).
- Redis data (if persistence is enabled).
- RabbitMQ queues (export definitions if needed).
- MinIO/S3 buckets and objects.
- Docker volumes (e.g., `pgdata`, `minio_data` from `docker-compose.yml`).

## 4) Infrastructure & observability (partially in repo)

- Helm/K8s manifests from `infra/` are in the repo.
- **Outside repo:**
  - Cluster credentials and kubeconfig.
  - DNS records, load balancer configuration.
  - Monitoring dashboards (Grafana), alerting rules, log retention policies.
  - Secrets in Kubernetes (create them on the new cluster).

## 5) CI/CD pipelines & repo settings (NOT in repo)

- Webhooks/integrations.
- Branch protection rules.
- Required checks and environment protection.
- Container registries and images (export or re-build).

## 6) Verify after import

1. Unzip and run `docker compose up --build` to ensure local environment starts.
2. Confirm `.env` files are loaded and services can connect to PostgreSQL/Redis.
3. Run tests if available.
4. Validate that MinIO buckets and database data are present.

## 7) Common ZIP migration risks

- **Git history is lost** (ZIP only contains the latest snapshot).
- **Large files/LFS content** may be missing if Git LFS was used.
- **Hidden files** (like `.env`) are often excluded intentionally—restore them manually.
- **File permissions** may change (e.g., executable scripts).

---

If you want, I can also prepare a migration script (DB dump + MinIO sync + env export)
for your target platform and add `.env.example` templates.
