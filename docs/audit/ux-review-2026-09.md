# Аудит 0.1 — маршруты, меню, крошки, ошибки, охрана доступа

Обязательный аудит перед фазой 1 ТЗ «Стабилизация, UX и развитие» (§0.1). Дата: 15.09.2026.
Состояние кода: `main`, коммит `9142a48` (третье ТЗ) — то есть **весь код на момент аудита
влит**, незакрытых веток нет.

Аудит отвечает на четыре вопроса ТЗ и на пятый, заданный трекером: **дефект в коде или в
развёрнутой на стенде версии.**

---

## 0. Как это считалось (читать до цифр)

Все числа получены разбором исходников и проверены на образцах. **Разбор по тексту врал пять
раз подряд**, и каждый раз цифра выглядела правдоподобной находкой:

| Что «нашлось»                                       | Чем оказалось                                                                                   | Как поймано                                        |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 11 маршрутов без записи о правах                    | своё правило сопоставления вместо правила приложения: шаблон `/courses` покрывает всё, что ниже | прочитал `isPatternMatch` и повторил его буквально |
| 23 страницы без заголовка                           | 9 из них — перенаправления, заголовка у них и не должно быть                                    | открыл файл: `redirect('/learners')`               |
| 5 карточек записей без заголовка                    | заголовок ВЫЧИСЛЯЕМЫЙ: `title={group?.name ?? 'Карточка группы'}`                               | открыл экран                                       |
| карточка курса «называется» «Курсы»                 | в общем файле несколько экранов, разбор брал ПЕРВЫЙ заголовок                                   | сверил с телом нужного экспорта                    |
| публичная страница проверки документа «под охраной» | слово `ProtectedPage` стояло в КОММЕНТАРИИ «public-страница ВНЕ ProtectedPage»                  | снял комментарии перед разбором                    |

**Вывод для следующих фаз:** любой счёт по исходникам проверять на трёх-четырёх образцах
ДО того, как он попадёт в вывод. Разница между «28 расхождений» и «25 расхождений» здесь не
косметическая — три из первых «находок» были выдуманы разбором.

Матрица «право → роли» взята **из живой базы стенда** (`iam.role_permissions`), а не из
названий ролей и не из текста ТЗ — как требует `CLAUDE.md`.

---

## 1. Ответ на главный вопрос трекера: код или стенд

**Проверено на живом стенде (`lms.ptsfera.online`, тот же коммит):**

| Пункт                         | Где дефект              | Доказательство                                                                                                                                                                                                             |
| ----------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Заголовок вкладки браузера    | **в коде**              | ни одна из 102 страниц не задаёт `metadata.title`; корневая раскладка задаёт `applicationName`, но НЕ `title`. Запрос к стенду: тега `<title>` нет ни на `/`, ни на `/login`, ни на `/learners`, ни на `/admin/gov-export` |
| Собственные страницы ошибок   | **код есть**            | `app/error.tsx`, `app/not-found.tsx`, каталоги `forbidden/`, `offline/`, `tenant-not-found/` существуют и подключены                                                                                                       |
| Охрана доступа                | **код есть и работает** | 93 экрана из 102 обёрнуты в `ProtectedPage`; 9 необёрнутых — публичные по замыслу (вход, выход, отказ, не найдено, офлайн, чужой центр, три страницы по одноразовой ссылке)                                                |
| Маршруты без политики доступа | **таких нет**           | все 102 маршрута покрыты записями `routeMeta`; неизвестный маршрут даёт `not-found`, то есть поведение «закрыто по умолчанию», а не «открыто»                                                                              |

---

## 2. Источник конфигурации меню — НЕ один файл, а девять

Меню собирается из девяти файлов каталога `apps/frontend/src/features/navigation/`:

