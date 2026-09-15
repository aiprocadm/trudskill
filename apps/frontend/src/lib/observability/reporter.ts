import { maskRoute, maskSensitive } from './mask';

/**
 * Сбор ошибок фронта (ТЗ «Стабилизация, UX и развитие», 15.1; решение Р15).
 *
 * Р15: сервер сбора разворачивается СВОЙ, в РФ (GlitchTip или Sentry self-hosted), а не в
 * иностранном облаке — из-за персональных данных в трассировках. **Развернуть его — настройка
 * владельца, а не код.** Поэтому здесь сделан шов, и он честен в обоих состояниях: настроен —
 * отправляет; не настроен — молчит и ОДИН раз говорит об этом в консоль. Молчаливая заглушка,
 * делающая вид, что сбор работает, была бы хуже отсутствующей: её никто не пойдёт настраивать.
 *
 * Что уходит наружу — ровно пять полей: вид сбоя, текст, стек, ШАБЛОН адреса и номер запроса.
 * Значения полей, тела запросов и ответов не отправляются вовсе (см. `mask.ts`: первый рубеж
 * защиты — не отправлять, второй — вычистить).
 */

export type CrashKind = 'uncaught' | 'request' | 'render';

export interface CrashInput {
  kind: CrashKind;
  error: unknown;
  route: string;
  requestId?: string;
}

export interface CrashEvent {
  kind: CrashKind;
  message: string;
  stack: string;
  route: string;
  requestId: string;
}

const textOf = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : String(error);
};

const stackOf = (error: unknown): string =>
  error instanceof Error && error.stack ? error.stack : '';

/** Готовит событие: маскирует текст, сворачивает адрес в шаблон. */
export const buildEvent = (input: CrashInput): CrashEvent => ({
  kind: input.kind,
  message: maskSensitive(textOf(input.error)),
  stack: maskSensitive(stackOf(input.error)),
  route: maskRoute(input.route),
  requestId: input.requestId ?? ''
});

export interface Reporter {
  report: (input: CrashInput) => Promise<void>;
  isEnabled: () => boolean;
}

export const createReporter = ({
  endpoint,
  send
}: {
  endpoint: string;
  send: (endpoint: string, event: CrashEvent) => Promise<void>;
}): Reporter => {
  let toldAboutMissingEndpoint = false;

  return {
    isEnabled: () => Boolean(endpoint),
    report: async (input) => {
      if (!endpoint) {
        if (!toldAboutMissingEndpoint) {
          toldAboutMissingEndpoint = true;
          console.warn(
            'Сбор ошибок не настроен: адрес сервера сбора пуст, события никуда не уходят. ' +
              'Задайте NEXT_PUBLIC_ERROR_COLLECTOR_URL (решение Р15 — сервер в РФ).'
          );
        }
        return;
      }
      try {
        await send(endpoint, buildEvent(input));
      } catch {
        /*
         * Сервер сбора недоступен. Молчание здесь ОСОЗНАННОЕ: мы уже внутри обработки чужой
         * ошибки, и своя неудача отправки не должна ни ронять экран, ни доливать шум человеку,
         * который и так видит сбой. Потеря одного события дешевле.
         */
      }
    }
  };
};
