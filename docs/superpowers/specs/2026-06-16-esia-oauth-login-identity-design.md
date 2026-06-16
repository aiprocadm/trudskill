# ЕСИА (Госуслуги) — вход + идентификация через provider-agnostic OAuth/OIDC-шов

> **Design spec.** Объём, зафиксированные решения и архитектура интеграции с ЕСИА (Госуслуги)
> как федеративного провайдера **входа** и **подтверждения личности** перед итоговым экзаменом.
> Реализуется **dormant** (за флагом `ESIA_ENABLED=false`) по проверенному паттерну
> provider-agnostic шва — зеркало e-signature (`DocumentSignatureProvider`) и антивируса
> (`AntivirusScanner`).
>
> **Roadmap:** [docs/superpowers/plans/2026-05-21-cdoprof-v1-roadmap.md](../plans/2026-05-21-cdoprof-v1-roadmap.md) §Phase 4
> (идентификация и прокторинг) — задача «OAuth-интеграция с ЕСИА», явно отложенная в
> Phase 4 Plan A ([2026-06-10-phase-4-plan-a-identity-verification-design.md](2026-06-10-phase-4-plan-a-identity-verification-design.md) §9).
> **Прямой прецедент паттерна:** Phase 6 e-signature seam
> ([2026-06-15-phase-6-esign-provider-seam.md](../plans/2026-06-15-phase-6-esign-provider-seam.md)).

## 1. Goal

ЕСИА закрывает **две** задачи через **один** OAuth/OIDC-механизм:

1. **Вход (login).** Слушатель жмёт «Войти через Госуслуги» как альтернативу входу по
   магической ссылке. Сессия выдаётся **тем же** методом, что и magic-link
   (`AuthService.issueSessionForUser`), — параллельного механизма сессий не вводим.
2. **Подтверждение личности (identity).** Успешный вход через Госуслуги с совпавшим СНИЛС
   **автоматически** создаёт одобренную запись `IdentityVerification`, снимая 4-й гейт
   итогового экзамена (`assertIdentityVerificationGate`) без ручной сверки админом. Ручной
   метод (селфи + паспорт) остаётся параллельно для слушателей без Госуслуг.

Оба потока ходят через общие эндпоинты `GET /auth/esia/authorize` + `GET /auth/esia/callback`,
различаясь параметром `purpose` (`login` | `identity`). Сетевой код и крипто-шов пишутся один раз.

**Реальность активации:** «вживую» ЕСИА требует статуса ИС (2-3 месяца регистрации в
Минцифры/Ростелеком), мнемоники, зарегистрированных `redirect_uri` и **ГОСТ-подписи запросов**
(КриптоПро, тот же УЦ ФНС, что и для подписи документов). Поэтому весь код пишется dormant; в деве
работает `MockEsiaProvider`, реальный `EsiaOidcProvider` — каркас-заглушка с ГОСТ-подписью как
follow-up. См. §10 (чек-лист активации).

## 2. Locked decisions

Зафиксированы во время брейншторминга. Не пересматривать на этапе исполнения; если решение
оказалось неверным — остановиться и поднять вопрос.

1. **Объём = C (оба).** И вход, и подтверждение личности. Один шов, две точки подключения.
2. **Кого пускаем = A (только «свои»).** Вход разрешён только тому, кто **уже заведён** в системе
   (центр зачислил); сопоставление по **СНИЛС**. Незнакомца с Госуслуг — **не пускаем, аккаунт не
   создаём** (`findOrCreateByEmail` для login НЕ используем — это против решения A).
3. **Идентификация = A (авто-зачёт).** Совпадение СНИЛС из Госуслуг со СНИЛС в карточке слушателя →
   запись `IdentityVerification` со статусом `approved` (`method:'esia'`,
   `reviewedByActorId:'system_esia'`). Ручной метод сохраняется.
4. **Реализация = ① спящий шов + mock.** Provider-agnostic интерфейс + Noop/Mock/реальная заглушка,
   за флагом `ESIA_ENABLED=false`. Реальный адаптер целится на тестовый стенд ЕСИА
   (`esia-portal1.test.gosuslugi.ru`) как следующий шаг активации.
5. **Протокол = OpenID Connect (REST).** Не SAML. «Секрет клиента» в ЕСИА — это **открепленная
   ГОСТ-подпись** запроса (scope+timestamp+clientId+state), формируемая закрытым ключом
   организации; вся крипта инкапсулирована в `EsiaOidcProvider`, `MockEsiaProvider` возвращает
   готовые данные.
