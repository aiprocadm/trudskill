/**
 * Ревизия 2026-08-27 (порция 27, журнал 279) — правила черновика практической работы.
 *
 * Экран всегда стартовал с пустого поля: сохранённый ответ сервер отдавал, но в поле он
 * не попадал никогда. Человек, вернувшийся к заданию, видел пустоту — и «Сохранить
 * черновик» отправлял эту пустоту поверх написанного раньше. Две меры:
 * подставить сохранённый текст один раз и не давать сохранять, пока он не подставлен.
 */

export interface DraftHydrationInput {
  /** Текст уже подставляли в это поле (повторно перетирать нельзя — человек мог править). */
  alreadyHydrated: boolean;
  /** Что лежит на сервере. `undefined` — ещё не загружено. */
  serverText: string | undefined;
}

/** `true` — можно подставить серверный текст в поле. */
export function shouldHydrateDraft({ alreadyHydrated, serverText }: DraftHydrationInput): boolean {
  if (alreadyHydrated) return false;
  return serverText !== undefined;
}

export interface DraftSaveInput {
  /** Работу ещё можно править (черновик или возвращена на доработку). */
  editable: boolean;
  /** Сохранение уже идёт. */
  saving: boolean;
  /** Черновик на сервере есть, но его текст в поле ещё не подставлен. */
  awaitingServerDraft: boolean;
}

/** `true` — кнопку «Сохранить черновик» можно нажимать. */
export function canSaveDraft({ editable, saving, awaitingServerDraft }: DraftSaveInput): boolean {
  if (!editable) return false;
  if (saving) return false;
  // Пока сохранённый ответ не подставлен, пустое поле не должно уехать на сервер.
  return !awaitingServerDraft;
}
