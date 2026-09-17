/**
 * Действие карточки курса по его состоянию (ТЗ «Стабилизация, UX и развитие», 5.2 / Э2).
 *
 * **Как было.** У опубликованного курса главная кнопка — «Опубликовать курс»: она смотрела на
 * права и на готовность структуры, но не на состояние. Нажатие «публиковало» уже
 * опубликованное — сервер молча ставил тот же статус и писал лишнюю строку в журнал.
 *
 * **Правило.** Кнопка отражает текущее состояние: черновик — «Опубликовать курс», опубликован —
 * «Создать новую версию», в архиве — главного действия нет. Недоступное действие скрывается, а
 * не показывается вхолостую; исключение одно — черновик без структуры: кнопка выключена, а
 * рядом список того, чего не хватает (человеку нужно знать, что сделать, чтобы опубликовать).
 * Возможность действия проверяет сервер (`course_not_draft`, `course_already_archived`) —
 * кнопка лишь отражает его правила.
 */
export type CourseStatus = 'draft' | 'published' | 'archived';

export type CourseHeaderAction =
  | { kind: 'publish'; label: 'Опубликовать курс'; disabled: boolean }
  | { kind: 'new_version'; label: 'Создать новую версию' };

export const courseHeaderAction = (input: {
  status: string;
  readyToPublish: boolean;
  canPublish: boolean;
  canCreateVersion: boolean;
}): CourseHeaderAction | null => {
  if (input.status === 'draft' && input.canPublish) {
    return { kind: 'publish', label: 'Опубликовать курс', disabled: !input.readyToPublish };
  }
  if (input.status === 'published' && input.canCreateVersion) {
    return { kind: 'new_version', label: 'Создать новую версию' };
  }
  return null;
};

/** «В архив» — только у живого курса: архивировать архив нельзя, и сервер это тоже не даст. */
export const canArchiveCourse = (status: string, canArchive: boolean): boolean =>
  canArchive && status !== 'archived';