| Файл                 | Строк | За что отвечает                                                                                                       |
| -------------------- | ----- | --------------------------------------------------------------------------------------------------------------------- |
| `model.ts`           | 673   | **два списка сразу:** `routeMeta` (политика доступа маршрута) и `navigationModel` (пункты меню с подписями и правами) |
| `nav-groups.ts`      | 210   | десять блоков ИА + запасной блок «Прочее»; второй уровень меню «Ещё» (`IA-015`)                                       |
| `role-blueprints.ts` | 147   | чертёж роли: кому какой раздел адресован (сотруднику — разделы сотрудника, слушателю — кабинет)                       |
| `helpers.ts`         | 120   | `resolveRouteMeta`, `evaluateRouteAccess`, `getVisibleNavigation`, фильтрация по адресату                             |
| `top-job-routes.ts`  | 114   | частые задачи роли                                                                                                    |
| `breadcrumbs.ts`     | 100   | хлебные крошки                                                                                                        |
| `role-home.ts`       | 75    | куда роль попадает после входа                                                                                        |
| `nav-icons.ts`       | 63    | значки пунктов                                                                                                        |
| `command-palette.ts` | 42    | быстрый переход                                                                                                       |

**Практический вывод для задач Н3/Н4:** «поменять меню» — это правка минимум в двух местах
(`navigationModel` — подпись и право пункта, `nav-groups.ts` — в каком блоке он стоит), а для
роли — ещё и в `role-blueprints.ts`. Единой точки нет; это и есть причина, по которой пункт
может существовать, но не показываться, и наоборот.

---

## 3. Где реализованы крошки, заголовок вкладки, ошибки и охрана

| Что                             | Где                                                                                                                                                                                                         | Состояние                                                                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Хлебные крошки**              | `features/navigation/breadcrumbs.ts` строит, `widgets/shell/app-shell.tsx:233` рисует                                                                                                                       | работает; подписи берутся из `navigationModel`, а для сегментов без пункта меню — из ручного словаря `segmentLabels` |
| **Заголовок вкладки `<title>`** | `app/layout.tsx` — `metadata` без поля `title`; у страниц `metadata` нет ВООБЩЕ (0 из 102)                                                                                                                  | **не реализовано.** У всех вкладок один вид, различить их нельзя; закладки и история браузера бесполезны             |
| **Ошибки отрисовки**            | `app/error.tsx` → `GlobalError` из `@trudskill/ui` + кнопка «Повторить»                                                                                                                                     | подключено. ⚠️ `app/global-error.tsx` ОТСУТСТВУЕТ — падение самой корневой раскладки ничем не перехвачено            |
| **Ошибки HTTP**                 | `lib/api/client.ts` разбирает конверт ответа; экраны показывают `SectionError`; страницы `/forbidden`, `/not-found`, `/offline`, `/tenant-not-found`                                                        | подключено                                                                                                           |
| **Охрана доступа**              | `widgets/shell/protected-page.tsx` → `features/auth/guards.tsx` (`ProtectedRoute`): нет сессии → `/login?next=…`, нет права → `/forbidden`, нет маршрута → `/not-found`; далее `AppShell` и `AgreementGate` | работает, «закрыто по умолчанию»                                                                                     |
| **Охрана на сервере**           | `TenantGuard` + `PermissionGuard` + `@RequirePermissions`                                                                                                                                                   | отдельный контур, интерфейсная охрана его не заменяет                                                                |

---

## 4. Единство языка: меню и заголовок называют раздел по-разному

**25 пунктов меню из 61** ведут на страницу, заголовок которой звучит иначе. Часть — безобидное
удлинение («Аналитика» → «Аналитика обучения»), но часть меняет смысл:

| Маршрут                | В меню                    | На странице               | Чем плохо                                            |
| ---------------------- | ------------------------- | ------------------------- | ---------------------------------------------------- |
| `/users`               | Пользователи              | Люди и доступ             | разные понятия: «пользователи» и «доступ»            |
| `/audit`               | Аудит                     | Журнал действий           | человек ищет «журнал», а в меню «аудит»              |
| `/assessment`          | Задания и тесты           | Оценивание                | в меню перечень, на странице процесс                 |
| `/materials`           | Материалы                 | **Учебный контент**       | «контент» — англицизм, запрещён правилом продукта №2 |
| `/counterparty-portal` | Портал заказчика          | Обучение сотрудников      | заголовок не называет раздел                         |
| `/academy/requisites`  | Реквизиты учебного центра | Данные учебного заведения | три слова из трёх разные                             |
| `/documents`           | Документы                 | Шаблоны документов        | в меню шире, чем на деле                             |
| `/reports`             | Отчеты                    | Отчётность                | в меню потеряна «ё»                                  |

