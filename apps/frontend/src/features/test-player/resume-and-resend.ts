import type { AnswerDraftMap, SaveAnswerPayload } from './types';

/**
 * Досылка ответов и возвращение к начатой попытке (ТЗ «Стабилизация, UX и развитие», 10.1).
 *
 * **Что уже было и работало** (сверка по коду, как требует ТЗ): каждый ответ уходит на сервер
 * автосохранением, перед переходом и сдачей черновик досохраняется, неудача возвращает пометку
 * «не сохранено», сдача по кнопке при несохранённом ответе блокируется, при уходе со страницы
 * браузер спрашивает подтверждение, а на сервере ответ идемпотентен по паре
 * «попытка + вопрос». Подозрение ТЗ «ответы удерживаются на клиенте» не подтвердилось.
 *
 * **Что было сломано по-настоящему — экран обещал то, чего не делал.** При пропаже связи он
 * пишет: «Не закрывайте страницу — отправим, как только сеть вернётся». Обработчик события
 * `online` при этом menял только НАДПИСЬ: ни одна досылка не запускалась. Автосохранение
 * перезапускается сменой вопроса или правкой ответа — то есть человек, ответивший офлайн и
 * оставшийся на том же вопросе, ждал досылки, которой не будет. Обещание на экзамене, где
 * попытка одна, — худший вид неправды.
 *
 * **Второе: возвращение в начатую попытку происходило молча.** Ответы подставлялись обратно,
 * но человек об этом не знал: тот же экран, те же вопросы, и непонятно, продолжает он или
 * начал заново. ТЗ просит сказать прямо.
 *
 * Чистые функции: в наборе нет React Testing Library (CLAUDE.md), а это как раз правила,
 * которые проверяются таблицей случаев.
 */

const positiveNumber = (raw: string | undefined, fallback: number): number => {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export interface ResendPolicy {
  /** Через сколько повторять досылку, пока есть несохранённые ответы и есть связь. */
  intervalMs: number;
}

/**
 * **Настройка, а не константа** (правило ТЗ про любые сроки и пороги).
 *
 * Десять секунд — компромисс между «ответ не должен висеть несохранённым» и «не бить в сервер
 * очередью вкладок». Потолка попыток здесь СОЗНАТЕЛЬНО нет, в отличие от опроса данных
 * (задача 1.1): там прекращение опроса ничего не теряет, а здесь остановка досылки означает
 * потерянный ответ на экзамене, который сдают один раз.
 */
export const RESEND_POLICY: ResendPolicy = {
  intervalMs: positiveNumber(process.env.NEXT_PUBLIC_ANSWER_RESEND_INTERVAL_MS, 10_000)
};

/** Собрать отправку для каждого несохранённого ответа. Порядок — как в наборе пометок. */
export const pendingPayloads = (
  unsavedIds: Iterable<string>,
  drafts: AnswerDraftMap
): SaveAnswerPayload[] => {
  const out: SaveAnswerPayload[] = [];
  for (const questionId of unsavedIds) {
    const draft = drafts[questionId];
    if (!draft) continue;
    out.push({
      questionId,
      ...(draft.selectedOptionIds ? { selectedOptionIds: draft.selectedOptionIds } : {}),
      ...(draft.textAnswer !== undefined ? { textAnswer: draft.textAnswer } : {})
    });
  }
  return out;
};

/**
 * Пора ли досылать.
 *
 * Без связи — нет: запрос всё равно не уйдёт, а счётчик неудач вырастет на пустом месте.
 * Нечего досылать — тоже нет: пустая отправка нагружает сервер и путает индикатор.
 */
export const shouldResend = (input: { online: boolean; unsavedCount: number }): boolean =>
  input.online && input.unsavedCount > 0;

/**
 * Сообщение о возвращении в начатую попытку.
 *
 * ТЗ дословно: «Вы продолжаете попытку, начатую в 14:32. Отвечено 7 из 20». Время показываем
 * по местным часам человека — он сверяет его со своей памятью, а не с журналом сервера.
 *
 * `null` означает «говорить не о чем»: попытка началась только что и отвечено ноль — тогда
 * сообщение было бы шумом на пустом месте.
 */
export const resumeNotice = (input: {
  startedAt: string | undefined;
  answeredCount: number;
  totalCount: number;
}): string | null => {
  const { startedAt, answeredCount, totalCount } = input;
  if (!startedAt || answeredCount === 0 || totalCount === 0) return null;

  const started = new Date(startedAt);
  if (Number.isNaN(started.getTime())) return null;

  const time = started.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `Вы продолжаете попытку, начатую в ${time}. Отвечено ${answeredCount} из ${totalCount}.`;
};
