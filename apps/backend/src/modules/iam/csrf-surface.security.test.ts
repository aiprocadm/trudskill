import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * ФТ-G7 — «защита от CSRF на мутациях». Страж поверхности, а не новая проверка.
 *
 * Что такое CSRF простыми словами. Человек вошёл в систему. Он открывает чужую страницу,
 * а та тайком отправляет запрос на наш сервер. Если сервер узнаёт человека по тому, что
 * браузер прикладывает САМ (по cookie), запрос выполнится от его имени — он ничего не
 * заметит.
 *
 * Почему у нас этого не происходит и почему «прикрутить токен ко всем мутациям» было бы
 * работой впустую. Все обычные запросы авторизуются заголовком `Authorization: Bearer`,
 * а такой заголовок браузер сам не добавляет — чужая страница его выставить не может, и
 * получает отказ. `TenantGuard` устроен fail-closed: нет токена и путь не из списка
 * стартовых — 401.
 *
 * Значит опасны ровно те маршруты, которые пропускаются БЕЗ токена. Их список — вот он,
 * ниже, и он не должен расти незаметно: каждый новый стартовый маршрут обязан либо не быть
 * изменяющим, либо иметь свою проверку подлинности. Этот файл роняется, как только список
 * в охраннике разъезжается с записанным здесь.
 *
 * Проверка мутацией (обязательна при правках): убрать в `auth.controller.ts` сравнение
 * `csrfHeaderToken !== csrfCookieToken` — этот тест обязан покраснеть.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const TENANT_GUARD = resolve(HERE, '../../common/guards/tenant.guard.ts');
const AUTH_CONTROLLER = resolve(HERE, 'auth.controller.ts');

interface BootstrapRoute {
  /** Хвост пути, как он записан в охраннике. */
  path: string;
  /** Изменяет ли обработчик состояние (то есть применим ли к нему CSRF вообще). */
  mutation: boolean;
  /** Чем защищён, раз токена доступа ещё нет. */
  protection: string;
}

/**
 * Снимок маршрутов, проходящих БЕЗ токена доступа. Пополнять только вместе с ответом
 * на вопрос «чем защищён этот маршрут, если предъявить токен ещё нечем».
 */
const BOOTSTRAP_ROUTES: ReadonlyArray<BootstrapRoute> = [
  {
    path: '/auth/login',
    mutation: true,
    protection:
      'сам по себе является предъявлением пароля; ограничен частотой обращений (ФТ-G2). Подделать вход с чужой страницы бессмысленно: злоумышленник не знает пароля'
  },
  {
    path: '/auth/refresh',
    mutation: true,
    protection:
      'единственная мутация, узнающая человека по cookie → сверяет заголовок x-csrf-token со значением cookie: чужая страница заголовок выставить не может'
  },
  {
    path: '/auth/csrf',
    mutation: false,
    protection: 'чтение: возвращает значение уже пришедшей cookie, без неё сама даёт 401'
  },
  {
    path: '/auth/2fa/verify',
    mutation: true,
    protection:
      'второй шаг входа: авторизует подписанный вызов в теле запроса, выданный первым шагом; cookie ни при чём'
  },
  // Ревизия 2026-08-27 (порция 23, журнал 268): вход по ссылке на почту довходной по
  // определению — до этого обе ручки не были в bootstrap-списке и письмо не уходило никогда.
  {
    path: '/auth/magic-link/request',
    mutation: true,
    protection:
      'не авторизует никого: лишь отправляет письмо на адрес из тела; подделка с чужой страницы даёт максимум нежданное письмо владельцу адреса, ответ одинаков для существующих и несуществующих адресов'
  },
  {
    path: '/auth/magic-link/redeem',
    mutation: true,
    protection:
      'авторизует одноразовый токен из письма в теле запроса — сам токен и есть секрет; cookie ни при чём, блокировку пользователя проверяет единый гейт issueSessionForUser'
  }
];

/** Отдельно: вход и возврат ЕСИА — это переходы браузера, а не запросы страницы. */
const ESIA_PREFIX = '/auth/esia/';

