# CDOProf — One-Time Server Setup Runbook

This runbook walks you through bootstrapping a fresh Ubuntu 22.04+ VPS so CDOProf can be
deployed and auto-updated via GitHub Actions (CD). The owner provides: a server with root SSH
access, a domain name with DNS you control, and SMTP credentials for sending notification
emails.

---

## What the owner provides

| Item             | Notes                                                        |
| ---------------- | ------------------------------------------------------------ |
| Server           | Ubuntu 22.04+ VPS with at least 4 GB RAM, 2 vCPU, 40 GB disk |
| Domain           | A-record under your control (e.g. `academy.example.ru`)      |
| DNS access       | To create the A-record before first boot                     |
| SMTP credentials | Host, port, user, password, from-address for outbound email  |

---

## Step 1 — Install Docker

Run as root (or with `sudo`):

```bash
curl -fsSL https://get.docker.com | sh
```

Verify the Compose plugin is available:

```bash
docker compose version
```

The output should show `Docker Compose version v2.x.x` or later.

---

## Step 2 — Configure the firewall (ufw)

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw default deny incoming
ufw default allow outgoing
ufw --force enable
ufw status
```

All other ports (PostgreSQL, RabbitMQ, MinIO, Redis) are intentionally not published to the
host — they are internal to the Docker network.

---

## Step 3 — Create the deploy user

```bash
# Create the user
adduser deploy          # follow prompts; set a strong password

# Add to the docker group so it can run docker commands without sudo
usermod -aG docker deploy

# Create the SSH directory
mkdir -p /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chown deploy:deploy /home/deploy/.ssh
```

Paste the deploy user's **public** SSH key into `authorized_keys`:

```bash
echo "ssh-ed25519 AAAA... your-deploy-key-public-half" \
  >> /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
```

The matching **private** key becomes the GitHub secret `DEPLOY_SSH_KEY` (see Step 9).

---

## Step 4 — Clone the repository

Switch to the deploy user and clone to the path that will become `DEPLOY_PATH`:

```bash
su - deploy
git clone https://github.com/YOUR_ORG/cdoprof.git /home/deploy/cdoprof --branch main
```

Note the absolute path (e.g. `/home/deploy/cdoprof`). This is your `DEPLOY_PATH`.

---

## Step 5 — Configure the production environment

```bash
cd /home/deploy/cdoprof
cp infra/.env.production.example infra/.env.production
```

Open the file and fill every `CHANGE_ME_*` and `YOUR_DOMAIN` placeholder:

```bash
nano infra/.env.production
```

### Secrets — generate each with:

```bash
openssl rand -hex 32
```

| Variable                     | Notes                                        |
| ---------------------------- | -------------------------------------------- |
| `AUTH_JWT_SECRET`            | Independent secret                           |
| `SESSION_SECRET`             | Independent secret                           |
| `REALTIME_PUBLISH_KEY`       | Independent secret                           |
| `INTEGRATION_WEBHOOK_SECRET` | Independent secret                           |
| `SUPERTOKENS_API_KEY`        | Generate once                                |
| `API_KEYS`                   | **Must equal `SUPERTOKENS_API_KEY` exactly** |

### Passwords — pairs that must match:

| Left side (URL)                                        | Right side (container var)  |
| ------------------------------------------------------ | --------------------------- |
| `CHANGE_ME_DB_PASSWORD` in `DATABASE_URL`              | `POSTGRES_PASSWORD`         |
| `CHANGE_ME_RABBIT_PASSWORD` in `RABBITMQ_URL`          | `RABBITMQ_DEFAULT_PASS`     |
| `CHANGE_ME_MINIO_USER` in `S3_ACCESS_KEY`              | `MINIO_ROOT_USER`           |
| `CHANGE_ME_MINIO_PASSWORD` in `S3_SECRET_KEY`          | `MINIO_ROOT_PASSWORD`       |
| `CHANGE_ME_DB_PASSWORD` in `POSTGRESQL_CONNECTION_URI` | same as `POSTGRES_PASSWORD` |

### Domain — replace every occurrence of `YOUR_DOMAIN`:

```
PUBLIC_DOMAIN=academy.example.ru
PUBLIC_BASE_URL=https://academy.example.ru
CORS_ORIGIN=https://academy.example.ru
BACKEND_PUBLIC_URL=https://academy.example.ru
SUPERTOKENS_API_DOMAIN=https://academy.example.ru
SUPERTOKENS_WEBSITE_DOMAIN=https://academy.example.ru
REALTIME_PUBLIC_URL=https://academy.example.ru
NEXT_PUBLIC_API_BASE_URL=https://academy.example.ru/api/v1
NEXT_PUBLIC_REALTIME_URL=wss://academy.example.ru/ws
SMTP_FROM=no-reply@academy.example.ru
```

### SMTP:

```
SMTP_HOST=smtp.example.ru
SMTP_PORT=587
SMTP_USER=no-reply@example.ru
SMTP_PASSWORD=your-smtp-password
SMTP_FROM=no-reply@academy.example.ru
```

### Default tenant:

```
NEXT_PUBLIC_DEFAULT_TENANT_ID=tenant_demo
```

This must match the tenant created by migrations (`tenant_demo` out of the box; change here and
in `bootstrap-admin.md` if you rename it).

---

## Step 6 — DNS

Create an A-record in your DNS control panel:

```
academy.example.ru.  A  <YOUR_SERVER_IP>
```

Wait for propagation (typically 1–5 minutes for most providers; up to 48 hours in edge cases).
Verify:

```bash
dig +short academy.example.ru
```

The output should be your server IP. Do not proceed to Step 7 until DNS resolves — Caddy needs
it to obtain a TLS certificate via ACME.

---

## Step 7 — First boot

Load the env file and start all services. This is exactly what the CD workflow runs on every
subsequent deploy:

```bash
cd /home/deploy/cdoprof
set -a
. infra/.env.production
set +a