6. **Запрашиваемые scope:** `openid fullname snils birthdate email` (минимально достаточно для
   сопоставления по СНИЛС и заполнения карточки).
7. **Без миграции, без новых прав.** Запись идентификации — расширение существующей коллекции
   `identityVerifications` (JSON-снимок MVP-state). `/authorize` и `/callback` — bootstrap-маршруты
   под `TenantGuard`-резолвом тенанта, без `PermissionGuard` (паттерн web-push self-service +
   magic-link redeem).
8. **Мульти-тенант:** вход инициируется со страницы конкретного центра, поэтому `/authorize` несёт
   `tenant_id` и резолв СНИЛС идёт **внутри тенанта** (там СНИЛС уникален → 0 или 1 слушатель).
   Экран выбора организации — только для tenant-agnostic входа (если когда-нибудь появится общая
   точка входа без указания центра); для пилота это граничный случай, не основной путь.

## 3. Архитектура: provider-agnostic шов

Зеркало `DocumentSignatureProvider` (esign) и `AntivirusScanner` (antivirus).

```ts
// apps/backend/src/infrastructure/esia/esia-identity.provider.ts
export interface EsiaResolvedIdentity {
  snils: string; // нормализованный (только цифры)
  lastName: string;
  firstName: string;
  middleName?: string;
  birthDate?: string; // ISO YYYY-MM-DD
  email?: string;
}

export interface EsiaIdentityProvider {
  // строит URL на Госуслуги; state кладётся вызывающим в подписанную куку
  buildAuthorizeUrl(params: {
    state: string;
    purpose: 'login' | 'identity';
    redirectUri: string;
  }): string;
  // обменивает code на личность (внутри: token endpoint + userinfo + ГОСТ-подпись запроса)
  exchangeCode(params: {
    code: string;
    state: string;
    redirectUri: string;
  }): Promise<EsiaResolvedIdentity>;
}

export const ESIA_IDENTITY_PROVIDER = Symbol('ESIA_IDENTITY_PROVIDER');
```

Три реализации:

- **`NoopEsiaProvider`** — безопасный прод-дефолт пока спит: оба метода бросают
  `ServiceUnavailableException({ code: 'esia_disabled' })`.
- **`MockEsiaProvider`** — дев/тест: `buildAuthorizeUrl` возвращает локальный stub-URL
  (`/auth/esia/mock-callback?...`), `exchangeCode` детерминированно возвращает тестовую личность
  (СНИЛС из state/конфига — чтобы тесты могли смэтчить заведённого слушателя).
- **`EsiaOidcProvider`** — реальный адаптер (каркас): OIDC-flow к ЕСИА с **ГОСТ-подписью** запроса
  через КриптоПро. На этом этапе — структура + понятная точка `// TODO: ГОСТ-подпись (follow-up)`,
  не активируется без сертификата.

**Фабрика** в `IamModule` (или выделенном `EsiaModule`, импортируемом в `IamModule`):

```ts
{
  provide: ESIA_IDENTITY_PROVIDER,
  useFactory: () => {
    if (!backendEnv.ESIA_ENABLED) return new NoopEsiaProvider();
    if (backendEnv.ESIA_PROVIDER === 'mock') return new MockEsiaProvider(/* cfg */);
    if (backendEnv.ESIA_PROVIDER === 'esia') return new EsiaOidcProvider(/* cfg */);
    return new NoopEsiaProvider(); // незнакомый провайдер → safe default + warn
  },
}
```

**Env (`apps/backend/src/env.schema.ts`)** — тем же кастомным boolean-парсером, что
`ESIGN_ENABLED`/`ANTIVIRUS_ENABLED`:

```
ESIA_ENABLED       boolean  default false
ESIA_PROVIDER      enum ['noop','mock','esia']  default 'noop'
ESIA_CLIENT_ID     string   optional   (мнемоника ИС)
ESIA_SCOPES        string   default 'openid fullname snils birthdate email'
ESIA_AUTHORIZE_URL string   optional   (боевой/тестовый стенд)
ESIA_TOKEN_URL     string   optional
ESIA_USERINFO_URL  string   optional
ESIA_CALLBACK_URL  string   optional   (зарегистрированный redirect_uri)
ESIA_CERT_PATH     string   optional   (ГОСТ-сертификат/ключ организации)
```

Фронту прокидывается только булев `esiaEnabled` (через существующий механизм публичной конфигурации)
для условного показа кнопок.

## 4. Поток ВХОДА (login)

