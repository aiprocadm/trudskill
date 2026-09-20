'use client';

import { useRef } from 'react';

import { UnsavedChangesGuard } from './unsaved-changes-guard';
import { isFormDirty } from '../lib/forms/dirty';

import type { ReactElement } from 'react';

/**
 * Защита страничной формы одной строкой (ТЗ «Стабилизация, UX и развитие», 10.3).
 *
 *     const unsavedGuard = useUnsavedForm({ prefix, suffix, pattern }, { saving: busy });
 *     ...
 *     return (<PageContainer>{unsavedGuard}…</PageContainer>);
 *
 * **Почему экран обычно НЕ передаёт исходные значения.** Второй список — «а как было
 * изначально» — обязательно разойдётся с первым: кто-то поменяет значение по умолчанию в
 * форме и забудет про список. Дальше защита либо спрашивает всегда (и человек привыкает
 * отмахиваться), либо не спрашивает никогда. Поэтому по умолчанию исходное запоминается
 * само — то, что хук увидел первым.
 *
 * **Но форма редактирования узнаёт исходное ПОЗЖЕ,** когда придут данные с сервера. Там
 * «первое увиденное» — это пустая форма, и наполнение её данными система приняла бы за работу
 * человека: вопрос «уйти без сохранения?» выскакивал бы на экране, которого никто не трогал.
 * Для таких форм есть два способа, и выбор между ними определяется тем, ОТКУДА берётся
 * исходное состояние:
 *
 * - `baselineKey` — когда поля заполняются тем же кусочком кода, который ставит признак
 *   загрузки (`setSettings(s); setCode(s.code); …`). React применяет их вместе, поэтому к
 *   тому кадру, где сменился ключ, поля уже новые. Ключ меняется и после сохранения — и форма
 *   сразу считается чистой, как и должно быть.
 * - `initial` — когда поля наполняет отдельный эффект из контекста или запроса. Там к смене
 *   ключа поля ещё старые, и запоминать нечего. Исходное надо назвать прямо; чтобы не
 *   разъехалось с тем, что подставляет эффект, оба места берут его из ОДНОЙ функции.
 */
export const useUnsavedForm = (
  values: Record<string, unknown>,
  options?: {
    saving?: boolean;
    baselineKey?: string;
    initial?: Record<string, unknown>;
  }
): ReactElement | null => {
  const key = options?.baselineKey ?? '';
  const baseline = useRef<{ key: string; values: Record<string, unknown> }>({ key, values });
  /*
   * Сравнение и переустановка идут прямо при отрисовке, а не в эффекте: эффект выполняется
   * ПОСЛЕ, и один кадр форма считалась бы изменённой — этого кадра хватает, чтобы вопрос
   * выскочил при первом же клике сразу после загрузки данных.
   */
  if (baseline.current.key !== key) baseline.current = { key, values };

  const initial = options?.initial ?? baseline.current.values;
  const dirty = isFormDirty(values, initial);
  return (
    <UnsavedChangesGuard
      dirty={dirty}
      {...(options?.saving === undefined ? {} : { saving: options.saving })}
    />
  );
};
