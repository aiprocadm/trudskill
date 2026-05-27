# Pillar A Incidents — Runbook

> Дежурный runbook для модуля выдачи документов (Pillar A): сценарии и
> процедуры. Формат каждого сценария: **Симптом → Проверки → Действия → Verify**.
>
> Спека: [Pillar A hardening](../superpowers/specs/2026-05-27-pillar-a-hardening-design.md) §5.
>
> Связанная документация:
>
> - [Operations runbook](../operations-runbook.md) — общий runbook платформы.
> - [Pillar A regulated training design](../superpowers/specs/2026-05-22-regulated-training-foundation-design.md).

---

## 1. Документ не выдался после завершения курса

**Симптом:** ученик завершил курс, документа нет в журнале (`/admin/issuance-journal`).

**Проверки:**

1. Запросить `GET /api/v1/document-tasks?sourceEntityType=enrollment&sourceEntityId=<enrollmentId>` → найти task со status=failed.
2. Прочитать `task.errorMessage`.
3. Посмотреть audit-events: `SELECT * FROM audit.audit_log WHERE entity_id = '<taskId>' AND action LIKE 'documents.task.%' ORDER BY created_at;`.
4. Посмотреть worker-логи (Yandex Cloud Logging) по `correlation_id` из task.

**Действия:**

1. Если ошибка ретрайабельная (S3 timeout, БД disconnect): `POST /api/v1/document-tasks/<taskId>/retry`.
2. Если ошибка валидации (missing required variable): связаться с методистом, попросить заполнить переменную, retry.
3. Если ошибка непонятная — escalate в backend-канал. Не делать ручное создание `documents.generated` через БД (потеряем audit-trail).

**Verify:**

- Появилась запись в `documents.generated`.
- Audit-event `documents.task.completed`.
- Ученик видит документ в кабинете (`GET /api/v1/me/documents`).

---

## 2. Нужно отозвать ошибочно выданный документ (массовая ошибка)

**Симптом:** групповой приказ выдал документы с неправильным шаблоном/датой — нужно отозвать N штук одного приказа.

**Проверки:**

1. Найти group order: `SELECT id FROM documents.generated WHERE document_type='order' AND source_entity_id='<groupId>' AND status != 'archived';`.
2. Перечислить связанные сертификаты: `SELECT id, document_number FROM documents.generated WHERE group_order_document_id = '<orderId>';`.

**Действия:**

1. Для каждого сертификата: `POST /api/v1/admin/documents/<id>/revoke` с body `{ "reason": "<человекочитаемая причина>" }`. **Reason обязателен** — без него 400.
2. Если нужен новый выпуск с правильным шаблоном — после revoke вызвать `POST /api/v1/admin/documents/<id>/reissue` с body `{ "reason": "..." }`. Это создаст новый документ с новым номером и привяжет `replaces` / `replaced_by` links.
3. Для самого order: `revoke` тоже отдельно, если его тоже нужно отозвать.

**Verify:**

- `SELECT status, revoked_at, revocation_reason FROM documents.generated WHERE id IN (...);` → все `revoked`.
- Audit: `SELECT * FROM audit.audit_log WHERE action='documents.revoked' AND entity_id IN (...);` → запись на каждый.
- QR-верификация (`GET /api/v1/public/verify/<token>`) для отозванных → `{"status":"revoked", "revokedAt": "..."}`.
- Учёт переаттестации (если был для этих сертификатов) сброшен.

---

## 3. QR-проверка возвращает "не найдено" для валидного документа

**Симптом:** ученик/работодатель сканирует QR — verify-страница говорит «Документ с таким QR-кодом не найден».

**Проверки:**

1. Извлечь `token` из QR-URL (часть после `/verify/`).
2. `SELECT id, status, document_number, qr_token FROM documents.generated WHERE qr_token = '<token>';` — найден ли?
3. Если найден, но `status = 'revoked'` или `archived` — это правильное поведение (revoke вернёт `revoked`, archived = `not_found`).
4. Если не найден — проверить, что миграция 0033 (`qr_token` column) применена: `SELECT column_name FROM information_schema.columns WHERE table_schema='documents' AND table_name='generated' AND column_name='qr_token';`.
5. Если column пустой/null — токен не сгенерён. Проверить, что `generateQrToken()` вызывается во всех путях создания документа (`completeTask`, `reissueDocument`, `issueGroupOrder`).

**Действия:**

1. Если документ есть, но `archived` без бизнес-повода — `restore` (manual SQL: `UPDATE documents.generated SET status='final', archived_at=NULL WHERE id='<id>';`). После — audit-запись вручную (`INSERT INTO audit.audit_log (...) VALUES (...);` с action='documents.archived_reverted_manually').
2. Если QR битый (token не существует у документа) — `POST /api/v1/admin/documents/<id>/reissue` с reason "Восстановление QR-токена". Это создаст новый документ с новым token, оригинал revoke'ается.

**Verify:**

- Повторное `GET /api/v1/public/verify/<token>` возвращает `{"status":"valid", ...}`.
- Audit `documents.qr_verification_requested` от тестового запроса виден.

