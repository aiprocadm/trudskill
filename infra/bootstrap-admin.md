# CDOProf — First-Admin Bootstrap Runbook

This runbook covers what you get from the migration seed, how to make an admin you can
actually log in as, what security hardening is required before go-live, and how to verify
the first login.

> All `docker compose` commands are run from the repo root on the server, logged in as the
> `deploy` user (or with an appropriate account that is in the `docker` group).

---

## 1. What the seed gives you

Migrations auto-run on backend startup (`DB_MIGRATIONS_ENABLED=true` in `.env.production`).
Migration `0010_iam_role_permissions_and_seed.sql` creates the following in a fresh database:

**Tenant:**

| id            | code   | name          | status   |
| ------------- | ------ | ------------- | -------- |
| `tenant_demo` | `demo` | `Demo Tenant` | `active` |

**Users (all in `tenant_demo`, all sharing one dev password hash):**

| id                 | login            | email                  | role             | status    |
| ------------------ | ---------------- | ---------------------- | ---------------- | --------- |
| `u_platform_admin` | `platform_admin` | `platform@demo.local`  | `platform_admin` | `active`  |
| `u_tenant_admin`   | `tenant_admin`   | `tenant@demo.local`    | `tenant_admin`   | `active`  |
| `u_manager`        | `manager`        | `manager@demo.local`   | `manager`        | `active`  |
| `u_methodist`      | `methodist`      | `methodist@demo.local` | `methodist`      | `active`  |
| `u_blocked`        | `blocked_user`   | `blocked@demo.local`   | `manager`        | `blocked` |

Migration `0038_iam_learner_role_and_seed.sql` adds:

| id          | login     | email                | role      | status   |
| ----------- | --------- | -------------------- | --------- | -------- |
| `u_learner` | `learner` | `learner@demo.local` | `learner` | `active` |

**Shared dev password hash:** `d845591b855ba5b9a20db65eee522f76ed85858551b8f813ef146725e1a59264`

This is `sha256("pwd:Password123!")` — verified in
`apps/backend/src/modules/iam/crypto.util.test.ts`. The plaintext seed password is
`Password123!` and it is widely known from the codebase.

**Frontend default tenant:** `NEXT_PUBLIC_DEFAULT_TENANT_ID=tenant_demo` in `.env.production`
instructs the browser to send `x-tenant-id: tenant_demo` on every request, which matches the
seeded tenant out of the box. No further tenant configuration is needed for a single-tenant
pilot.

---

## 2. Make an admin you can actually log in as

The primary login method is **magic-link by email** (see Section 4). None of the seeded users
have a real email address (`@demo.local` receives no mail), so you must update one to your
real email before you can log in.

The recommended account for the pilot admin is `u_tenant_admin` (role `tenant_admin`), which
has full permissions over learning, enrollments, users, roles, and documents.

### 2a — Update the email and display name

Replace `admin@example.ru` and `Иван Иванов` with real values:

```bash
docker compose -f infra/docker-compose.prod.yml exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
UPDATE iam.users
SET email = 'admin@example.ru',
    display_name = 'Иван Иванов',
    updated_at = now()
WHERE id = 'u_tenant_admin'
  AND tenant_id = 'tenant_demo';
"
```

Confirm the change:

```bash
docker compose -f infra/docker-compose.prod.yml exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
SELECT id, email, display_name, status FROM iam.users WHERE id = 'u_tenant_admin';
"
```

### 2b — How magic-link login works

> **IMPORTANT — current implementation note:** The magic-link email sender registered in
> `apps/backend/src/modules/iam/iam.module.ts` (line 42-43) is `LoggingMagicLinkEmailSender`.
> This implementation does NOT send email — it writes the login URL to the backend container's
> stdout log. The SMTP settings in `.env.production` are used only for notification emails
> (enrollment confirmations, reminders), not for magic-link delivery. This is a known
> Phase 1 limitation marked `(Phase 1: log-only)` in the source code.

**As a result, the first-login procedure is:**

1. Navigate to `https://YOUR_DOMAIN/login` in your browser.
2. Enter your real email address in the "Вход по ссылке на почту" form and click
   "Отправить ссылку". The API responds with `{"status":"sent"}` — but no email is
   delivered yet.
3. Read the magic-link URL from the backend container logs:

   ```bash
   docker compose -f infra/docker-compose.prod.yml logs backend \
     | grep "magic_link.delivery"
   ```

   The log line looks like:

   ```
   magic_link.delivery to=admin@example.ru url=https://YOUR_DOMAIN/login/magic-link/<token>
   ```