Полный перечень — в таблице раздела 6 (столбцы «Пункт меню» и «Заголовок H1»).

**Один заголовок на двух экранах** — один случай: «Подтверждение личности» у очереди
администратора (`/admin/identity-verifications`) и у слушателя (`/learner/identity`). Понятие
одно, адресаты разные — вероятно, допустимо, но решать это задаче Я3.

---

## 5. Маршруты без пункта меню — 41, и все объяснимы

| Сколько | Что это                                                                                      | Нормально?                                       |
| ------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 19      | карточки записей (`/courses/[id]`, `/users/[id]`…)                                           | да: в меню им не место, попадают из списка       |
| 10      | перенаправления на объединённый экран (`IA-017`)                                             | да: сохраняют старые ссылки                      |
| 6       | служебные (`/login`, `/logout`, `/forbidden`, `/not-found`, `/offline`, `/tenant-not-found`) | да                                               |
| 2       | формы создания (`/courses/new`, `/groups/new`)                                               | да: открываются кнопкой из списка                |
| 3       | намеренно скрытые заглушки (`/mailings`, `/crm/deals`, `/forms`)                             | да: решение зафиксировано в `HIDDEN_STUB_ROUTES` |
| 1       | `/admin/ui-kit` — витрина компонентов для разработки                                         | да: свой сторож `ui-kit-route.test.ts`           |

**Случайно потерянных разделов нет.** Это подтверждает и сторож `ia-architecture.e2e.test.ts`,
который держит соответствие «маршрут → блок меню».

---

## 6. «Устаревший слой `src/components/`» — это не второй набор компонентов

ТЗ просит список страниц, использующих устаревший слой. Ответ оказался не тем, которого ждёт
формулировка вопроса.

| Файл                            | Кто импортирует | Своих компонентов      | Что на самом деле                                                                                                                                                               |
| ------------------------------- | --------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `state-wrappers.tsx`            | **104 файла**   | **1** (`SectionError`) | переэкспорт семи компонентов ИЗ `@trudskill/ui` (`PageHeader`, `PageContainer`, `SectionCard`, `SectionEmpty`, `GlobalError`, `GlobalLoading`, `RecordNotFound`) плюс один свой |
| `form-feedback.tsx`             | 6               | 4                      | свои компоненты обратной связи формы                                                                                                                                            |
| `profile-card.tsx`              | 1               | 1                      | свой                                                                                                                                                                            |
| `theme-appearance-settings.tsx` | 1               | 1                      | свой                                                                                                                                                                            |
| `tz/tz-links.tsx`               | —               | —                      | ссылки на ТЗ для витрины                                                                                                                                                        |
| `feature-coming-soon.tsx`       | **0**           | 1                      | **мёртвый код**: не импортирует никто                                                                                                                                           |

**Значит, «104 страницы на устаревшем слое» — неверная формулировка задачи.** Сто четыре файла
импортируют ПЕРЕХОДНИК над дизайн-системой, а не параллельный набор компонентов. Настоящий
остаток — шесть своих компонентов в пяти файлах, из них один мёртвый.

Правильная формулировка задачи Э6: перенести `SectionError` и четыре компонента обратной связи
в `@trudskill/ui`, удалить мёртвый `feature-coming-soon.tsx`, после чего убрать переходник и
перевести 104 импорта на пакет напрямую. Это механическая работа, а не редизайн.

---

## 7. Страницы, которые падают

### 7.1. Сплошной обход: падений нет

Инструмент `scripts/crawl/pages-smoke.mjs` прогнан на текущем `main` под **всеми пятью ролями
с нажатиями**: `tenant_admin`, `manager`, `methodist`, `learner`, `platform_admin`.

| Роль                    | Страниц          | Падений |
| ----------------------- | ---------------- | ------- |
| Администратор центра    | 102              | 0       |
| Руководитель            | 102              | 0       |
| Методист                | 102              | 0       |
| Слушатель               | 102              | 0       |
| Администратор платформы | 102              | 0       |
| **Итого**               | **510 открытий** | **0**   |

Код возврата 0. **Страниц, которые падают, нет.**