docker compose -f infra/docker-compose.prod.yml up -d --build
```

The backend auto-runs all SQL migrations on startup (`DB_MIGRATIONS_ENABLED=true`). This
includes the seed data — tenant `tenant_demo`, roles, and demo users — so no manual SQL is
needed for the initial schema.

---

## Step 8 — Verify

Check that all containers started and are healthy:

```bash
docker compose -f infra/docker-compose.prod.yml ps
```

All services should show `healthy` or `running`. Then check the API health endpoint and TLS:

```bash
curl -fsS https://academy.example.ru/api/v1/health/live
```

Expected response: `{"status":"ok"}` (or similar). If Caddy is still obtaining the TLS cert,
wait 30 seconds and retry. You can follow the Caddy logs:

```bash
docker compose -f infra/docker-compose.prod.yml logs -f caddy
```

---

## Step 9 — Enable continuous deployment (GitHub Actions)

Add these four secrets to your GitHub repository (`Settings → Secrets and variables → Actions`):

| Secret           | Value                                                     |
| ---------------- | --------------------------------------------------------- |
| `DEPLOY_HOST`    | Your server IP or hostname                                |
| `DEPLOY_USER`    | `deploy`                                                  |
| `DEPLOY_SSH_KEY` | The **private** key whose public half you added in Step 3 |
| `DEPLOY_PATH`    | Absolute path from Step 4, e.g. `/home/deploy/cdoprof`    |

After this, every push to `main` that passes CI will automatically SSH into the server, pull
the latest code, rebuild images, and restart services. No manual deploy is needed.

---

## Step 10 — Enable automated backups

The backup script (`infra/backup.sh`) dumps PostgreSQL and snapshots the MinIO volume nightly.
Install it as a cron job for the deploy user:

```bash
crontab -e -u deploy
```

Add the following line (matches the header comment in `infra/backup.sh`):

```
0 3 * * *  cd /home/deploy/cdoprof && infra/backup.sh >> /var/log/cdoprof-backup.log 2>&1
```

Backups land in `/var/backups/cdoprof` (override with `CDOPROF_BACKUP_DIR`). Retention defaults
to 14 days (override with `CDOPROF_BACKUP_RETENTION_DAYS`). See `infra/backup.sh` for manual
restore instructions.
