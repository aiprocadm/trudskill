# Infrastructure

This directory contains scripts and manifests for CI, Kubernetes deployment, monitoring, logging, and PostgreSQL backups.

## CI

Scripts in `ci/` are used by GitHub Actions to run lint, tests, migrations, and build Docker images.

## Kubernetes Deploy

Helm chart in `k8s/` describes a stateless deployment of the application.

## Monitoring

Manifests for Prometheus and Grafana are in `monitoring/`.

## Logging

Manifests for Loki and a placeholder ELK stack are in `logging/`.

## Backups

CronJob manifest for PostgreSQL backups resides in `backups/`.