const readGuardBootstrapPaths = (): string[] => {
  const source = readFileSync(TENANT_GUARD, 'utf8');
  // Ищем именно сравнения пути в решении о пропуске без токена.
  return [...source.matchAll(/requestPath\.endsWith\('([^']+)'\)/g)].map((m) => m[1]!);
};

describe('поверхность маршрутов без токена доступа (ФТ-G7)', () => {
  it('список стартовых маршрутов не изменился незаметно', () => {
    const actual = readGuardBootstrapPaths().sort();
    const expected = BOOTSTRAP_ROUTES.map((route) => route.path).sort();
    expect(
      actual,
      'В TenantGuard появился или исчез маршрут, проходящий БЕЗ токена доступа. ' +
        'Добавьте его в BOOTSTRAP_ROUTES этого файла вместе с ответом: чем он защищён, ' +
        'если предъявить токен ещё нечем. Если это изменяющий запрос, узнающий человека ' +
        'по cookie, — ему нужна сверка x-csrf-token, как у /auth/refresh.'
    ).toEqual(expected);
  });

  /*
   * Пути ЕСИА пропускаются охранником целиком по началу пути — значит охранник за них
   * не отвечает, и каждый ИЗМЕНЯЮЩИЙ обработчик там обязан проверить человека сам.
   *
   * Сначала эта проверка была написана грубее — «в контроллере ЕСИА не должно быть мутаций
   * вовсе» — и сразу покраснела на живом коде: вход в подтверждение личности объявлен как
   * `@Post` и при этом требует `context.userId`, то есть безопасен. Грубый инвариант
   * пришлось бы отключать при первой же правке, а отключённый сторож не стережёт ничего.
   */
  it('изменяющие обработчики ЕСИА проверяют человека сами', () => {
    const source = readFileSync(TENANT_GUARD, 'utf8');
    expect(source).toContain(`includes('${ESIA_PREFIX}')`);
    const controller = readFileSync(resolve(HERE, '../mvp/esia/esia.controller.ts'), 'utf8');

    const unguarded = routeHandlers(controller)
      .filter((handler) => handler.mutation)
      .filter((handler) => !handler.body.includes('context.userId'))
      .map((handler) => handler.route);

    expect(
      unguarded,
      'В контроллере ЕСИА есть изменяющий обработчик, который не требует вошедшего ' +
        'пользователя, а путь пропускается охранником без токена доступа. Такой ' +
        'обработчик обязан подтверждать подлинность сам — иначе его сможет вызвать ' +
        'чужая страница.'
    ).toEqual([]);
  });

  /*
   * Ключевая проверка: единственная cookie-авторизуемая мутация действительно сверяет
   * заголовок с cookie. Проверено мутацией — если сравнение убрать, тест краснеет.
   */
  it('обновление сессии сверяет заголовок x-csrf-token со значением cookie', () => {
    const source = readFileSync(AUTH_CONTROLLER, 'utf8');
    expect(source).toContain("@Headers('x-csrf-token')");
    expect(source).toContain('authCookie.readCsrfCookie(request.headers)');
    expect(
      /csrfHeaderToken\s*!==\s*csrfCookieToken/.test(source),
      'Пропала сверка заголовка x-csrf-token со значением cookie в /auth/refresh. ' +
        'Это единственная мутация, которая узнаёт человека по cookie: без сверки чужая ' +
        'страница сможет обновить чужую сессию.'
    ).toBe(true);
    // Отказ должен быть именно отказом, а не молчаливым пропуском.
    expect(source).toContain('invalid_csrf');
  });

  /*
   * Вторая половина того же инварианта: обычные мутации не должны начать узнавать человека
   * по cookie. Если refresh-cookie читают где-то ещё, кроме контроллера аутентификации, —
   * появилась новая поверхность, и она этим сторожем не описана.
   */
  it('cookie сессии читается только в модуле аутентификации', () => {
    const modules = resolve(HERE, '../..');
    const offenders = collectFiles(modules).filter((file) => {
      if (file.includes(`${sep()}iam${sep()}`)) return false;
      if (file.endsWith('.test.ts')) return false;
      return readFileSync(file, 'utf8').includes('readRefreshCookie');
    });
    expect(
      offenders,
      'Cookie обновления сессии читается вне модуля аутентификации. Любая мутация, ' +
        'узнающая человека по cookie, обязана сверять x-csrf-token — иначе появляется ' +
        'дыра CSRF, которой в архитектуре на Bearer-токенах не было.'
    ).toEqual([]);
  });
});

function sep(): string {
  return process.platform === 'win32' ? '\\' : '/';
}

interface RouteHandler {
  /** Как маршрут записан в декораторе, например `Post('auth/esia/identity/authorize')`. */
  route: string;
  /** Изменяет ли состояние. */
  mutation: boolean;
  /** Текст от декоратора до следующего декоратора маршрута. */
  body: string;
}

/**
 * Режет исходник контроллера на обработчики. Разбор нарочно простой — по декораторам
 * маршрутов: полноценный разбор синтаксиса здесь был бы дороже пользы, а инвариант
 * проверяется по наличию проверки в теле, а не по её форме.
 */
function routeHandlers(source: string): RouteHandler[] {
  const decorator = /@(Get|Post|Put|Patch|Delete)\(([^)]*)\)/g;
  const found = [...source.matchAll(decorator)];
  return found.map((match, index) => {
    const start = match.index ?? 0;
    const end =
      index + 1 < found.length ? (found[index + 1]!.index ?? source.length) : source.length;
    return {
      route: `${match[1]}(${match[2]})`,
      mutation: match[1] !== 'Get',
      body: source.slice(start, end)
    };
  });
}

function collectFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === 'node_modules' || entry === 'dist') continue;
        walk(full);
      } else if (entry.endsWith('.ts')) {
        out.push(full);
      }
    }
  };
  walk(root);
  return out;
}