```
[Кнопка «Войти через Госуслуги»] (видна только при esiaEnabled)
  → GET /auth/esia/authorize?purpose=login&tenant_id=...
       бэкенд: генерит state+nonce, кладёт в подписанную короткоживущую куку,
               provider.buildAuthorizeUrl(...) → 302 на Госуслуги
  → пользователь подтверждает на Госуслугах
  → GET /auth/esia/callback?code=...&state=...
       бэкенд:
         1. сверить state с кукой (mismatch → 400 esia_state_mismatch)
         2. provider.exchangeCode(...) → EsiaResolvedIdentity (СНИЛС)
         3. mvpService.findLearnersBySnils(tenantId, snils)
             (резолв в рамках tenant_id из authorize → 0 или 1)
             - 0 найдено  → 403 esia_learner_not_enrolled (лог для админа, аккаунт НЕ создаём)
             - 1 найден   → resolveIamUser(learner) → issueSessionForUser → куки → редирект в кабинет
             - tenant-agnostic вход, СНИЛС в >1 тенанте → экран выбора организации, затем сессия (edge)
         4. аудит: iam.session_issued, metadata.authMethod='esia'
```

- Резолв IAM-пользователя: если у `Learner.linkedIamUserId` пусто, но слушатель найден — привязать
  (создать/связать IAM-пользователя по email слушателя через существующий путь) и проставить
  `linkedIamUserId`. Если email отсутствует — отказ `esia_learner_no_account` (граничный случай,
  логируется).
- Сессия и куки — строго существующие `AuthService.issueSessionForUser` +
  `attachRefreshAndCsrfCookies`. Новый код сессий не пишем.

## 5. Поток ИДЕНТИФИКАЦИИ (identity)

```
[Кнопка «Подтвердить через Госуслуги (альтернатива)»] на /learner/identity
  → GET /auth/esia/authorize?purpose=identity      (пользователь уже залогинен)
  → ... тот же callback ...
       бэкенд:
         1. сверить state
         2. exchangeCode → СНИЛС из Госуслуг
         3. сравнить с СНИЛС текущего слушателя (по сессии)
             - совпал     → upsert IdentityVerification {status:'approved', method:'esia',
                            reviewedByActorId:'system_esia', reviewedAt:now} → гейт снят
             - не совпал  → 422 esia_snils_mismatch (гейт не трогаем)
         4. аудит: learning.identity_verification_approved_by_esia
  → редирект назад на /learner/identity со статусом «Личность подтверждена»
```

Переиспользует `assertIdentityVerificationGate` без изменений его логики — гейт ищет «последнюю
approved-запись» независимо от того, кто одобрил (админ или ЕСИА). Добавляем `'esia'` в допустимые
значения `IdentityVerification.method`.

## 6. Данные и хранение

- **Без новой миграции.** `IdentityVerification.method`: `'selfie_passport' | 'esia'`. Запись —
  существующая коллекция `identityVerifications` (`MVP_COLLECTIONS`, JSONB-снимок).
- **Поиск по СНИЛС** — новый сервис-метод `findLearnersBySnils(tenantId, snils)`: нормализует СНИЛС
  (убирает пробелы/дефисы → 11 цифр), сравнивает с нормализованным `Learner.snils`. Основной путь —
  внутритенантный (см. решение 8). Кросс-тенантный `findLearnersBySnilsAcrossTenants(snils)` — только
  для граничного tenant-agnostic входа; в объёме пилота можно пометить как задел и не реализовывать
  до появления общей точки входа.
- **Привязка** — существующее `Learner.linkedIamUserId`.
- **state/nonce** — подписанная короткоживущая кука (паттерн CSRF-куки `auth-cookie.util.ts`), не БД.
- **Права** — новых IAM-прав нет; `/authorize` и `/callback` — bootstrap-маршруты.

## 7. Обработка ошибок и мульти-тенант

| Ситуация                                   | Код / поведение                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| СНИЛС не найден среди слушателей (login)   | `403 esia_learner_not_enrolled`, аккаунт не создаём, лог для админа                  |
| СНИЛС найден в >1 тенанте                  | экран выбора организации → сессия                                                    |
| `purpose=identity`, СНИЛС ≠ карточка       | `422 esia_snils_mismatch`, гейт не снимаем                                           |
| `state` не совпал с кукой                  | `400 esia_state_mismatch` (анти-CSRF)                                                |
| `ESIA_ENABLED=false`, дёрнули `/authorize` | `503 esia_disabled` (бросает `NoopEsiaProvider`)                                     |
| Госуслуги вернули error/timeout            | дружелюбная страница «Не удалось войти через Госуслуги, попробуйте ссылку из письма» |
| Слушатель найден, но без email/IAM         | `403 esia_learner_no_account`, лог                                                   |