4. Open that URL in your browser. The page at `/login/magic-link/<token>` automatically
   redeems the token, creates a session, and redirects you to the admin cabinet.

**Token TTL:** 15 minutes (configured in `iam.module.ts`). If the token expires, request a
new one from the login page.

**The flow in code:**

- `POST /api/v1/auth/magic-link/request` — `AuthController.requestMagicLink` (line 81)
  creates a token via `MagicLinkService.requestLink`, stores the SHA-256 hash in
  `iam.magic_link_tokens`, and calls `MagicLinkEmailSender.sendMagicLink` (currently
  log-only).
- The URL format is `PUBLIC_BASE_URL + /login/magic-link/<rawToken>` — built by
  `buildMagicLinkUrl` in `magic-link-email-sender.ts` (line 16).
- `POST /api/v1/auth/magic-link/redeem` — `AuthController.redeemMagicLink` (line 103)
  validates the token, calls `IamService.findOrCreateByEmail` to look up the user by email,
  marks the token consumed, and issues a session (JWT access token + HTTP-only refresh
  cookie).

**TO CONFIRM AT DEPLOY:** If a Phase 0 SMTP-backed magic-link sender is wired before
go-live (replacing `LoggingMagicLinkEmailSender` in `iam.module.ts`), the log-extraction
step above becomes unnecessary and real email delivery will work. Verify by checking
`iam.module.ts` line 42-43 in the deployed version.

---

## 3. Security hardening (required before go-live)

### 3a — Block or delete unused demo users

The seeded users share the plaintext password `Password123!` (public knowledge from the
codebase). The password login endpoint (`POST /auth/login`) is active in production — it
accepts login + password. Block all demo users that are not the pilot admin:

```bash
docker compose -f infra/docker-compose.prod.yml exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
UPDATE iam.users
SET status = 'blocked', updated_at = now()
WHERE tenant_id = 'tenant_demo'
  AND id IN ('u_platform_admin', 'u_manager', 'u_methodist', 'u_learner')
  AND id <> 'u_tenant_admin';
"
```

`u_blocked` already has `status = 'blocked'` from the migration seed, so it needs no action.

Verify the result:

```bash
docker compose -f infra/docker-compose.prod.yml exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
SELECT id, login, email, status FROM iam.users WHERE tenant_id = 'tenant_demo' ORDER BY id;
"
```

Expected: all rows except `u_tenant_admin` show `blocked`.

### 3b — Is password login still a risk after blocking?

The `auth.service.ts` login method checks `user.status === 'blocked'` before verifying the
password, so blocked users cannot authenticate via either password or magic-link. Blocking the
unused seed users is sufficient.

### 3c — Magic-link and the dev password hash

If magic-link is the only login path a user ever takes, the dev `password_hash` stored in the
database is never verified — so it poses no direct authentication risk for magic-link-only
users. However, the password login endpoint remains active (there is no env flag to disable
it). Blocking unused accounts (3a) is therefore the required mitigation. Do NOT rely on
"nobody knows the password" as a defense — `Password123!` is in the test suite.

### 3d — Rename the u_tenant_admin password hash (optional, belt-and-suspenders)

If you want to eliminate the dev hash for the pilot admin account entirely, update it to a
random bcrypt-like placeholder that will never match any real password. Run once:

```bash
docker compose -f infra/docker-compose.prod.yml exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
UPDATE iam.users
SET password_hash = 'DISABLED:' || encode(gen_random_bytes(32), 'hex'),
    updated_at = now()
WHERE id = 'u_tenant_admin' AND tenant_id = 'tenant_demo';
"
```

This stores a non-matching prefix that `verifyPassword` will never accept (it checks for
a `$`-separated scrypt format or 64-char hex). The user can still log in via magic-link.

---

## 4. Verification — first login end-to-end

1. Confirm Section 2a ran successfully (email is your real address).
2. Confirm Section 3a ran (unused accounts blocked).
3. Open `https://YOUR_DOMAIN/login` in a browser.
4. Enter your real email; click "Отправить ссылку".
5. Run: `docker compose -f infra/docker-compose.prod.yml logs backend | grep magic_link.delivery`
6. Copy the URL from the log; open it in the browser.
7. You should be redirected to `/admin/cockpit` (or the admin cabinet landing).
8. Click your avatar or profile area — confirm display name and email are correct.

If step 7 fails with "Ссылка недействительна или истекла": the token expired (15-minute TTL)
or was already consumed. Return to the login page and request a new link.

If step 5 shows no matching log line: the email entered in step 4 does not match any
`iam.users.email` in the database. Re-check the UPDATE from Section 2a.
