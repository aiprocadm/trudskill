/**
 * Защита выгрузок в госреестры от двойной отправки (ревизия 2026-08-26).
 *
 * Что было. Каждый вызов `POST .../exports` собирал НОВЫЙ пакет: заново отбирал документы,
 * строил файл, подписывал его и клал в хранилище. Ключа повторной отправки у этих ручек нет,
 * защиты от повтора — тоже. Двойное нажатие «Выгрузить» на медленном соединении давало два
 * одинаковых подписанных пакета, и оба выглядели готовыми к отправке в госреестр. Отправить
 * дубль в ФРДО — это не «лишняя строка в списке», а обращение, которое центр потом
 * разбирает с регулятором.
 *
 * Почему не обязательный `idempotencyKey`. Он потребовал бы правки контракта API и всех
 * вызывающих экранов — то есть ломал бы совместимость ради задачи, у которой есть решение
 * попроще. К тому же ключ защищает от повтора ЗАПРОСА, а здесь опасен повтор ДЕЙСТВИЯ:
 * человек, дважды нажавший кнопку, пришлёт два разных ключа.
 *
 * Что вместо. Если тот же человек за последнюю минуту уже собрал пакет с ТЕМ ЖЕ отбором —
 * второй не собирается, а запрос получает внятный отказ со ссылкой на уже готовый пакет.
 *
 * Почему отказ, а не «вернуть готовый молча». В ответе выгрузки есть отчёт о готовности
 * данных («кого дозаполнить») и перечень ошибок — при повторе их заново не считают. Вернуть
 * пустой отчёт значило бы сказать «все готовы» там, где в первый раз были пробелы: тихое
 * враньё вместо честного «вы это уже сделали». Осмысленный сценарий не страдает —
 * перевыгрузка через минуту работает, другой отбор собирается сразу.
 */

/** Минута: столько живёт «случайно нажал дважды». Полчаса были бы уже запретом на работу. */
export const DOUBLE_SUBMIT_WINDOW_MS = 60_000;

type BatchLike = {
  tenantId: string;
  createdAt: string;
  generatedBy?: string;
  sourceFilterJson?: Record<string, unknown> | undefined;
};

/**
 * Отбор сравнивается по составу, а не по порядку ключей: `{ from, to }` и `{ to, from }` —
 * один и тот же запрос, и различать их значило бы пропускать половину дублей.
 */
const sameFilter = (a: unknown, b: unknown): boolean => {
  const norm = (value: unknown): string =>
    JSON.stringify(value ?? {}, (_key, inner: unknown) =>
      inner && typeof inner === 'object' && !Array.isArray(inner)
        ? Object.fromEntries(Object.entries(inner as Record<string, unknown>).sort())
        : inner
    );
  return norm(a) === norm(b);
};

/**
 * Недавний пакет того же человека с тем же отбором — или `undefined`.
 *
 * `nowIso` передаётся аргументом, а не берётся из часов: тесты должны проверять границу
 * окна, а не ждать минуту.
 */
export const findRecentIdenticalBatch = <T extends BatchLike>(
  batches: readonly T[],
  params: {
    tenantId: string;
    filter: unknown;
    actorId: string | undefined;
    nowIso: string;
    windowMs?: number;
  }
): T | undefined => {
  const window = params.windowMs ?? DOUBLE_SUBMIT_WINDOW_MS;
  const now = Date.parse(params.nowIso);
  if (Number.isNaN(now)) return undefined;

  return [...batches]
    .reverse()
    .find(
      (batch) =>
        batch.tenantId === params.tenantId &&
        (batch.generatedBy ?? '') === (params.actorId ?? '') &&
        sameFilter(batch.sourceFilterJson, params.filter) &&
        now - Date.parse(batch.createdAt) <= window &&
        Date.parse(batch.createdAt) <= now
    );
};
