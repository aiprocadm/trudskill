# cdoprof

        codex/prepare-template-engine-for-document-generation
This repository contains utilities for generating documents for certificates,
protocols and acts using `python-docx` and `reportlab`. It also includes
export helpers for FIS FRDO (Excel) and EISOT (XML).

Infrastructure configuration lives in the `infra/` directory.
- CI scripts for linting, testing, migrations, and Docker builds.
- Helm chart and Kubernetes manifests for stateless deployment.
- Prometheus and Grafana for monitoring.
- Loki and an ELK stack for logging.
- PostgreSQL backup CronJob.

A development environment is provided via `docker-compose.yml`. It starts PostgreSQL, Redis, RabbitMQ, MinIO and the `auth` service. Run it with:

```bash
docker compose up --build
```
        main

## Migration checklist

If you plan to export the repo as a ZIP and move it to a new account, review the migration checklist:

- [`docs/migration-checklist.md`](docs/migration-checklist.md)