### 7.2. Зависание вкладки (Б1) — не воспроизвелось

ТЗ называет четыре случая. Проверены все, с ожиданием 12 секунд на страницу:

| Случай из ТЗ                                                  | Результат пробы                                                            |
| ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Клик «Настройки» со страницы «Эксплуатация» (админ платформы) | **переход происходит:** адрес меняется на `/settings`, содержимое рисуется |
| «Аналитика обучения» (админ платформы)                        | открывается, содержимое рисуется                                           |
| «Настройки» (админ центра)                                    | открывается, ошибок нет                                                    |
| «Подтверждение личности» (слушатель)                          | открывается, но см. 7.3 — там настоящая ошибка                             |

**Вывод: как «вечное зависание» это не воспроизводится на текущем коде.** Известная причина
такого симптома — вечный цикл запросов шима `useQuery` — была найдена и починена 17.08
(журнал §5.291, сторож `react-query-shim.loop-guard.test.ts`: «шесть ручек оболочки
опрашивались по ~2 раза в секунду, `/workspace` вечно висел в скелетоне»).

Чего проба НЕ доказывает: она ходит из чистой сессии и ждёт секунды, а не минуты. Если
зависание накапливается (утечка при долгой работе, много вкладок, слабая машина), такой
пробой его не поймать. **Перед закрытием 1.1 нужен сценарий владельца: что делалось до
зависания и сколько времени работала вкладка.**

### 7.3. Что нашлось вместо зависания — и это задача 2.4 из ТЗ

На `/learner/identity` под слушателем сервер отвечает **400**:

```
GET /api/v1/consents/me
{"error":{"code":"learner_not_linked","message":"No learner profile is linked to the current user"}}
```

Экран при этом рисуется и запрос всё равно делает. Это буквально формулировка задачи **2.4
(Б6): «Подтверждение личности: не рендерить форму без привязанного профиля»** — теперь она
подтверждена не пересказом, а ответом сервера.

**Гипотеза (не факт):** человек, увидевший на этом экране ошибку вместо формы, мог описать
это как «зависло». Проверять её — при разборе 1.1.

### 7.4. Слепая зона инструмента, которую стоит знать

Сплошной обход этой ошибки **не увидел**: он ждёт страницу 2,5 секунды, а запрос `/consents/me`
приходит позже. Та же проба с ожиданием 12 секунд его поймала.

Практический вывод: «обход чист» означает «за 2,5 секунды ничего не упало», а не «ошибок нет».
Для разбора конкретного экрана ожидание надо поднимать.

---

## 8. Что из этого следует для фаз 1–3

| Задача ТЗ                      | Что показал аудит                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| **1.1 (Б1) зависание вкладки** | обходом не воспроизводится; нужен сценарий ПЕРЕХОДА между разделами (см. раздел 7), обход ходит по адресам напрямую |
| **Н3/Н4 (единое меню)**        | единой точки настройки меню нет — девять файлов; правка пункта задевает минимум два                                 |
| **Я3 (единый язык)**           | 25 из 61 пункта меню называют раздел не так, как его страница; один англицизм («контент»); одна потерянная «ё»      |
| **Э6 (устаревший слой)**       | задача меньше, чем звучит: шесть компонентов в пяти файлах, один из них мёртвый                                     |
| **заголовок вкладки**          | не реализован вовсе — 0 из 102 страниц; это отдельная работа, которой в очереди пока нет                            |

---

## 9. Найденное, чего в ТЗ нет

Записано в журнал расхождений `docs/TZ_UI_REDESIGN_STATUS.md`:

1. **Заголовка вкладки нет ни у одной страницы.** Человек с пятью вкладками не различает их;
   закладка и история браузера не говорят ничего. Проверено на живом стенде: тега `<title>`
   нет в ответе сервера.
2. **`app/global-error.tsx` отсутствует.** Падение корневой раскладки не перехвачено ничем —
   человек увидит служебный экран браузера вместо страницы продукта.
3. **`feature-coming-soon.tsx` — мёртвый код:** не импортирует ни один файл.

---

## 10. Карта маршрутов — все 102