---

## 4. Запрос ПДн от ученика (152-ФЗ): «удалить мои данные»

**Симптом:** ученик прислал письменное требование удаления персональных данных по 152-ФЗ (статья 14, право субъекта на удаление).

**Проверки:**

1. Совпадение личности: запросить копию паспорта/доверенность.
2. Проверить наличие действующих документов: `SELECT id, document_number, document_type, status, document_date FROM documents.generated WHERE source_entity_id IN (SELECT id FROM mvp.enrollments WHERE learner_id='<learnerId>') AND status NOT IN ('archived');`.
3. Если документы есть — **нельзя полностью удалить** учётку: 273-ФЗ (ст. 76) требует хранения сведений об образовании учеников.

**Действия:**

**Case A: документов нет** (ученик не прошёл ни одного курса до выдачи документа)

1. `DELETE FROM mvp.learners WHERE id='<learnerId>' AND tenant_id='<tenantId>';` — каскадом удалятся enrollments, group_learners.
2. Audit (writeCritical): через сервис `POST /api/v1/admin/learners/<id>/erase` (если эндпоинт ещё не реализован — добавить в отдельной задаче; пока ручной SQL + ручной audit-record).

**Case B: документы есть** (есть выданные удостоверения)

1. **Анонимизация** в `mvp.learners`:
   - `UPDATE mvp.learners SET first_name='Удалено по запросу', last_name='Удалено по запросу', middle_name=NULL, snils=NULL, email=NULL, position=NULL WHERE id='<learnerId>';`.
2. Audit (writeCritical): action='learner.personal_data_erased', actorId=admin, oldValues замаскированы автоматически (SENSITIVE_FIELDS), newValues={ anonymised: true, reason: '152-fz request' }.
3. Документы остаются в `documents.generated` с прежним `document_number`, `document_date`, шаблоном, статусом. `source_entity_id` (= enrollmentId) тоже остаётся.

**Verify:**

- Ученик не появляется в поиске админки.
- `GET /api/v1/admin/learners/<id>` возвращает строку с `firstName='Удалено по запросу'`, NULL ПДн.
- QR-верификация выданных документов работает (status='valid'), но не показывает ФИО (она и так не показывает).
- Audit `learner.personal_data_erased` есть в `audit.audit_log`.
- Журнал выдачи `/admin/issuance-journal` показывает строки документов (но без обогащения ФИО — там либо пустота, либо «Удалено»).

---

## 5. Подозрение на компрометацию admin-аккаунта (массовый revoke)

**Симптом:** в журнале выдачи аномальное количество revoke за короткий период от одного `actorId`. Метрика `documents_revoked_total{tenant=X}` показывает spike.

**Проверки:**

1. `SELECT id, action, entity_id, ip, user_agent, created_at FROM audit.audit_log WHERE actor_id='<userId>' AND action LIKE 'documents.%' AND created_at > now() - interval '1 hour' ORDER BY created_at;`.
2. Свериться с известными активностями этого admin'а (есть ли законный массовый revoke этого периода? Запросить у владельца центра).
3. Сравнить IP/UA в audit с обычными для этого admin'а.

**Действия:**

1. Немедленно: `POST /api/v1/iam/sessions/<userId>/revoke-all` — закрыть все активные сессии этого admin'а.
2. Удалить permission `documents.write` у роли admin'а временно: `POST /api/v1/iam/users/<userId>/permissions/revoke` body `{"permissions":["documents.write"]}`.
3. После расследования (если это был incident): rotate magic-link секрет, force password reset для всех админов того тенанта, ручной reissue revoked-by-attacker документов (см. §2 «массовый отзыв» — обратный процесс).
4. Записать инцидент через `learner.personal_data_erased`-аналог (создать action='security.account_compromised', actorId=security-admin).

**Verify:**

- Метрика `documents_revoked_total` вернулась к baseline.
- Audit `iam.permission_revoked` + `iam.session_revoked` есть.
- Восстановленные документы (если был reissue) валидны через QR.
- Владелец центра уведомлён, инцидент задокументирован в `docs/incidents/YYYY-MM-DD-<short>.md` (создать вручную).

---

## Приложения

### Полезные SQL-запросы

```sql
-- Все revoke за последний час
SELECT actor_id, entity_id, created_at, ip
  FROM audit.audit_log
  WHERE action='documents.revoked' AND created_at > now() - interval '1 hour'
  ORDER BY created_at;

-- Документы с возможно битым QR
SELECT id, document_number, qr_token, length(qr_token) AS token_len
  FROM documents.generated
  WHERE qr_token IS NULL OR length(qr_token) < 16;

-- Все access-events ПДн за день
SELECT actor_id, entity_id, ip, created_at
  FROM audit.audit_log
  WHERE action='learner.personal_data_accessed' AND created_at::date = current_date
  ORDER BY created_at;
```

### Контакты

- Backend on-call: `#cdoprof-backend` (Slack).
- Security on-call: `#cdoprof-security` (Slack).
- Юридическая поддержка (152-ФЗ): см. `docs/operations-runbook.md` §контакты.
