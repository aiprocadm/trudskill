/**
 * Правила показа всплывашек об ошибках (ТЗ «Стабилизация, UX и развитие», 2.3 / Б5).
 *
 * **Как было.** Повторы гасились по КЛЮЧУ ЗАПРОСА: `JSON.stringify(queryKey)`. Три разных
 * запроса одного экрана — поставщики, ключи доступа, журнал обмена — дают три разных ключа, а
 * текст ошибки у них один и тот же. Человек на «Обмене данными» получал три одинаковые
 * всплывашки подряд плюс три одинаковых красных сообщения в теле страницы. ТЗ говорит прямо:
 * **ключ = текст + код**, и это единственный ключ, по которому «одинаковое» действительно
 * одинаково для человека — он читает текст, а не внутреннее имя запроса.
 *
 * **Срок — настройка, а не константа** (правило ТЗ: срок, порог и лимит задаются настройкой со
 * значением по умолчанию). В коде было зашито 4500 мс при требовании ТЗ «5 секунд».
 */

const positiveNumber = (raw: string | undefined, fallback: number): number => {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export interface ErrorToastPolicy {
  /** Одинаковый текст в пределах этого срока показывается один раз. */
  dedupeMs: number;
}

export const ERROR_TOAST_POLICY: ErrorToastPolicy = {
  dedupeMs: positiveNumber(process.env.NEXT_PUBLIC_TOAST_DEDUPE_MS, 5_000)
};

/** Код отказа, как его назвал сервер, — если это был ответ сервера, а не что-то иное. */
const codeOf = (error: unknown): string => {
  const normalized = (error as { normalized?: { code?: unknown } } | null)?.normalized;
  return typeof normalized?.code === 'string' ? normalized.code : '';
};

/** Текст, который увидит человек. */
export const messageOf = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
};

/**
 * Ключ повтора: текст плюс код.
 *
 * Код добавлен не для красоты: «Не удалось загрузить» может прийти и отказом сервера, и
 * обрывом связи, а это разные события с разными действиями человека — гасить одно другим
 * нельзя.
 */
export const toastDedupeKey = (error: unknown): string =>
  JSON.stringify([codeOf(error), messageOf(error)]);

/**
 * Показывать ли всплывашку вообще.
 *
 * Про истёкшую сессию всплывашка не нужна: слой сессии сам обновляет её, а если обновить
 * нечем — уводит человека на экран входа. Сообщение «Войдите заново» поверх уже идущего
 * перехода — шум, а при трёх запросах на экране ещё и тройной.
 */
export const shouldShowErrorToast = (error: unknown): boolean => {
  const code = codeOf(error);
  return code !== 'auth_required' && code !== 'session_inactive';
};

/**
 * Хранилище «что и когда уже показывали».
 *
 * Отдельным объектом, потому что правило проверяется тестами без React: мост всплывашек живёт
 * в компоненте, а решение — здесь.
 */
export const createToastDeduper = (policy: ErrorToastPolicy = ERROR_TOAST_POLICY) => {
  const lastShownAt = new Map<string, number>();
  return {
    /** Пропустить ли эту ошибку к человеку. Отмечает показ сама. */
    allow(error: unknown, now: number): boolean {
      if (!shouldShowErrorToast(error)) return false;
      const key = toastDedupeKey(error);
      const previous = lastShownAt.get(key);
      if (previous !== undefined && now - previous < policy.dedupeMs) return false;
      lastShownAt.set(key, now);
      return true;
    }
  };
};