Столбец «Кому открыт» посчитан по матрице `iam.role_permissions` ЖИВОЙ базы стенда: роль
попадает в список, если у неё есть ВСЕ права, которых требует маршрут. Запись «→ /адрес» в
столбце заголовка означает перенаправление.

| Маршрут                                       | Файл страницы                                         | Пункт меню                | Заголовок H1                              | Кому открыт                                               |
| --------------------------------------------- | ----------------------------------------------------- | ------------------------- | ----------------------------------------- | --------------------------------------------------------- |
| `/academy/commission`                         | `academy/commission/page.tsx`                         | Комиссия                  | Комиссия учебного центра                  | manager, methodist, platform_admin, tenant_admin          |
| `/academy`                                    | `academy/page.tsx`                                    | Учебный центр             | Учебный центр                             | platform_admin, tenant_admin                              |
| `/academy/requisites`                         | `academy/requisites/page.tsx`                         | Реквизиты учебного центра | Данные учебного заведения                 | platform_admin, tenant_admin                              |
| `/admin/analytics`                            | `admin/analytics/page.tsx`                            | Аналитика                 | Аналитика обучения                        | manager, platform_admin, teacher, tenant_admin            |
| `/admin/assignments/[id]`                     | `admin/assignments/[id]/page.tsx`                     | —                         | (вычисляемый)                             | все роли (6)                                              |
| `/admin/assignments`                          | `admin/assignments/page.tsx`                          | Задания                   | Задания                                   | все роли (6)                                              |
| `/admin/bulk-enrollments`                     | `admin/bulk-enrollments/page.tsx`                     | Массовая загрузка         | Зачисление списком                        | manager, platform_admin, tenant_admin                     |
| `/admin/clients/[id]`                         | `admin/clients/[id]/page.tsx`                         | —                         | (вычисляемый)                             | manager, platform_admin, tenant_admin                     |
| `/admin/clients`                              | `admin/clients/page.tsx`                              | Компании                  | Компании                                  | manager, platform_admin, tenant_admin                     |
| `/admin/cockpit`                              | `admin/cockpit/page.tsx`                              | —                         | → /workspace                              | platform_admin, tenant_admin                              |
| `/admin/commissions/[id]`                     | `admin/commissions/[id]/page.tsx`                     | —                         | Аттестационные комиссии                   | manager, methodist, platform_admin, tenant_admin          |
| `/admin/commissions`                          | `admin/commissions/page.tsx`                          | Комиссии                  | Аттестационные комиссии                   | manager, methodist, platform_admin, tenant_admin          |
| `/admin/identity-verifications/[id]`          | `admin/identity-verifications/[id]/page.tsx`          | —                         | Подтверждение личности                    | methodist, platform_admin, tenant_admin                   |
| `/admin/identity-verifications`               | `admin/identity-verifications/page.tsx`               | Подтверждение личности    | Подтверждение личности                    | methodist, platform_admin, tenant_admin                   |
| `/admin/issuance-journal`                     | `admin/issuance-journal/page.tsx`                     | Журнал выдачи             | Книга выдачи документов                   | manager, methodist, platform_admin, tenant_admin          |
| `/admin/learners`                             | `admin/learners/page.tsx`                             | —                         | → /learners                               | manager, platform_admin, teacher, tenant_admin            |
| `/admin/licenses`                             | `admin/licenses/page.tsx`                             | Лицензии                  | Лицензии и аккредитации                   | platform_admin, tenant_admin                              |
| `/admin/notification-settings`                | `admin/notification-settings/page.tsx`                | —                         | → /settings#notifications                 | methodist, platform_admin, tenant_admin                   |
| `/admin/operations`                           | `admin/operations/page.tsx`                           | Эксплуатация              | Эксплуатация                              | platform_admin, tenant_admin                              |
| `/admin/orders`                               | `admin/orders/page.tsx`                               | Заказы                    | Мои оплаты                                | platform_admin, tenant_admin                              |
| `/admin/payments/settings`                    | `admin/payments/settings/page.tsx`                    | —                         | → /settings#payments                      | platform_admin, tenant_admin                              |
| `/admin/proctoring-recordings/[id]`           | `admin/proctoring-recordings/[id]/page.tsx`           | —                         | Видеозаписи экзаменов                     | methodist, platform_admin, tenant_admin                   |
| `/admin/proctoring-recordings`                | `admin/proctoring-recordings/page.tsx`                | Видеозаписи экзаменов     | Видеозаписи экзаменов                     | methodist, platform_admin, tenant_admin                   |
| `/admin/question-banks/[id]`                  | `admin/question-banks/[id]/page.tsx`                  | —                         | (вычисляемый)                             | manager, methodist, platform_admin, tenant_admin          |
| `/admin/question-banks`                       | `admin/question-banks/page.tsx`                       | Банки вопросов            | Банки вопросов                            | manager, methodist, platform_admin, tenant_admin          |
| `/admin/recertification`                      | `admin/recertification/page.tsx`                      | Переаттестация            | Нужна переаттестация                      | methodist, platform_admin, tenant_admin                   |
| `/admin/reports/builder`                      | `admin/reports/builder/page.tsx`                      | Конструктор отчётов       | Конструктор отчётов                       | manager, platform_admin, teacher, tenant_admin            |
| `/admin/tests/[id]`                           | `admin/tests/[id]/page.tsx`                           | —                         | (вычисляемый)                             | все роли (6)                                              |
| `/admin/tests`                                | `admin/tests/page.tsx`                                | Тесты                     | Тесты                                     | все роли (6)                                              |
| `/admin/ui-kit`                               | `admin/ui-kit/page.tsx`                               | —                         | Витрина шаблонов (UI Kit)                 | platform_admin, tenant_admin                              |
| `/admin/usage`                                | `admin/usage/page.tsx`                                | Использование             | Использование                             | platform_admin, tenant_admin                              |
| `/admin/webinars`                             | `admin/webinars/page.tsx`                             | Вебинары                  | Вебинары                                  | methodist, platform_admin, tenant_admin                   |
| `/admin/webinars/settings`                    | `admin/webinars/settings/page.tsx`                    | —                         | → /settings#webinars                      | platform_admin, tenant_admin                              |
| `/assessment`                                 | `assessment/page.tsx`                                 | Задания и тесты           | Оценивание                                | все роли (6)                                              |
| `/audit`                                      | `audit/page.tsx`                                      | Аудит                     | Журнал действий                           | platform_admin, tenant_admin                              |
| `/chat`                                       | `chat/page.tsx`                                       | Чат                       | Чат                                       | все роли (6)                                              |
| `/counterparties/[id]`                        | `counterparties/[id]/page.tsx`                        | —                         | → /admin/clients/${id}                    | manager, platform_admin, tenant_admin                     |
| `/counterparties`                             | `counterparties/page.tsx`                             | —                         | → /admin/clients                          | manager, platform_admin, tenant_admin                     |
| `/counterparty-portal`                        | `counterparty-portal/page.tsx`                        | Портал заказчика          | Обучение сотрудников                      | counterparty_rep, manager, platform_admin, tenant_admin   |
| `/courses/[id]`                               | `courses/[id]/page.tsx`                               | —                         | Курсы                                     | все роли (6)                                              |
| `/courses/new`                                | `courses/new/page.tsx`                                | —                         | Создание курса                            | все роли (6)                                              |
| `/courses`                                    | `courses/page.tsx`                                    | Курсы                     | Курсы                                     | все роли (6)                                              |
| `/crm/deals`                                  | `crm/deals/page.tsx`                                  | —                         | Сделки                                    | manager, platform_admin, tenant_admin                     |
| `/directions`                                 | `directions/page.tsx`                                 | Направления               | Направления обучения                      | manager, methodist, platform_admin, tenant_admin          |
| `/documents`                                  | `documents/page.tsx`                                  | Документы                 | Шаблоны документов                        | manager, methodist, platform_admin, tenant_admin          |
| `/esign/applications`                         | `esign/applications/page.tsx`                         | НЭП заявки                | НЭП — заявки                              | manager, methodist, platform_admin, tenant_admin          |
| `/esign/legal-log`                            | `esign/legal-log/page.tsx`                            | НЭП журнал                | Юридический журнал                        | platform_admin, tenant_admin                              |
| `/esign/processes`                            | `esign/processes/page.tsx`                            | НЭП подписание            | Подписание документов                     | manager, methodist, platform_admin, tenant_admin          |
| `/exam-auth/[token]`                          | `exam-auth/[token]/page.tsx`                          | —                         | —                                         | (без входа)                                               |
| `/exports`                                    | `exports/page.tsx`                                    | Экспорт                   | Обмен данными                             | platform_admin, tenant_admin                              |
| `/forbidden`                                  | `forbidden/page.tsx`                                  | —                         | —                                         | (без входа)                                               |
| `/forms`                                      | `forms/page.tsx`                                      | —                         | Системные формы                           | manager, methodist, platform_admin, tenant_admin          |
| `/gov-export`                                 | `gov-export/page.tsx`                                 | Госвыгрузки               | Выгрузки ФИС ФРДО / ЕИСОТ                 | manager, methodist, platform_admin, tenant_admin          |
| `/groups/[id]`                                | `groups/[id]/page.tsx`                                | —                         | (из данных; запасной — «Карточка группы») | manager, platform_admin, teacher, tenant_admin            |
| `/groups/new`                                 | `groups/new/page.tsx`                                 | —                         | Новая группа                              | manager, platform_admin, teacher, tenant_admin            |
| `/groups`                                     | `groups/page.tsx`                                     | Группы                    | Группы                                    | manager, platform_admin, teacher, tenant_admin            |
| `/integrations`                               | `integrations/page.tsx`                               | Интеграции                | Обмен данными                             | platform_admin, tenant_admin                              |
| `/learner/assignments/[id]/submit`            | `learner/assignments/[id]/submit/page.tsx`            | —                         | (вычисляемый)                             | learner, manager, platform_admin, teacher, tenant_admin   |
| `/learner/assignments`                        | `learner/assignments/page.tsx`                        | Мои задания               | Мои задания                               | все роли (6)                                              |
| `/learner/courses/[id]`                       | `learner/courses/[id]/page.tsx`                       | —                         | Мои курсы                                 | learner, manager, platform_admin, teacher, tenant_admin   |
| `/learner/courses`                            | `learner/courses/page.tsx`                            | Мои курсы                 | Мои курсы                                 | learner, manager, platform_admin, teacher, tenant_admin   |
| `/learner/documents`                          | `learner/documents/page.tsx`                          | Мои документы             | Мои документы                             | learner, manager, platform_admin, teacher, tenant_admin   |
| `/learner/identity`                           | `learner/identity/page.tsx`                           | Подтверждение личности    | Подтверждение личности                    | learner, platform_admin, tenant_admin                     |
| `/learner`                                    | `learner/page.tsx`                                    | Мой кабинет               | (вычисляемый)                             | learner, manager, platform_admin, teacher, tenant_admin   |
| `/learner/payments`                           | `learner/payments/page.tsx`                           | Мои оплаты                | Мои оплаты                                | learner                                                   |
| `/learner/tests/[testId]/attempt/[attemptId]` | `learner/tests/[testId]/attempt/[attemptId]/page.tsx` | —                         | Прохождение теста                         | learner, manager, platform_admin, tenant_admin            |
| `/learner/tests/[testId]/result`              | `learner/tests/[testId]/result/page.tsx`              | —                         | Результат теста                           | все роли (6)                                              |
| `/learner/tests`                              | `learner/tests/page.tsx`                              | Мои тесты                 | Мои тесты                                 | все роли (6)                                              |
| `/learner/webinars`                           | `learner/webinars/page.tsx`                           | Мои вебинары              | Вебинары                                  | learner                                                   |
| `/learners/[id]`                              | `learners/[id]/page.tsx`                              | —                         | (вычисляемый)                             | manager, platform_admin, teacher, tenant_admin            |
| `/learners`                                   | `learners/page.tsx`                                   | Слушатели                 | Слушатели                                 | manager, platform_admin, teacher, tenant_admin            |
| `/learning/calendar`                          | `learning/calendar/page.tsx`                          | Календарь                 | Календарь окончаний                       | learner, manager, platform_admin, teacher, tenant_admin   |
| `/library`                                    | `library/page.tsx`                                    | Библиотека курсов         | Библиотека курсов                         | все роли (6)                                              |
| `/login/magic-link/[token]`                   | `login/magic-link/[token]/page.tsx`                   | —                         | —                                         | (без входа)                                               |
| `/login`                                      | `login/page.tsx`                                      | —                         | —                                         | (без входа)                                               |
| `/logout`                                     | `logout/page.tsx`                                     | —                         | —                                         | (без входа)                                               |
| `/mailings`                                   | `mailings/page.tsx`                                   | —                         | Рассылки и уведомления                    | methodist, platform_admin, tenant_admin                   |
| `/materials`                                  | `materials/page.tsx`                                  | Материалы                 | Учебный контент                           | все роли (6)                                              |
| `/methodist`                                  | `methodist/page.tsx`                                  | Обучение: сводка          | Обучение: сводка                          | все роли (6)                                              |
| `/module-empty`                               | `module-empty/page.tsx`                               | —                         | Раздел в разработке                       | все вошедшие                                              |
| `/not-found`                                  | `not-found/page.tsx`                                  | —                         | —                                         | (без входа)                                               |
| `/notifications`                              | `notifications/page.tsx`                              | Сообщения                 | Центр уведомлений                         | все роли (6)                                              |
| `/offline`                                    | `offline/page.tsx`                                    | —                         | —                                         | (без входа)                                               |
| `/onboarding`                                 | `onboarding/page.tsx`                                 | Настройка центра          | Настройка центра                          | platform_admin, tenant_admin                              |
| `/`                                           | `page.tsx`                                            | Главная                   | Главная                                   | все вошедшие                                              |
| `/platform/tenants`                           | `platform/tenants/page.tsx`                           | Арендаторы платформы      | Арендаторы платформы                      | platform_admin                                            |
| `/proctoring`                                 | `proctoring/page.tsx`                                 | Прокторинг                | Прокторинг                                | methodist, platform_admin, tenant_admin                   |
| `/question-import`                            | `question-import/page.tsx`                            | Импорт вопросов           | Импорт вопросов                           | methodist, platform_admin, tenant_admin                   |
| `/registry`                                   | `registry/page.tsx`                                   | —                         | → /audit                                  | platform_admin, tenant_admin                              |
| `/reports`                                    | `reports/page.tsx`                                    | Отчеты                    | Отчётность                                | manager, platform_admin, teacher, tenant_admin            |
| `/scorm`                                      | `scorm/page.tsx`                                      | Учебные пакеты (SCORM)    | SCORM-пакеты                              | все роли (6)                                              |
| `/settings`                                   | `settings/page.tsx`                                   | Настройки                 | Настройки                                 | platform_admin, tenant_admin                              |
| `/student/dashboard`                          | `student/dashboard/page.tsx`                          | —                         | → /learner                                | learner, manager, platform_admin, teacher, tenant_admin   |
| `/sync-logs`                                  | `sync-logs/page.tsx`                                  | Журнал синхронизации      | Обмен данными                             | platform_admin, tenant_admin                              |
| `/teacher/grading-center`                     | `teacher/grading-center/page.tsx`                     | —                         | → /teacher/review                         | manager, methodist, platform_admin, teacher, tenant_admin |
| `/teacher/review`                             | `teacher/review/page.tsx`                             | Очередь на проверку       | Очередь на проверку                       | manager, methodist, platform_admin, teacher, tenant_admin |
| `/telephony`                                  | `telephony/page.tsx`                                  | Телефония                 | Телефония                                 | platform_admin, tenant_admin                              |
| `/tenant-not-found`                           | `tenant-not-found/page.tsx`                           | —                         | —                                         | (без входа)                                               |
| `/users/[id]`                                 | `users/[id]/page.tsx`                                 | —                         | Люди и доступ                             | platform_admin, tenant_admin                              |
| `/users`                                      | `users/page.tsx`                                      | Пользователи              | Люди и доступ                             | platform_admin, tenant_admin                              |
| `/verify/[token]`                             | `verify/[token]/page.tsx`                             | —                         | —                                         | (без входа)                                               |
| `/workspace`                                  | `workspace/page.tsx`                                  | Оперативная панель        | Оперативная панель                        | manager, methodist, platform_admin, teacher, tenant_admin |