## 8. Фронтенд

- **`features/auth`**: компонент `esia-login-button.tsx` рядом с формой magic-link; рендерится
  только при `esiaEnabled`. Клик → переход на `/api/v1/auth/esia/authorize?purpose=login&tenant_id=...`.
- **`features/identity-verification/screens.tsx`**: кнопка «Подтвердить через Госуслуги
  (альтернатива)» в секции загрузки, при `esiaEnabled`.
- **Callback-страница**: спиннер → при успехе редирект в кабинет / на `/learner/identity`, при
  отказе — понятное сообщение по коду ошибки.
- Сессия после login-callback гидрируется существующим `session-manager`/`AuthContext` (бэкенд уже
  поставил куки в callback; фронту достаточно подтянуть профиль).

## 9. Тестирование (по конвенциям репо)

- **Unit:** `MockEsiaProvider` (детерминизм), нормализация СНИЛС, `findLearnersBySnils`, маппинг
  `EsiaResolvedIdentity`.
- **Service (`*.service.test.ts`):** login-резолв (0/1/много), identity-авто-аппрув (совпал/не
  совпал), отказ авто-создания аккаунта.
- **HTTP-integration (`*.http.integration.test.ts`):** `/authorize` + `/callback` как
  bootstrap-маршруты; поведение при `ESIA_ENABLED=false`; сверка `state`; envelope-формат ошибок.
- **Frontend:** `api.contract.test.ts` + видимость кнопок по флагу `esiaEnabled`.
- **Security:** state/nonce, отказ авто-создания, межтенантная изоляция по СНИЛС, отказ при
  `esia_snils_mismatch`.

## 10. Чек-лист активации (НЕ код — для владельца, follow-up)

1. Статус **ИС** в ЕСИА (Минцифры/Ростелеком, 2-3 мес.) → мнемоника + зарегистрированные
   `redirect_uri`.
2. ГОСТ-сертификат организации (тот же УЦ ФНС, что для подписи документов Phase 6).
3. Реализовать ГОСТ-подпись запроса в `EsiaOidcProvider` (КриптоПро) — отдельный follow-up.
4. `ESIA_*` env + `ESIA_ENABLED=true` + `ESIA_PROVIDER=esia` → фича оживает без переделки кода.
5. Прогон на тестовом стенде `esia-portal1.test.gosuslugi.ru` перед боевым контуром.

## 11. Что в объёме сейчас / что нет

**В объёме (пишем):** провайдер-шов (интерфейс + Noop/Mock/каркас-OIDC) · `/authorize` + `/callback` ·
login-резолв по СНИЛС (решение A) · identity-авто-аппрув (решение A) · `findLearnersBySnils` ·
env-флаги (dormant) · 2 кнопки на фронте под флагом · callback-страница · тесты.

**Вне объёма:** реальная ГОСТ-крипта (заглушка-каркас) · миграции · новые IAM-права · любое включение
в проде · ЕСИА для staff-ролей (admin/teacher входят magic-link/паролем) · авто-создание аккаунтов.

## 12. Точки подключения в существующем коде (для плана)

- `apps/backend/src/modules/iam/auth.controller.ts` — `POST /auth/magic-link/redeem` (образец) →
  рядом новый `auth/esia/*`.
- `apps/backend/src/modules/iam/services/auth.service.ts` — `issueSessionForUser` (переиспользуем).
- `apps/backend/src/modules/iam/auth-cookie.util.ts` — `attachRefreshAndCsrfCookies` + паттерн
  подписанной куки для `state`.
- `apps/backend/src/modules/mvp/mvp.types.ts` — `Learner` (snils, middleName, dateOfBirth,
  linkedIamUserId), `IdentityVerification` (+`method:'esia'`).
- `apps/backend/src/modules/mvp/mvp.service.ts` — `assertIdentityVerificationGate`,
  `findApprovedIdentityVerification`, `startIdentityVerification` (образец создания записи); новый
  `findLearnersBySnils`.
- `apps/backend/src/infrastructure/document-signature/` + `…/antivirus/` — образец шва и фабрики.
- `apps/backend/src/env.schema.ts` — образец флагов и boolean-парсера.
- `apps/frontend/src/features/auth/` (форма входа, `session-manager`, `AuthContext`) +
  `features/identity-verification/screens.tsx`.
