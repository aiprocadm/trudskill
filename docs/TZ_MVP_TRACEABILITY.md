# Трассировка рекомендуемого MVP (SDOPROF) → реализация

Источник требований: [SDOPROF_TZ_FINAL.md](../SDOPROF_TZ_FINAL.md) (§2.1 MVP, §41 backlog, §873 рекомендуемый MVP).

Эталонный текст ТЗ заказчика в репозитории не приложён (см. §846–847 финального документа). Ниже — соответствие **текущему коду** и **артефактам этого спринта**; столбец «Must/Should» — из рекомендаций документа, не договор с заказчиком.

| ID / область                | Must/Should (по финальному ТЗ-документу) | Реализация / статус                                                                                                                           | Примечание               |
| --------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| BL-001 IAM, RBAC, tenant    | Must                                     | [apps/backend/src/modules/iam](apps/backend/src/modules/iam), TenantGuard                                                                     | Аудит прав — частично    |
| BL-002 Жизненный цикл курса | Must                                     | [mvp.service.ts](apps/backend/src/modules/mvp/mvp.service.ts) courses publish/archive                                                         |                          |
| BL-003 Массовые назначения  | Must                                     | `POST /enrollments/bulk`, см. контроллер MVP                                                                                                  | После задачи TASK-003    |
| BL-004 Прогресс, без утечек | Must                                     | `group_courses` + доменные проверки MVP                                                                                                       | См. handoff              |
| BL-005 Попытки тестов       | Must                                     | assessment в MVP модуле                                                                                                                       |                          |
| BL-006 Задания и ревью      | Must                                     | submissions/reviews lifecycle                                                                                                                 | См. handoff              |
| BL-007 Сертификаты          | Must                                     | Listener [enrollment-document-issuance.listener.ts](apps/backend/src/modules/documents/enrollment-document-issuance.listener.ts), UI/Task-004 | Проверять bindings       |
| BL-008 KPI / отчёты         | Should                                   | `/reports/kpi-snapshot`, страница отчётов                                                                                                     | После TASK-005           |
| BL-010 API hardening        | Must                                     | HTTP integration tests, анти-IDOR                                                                                                             | Постоянное сопровождение |
| §39 E2E критичные роли      | Принятие                                 | vitest business-flows + smoke                                                                                                                 | После TASK-008           |
| §14 Launch                  | Принятие                                 | [LAUNCH_RUNBOOK.md](./LAUNCH_RUNBOOK.md), NFR-снимок                                                                                          | См. Task-009–012         |

## Scope MVP — требует подтверждения заказчиком

- SSO/LDAP, юридически значимые документы, заявки/согласования, точные интеграции — помечены в SDOPROF как «Требует у доуточнения»; до ответа заказчика считаются вне минимального пилота, если явно не согласовано.

Обновление: дополняйте таблицу после получения полного текста ТЗ заказчика и решения по границе MVP.
