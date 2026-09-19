/**
 * Перестановка модулей и материалов программы (ТЗ «Стабилизация, UX и развитие», 8.4).
 *
 * **Почему порядок задаётся СПИСКОМ ЦЕЛИКОМ, а не сдвигом по одному.** Сдвиг («подними этот
 * на одну позицию») выглядит проще, но он не идемпотентен: повторный запрос после обрыва связи
 * сдвинет ещё раз, и порядок разъедется незаметно. Список целиком — это заявление «вот как
 * должно быть»: повторите его сколько угодно раз, результат тот же.
 *
 * **Почему список обязан быть полным.** Принять часть значило бы додумать за человека, куда
 * девать остальные: программа — это порядок, и «половина порядка» смысла не имеет. Неполный
 * или лишний список — отказ с объяснением, а не тихая догадка.
 */

export interface OrderableItem {
  id: string;
  sortOrder: number;
}

export interface OrderOutcome<T extends OrderableItem> {
  /** Элементы с новым порядком — в том же виде, в каком лежали. */
  items: T[];
  /** Сколько элементов реально поменяли место. Ноль — запрос повторили, и это нормально. */
  moved: number;
}

export class ProgramOrderError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'ProgramOrderError';
  }
}

/**
 * Новый порядок по списку идентификаторов.
 *
 * Отказы называют, ЧТО не так, человеческим языком: сообщение уходит на экран, и «invalid
 * order» там ничего не объясняет.
 */
export const applyOrder = <T extends OrderableItem>(
  current: T[],
  orderedIds: string[]
): OrderOutcome<T> => {
  const known = new Map(current.map((item) => [item.id, item]));

  const duplicates = orderedIds.filter((id, index) => orderedIds.indexOf(id) !== index);
  if (duplicates.length > 0) {
    throw new ProgramOrderError(
      'В списке порядка есть повторы — каждый пункт встречается один раз'
    );
  }

  const unknown = orderedIds.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new ProgramOrderError('В списке порядка есть пункты не из этой программы');
  }

  if (orderedIds.length !== current.length) {
    throw new ProgramOrderError(
      `Список порядка неполный: пунктов ${current.length}, а прислано ${orderedIds.length}. Порядок задаётся целиком`
    );
  }

  let moved = 0;
  const items = orderedIds.map((id, index) => {
    const item = known.get(id)!;
    if (item.sortOrder !== index) moved += 1;
    return { ...item, sortOrder: index };
  });

  return { items, moved };
};

/**
 * Сдвиг одного пункта на шаг вверх или вниз — для кнопок «↑»/«↓».
 *
 * Перетаскивание мышью есть не у всех: на телефоне оно ненадёжно, с клавиатуры недоступно
 * вовсе. Кнопки — обязательный запасной способ (`A11Y`), и они выражаются через тот же список
 * целиком, а не через отдельную ручку: два способа задать порядок разъехались бы.
 *
 * Край списка — не ошибка: список возвращается как был. Ругаться на «вверх» у первого пункта
 * значило бы наказывать человека за попытку.
 */
export const movedByOne = (ids: string[], id: string, direction: 'up' | 'down'): string[] => {
  const index = ids.indexOf(id);
  if (index === -1) return ids;
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= ids.length) return ids;
  const next = [...ids];
  next[index] = ids[target]!;
  next[target] = id;
  return next;
};

/**
 * Перенос пункта на место другого — для перетаскивания.
 *
 * Пункт вынимается и вставляется перед целевым; хвост сдвигается. Перенос «на самого себя» и
 * перенос неизвестного пункта ничего не меняют: бросить пункт на его же место — обычное дело,
 * и падать на этом нельзя.
 */
export const movedTo = (ids: string[], id: string, beforeId: string): string[] => {
  if (id === beforeId) return ids;
  const from = ids.indexOf(id);
  const to = ids.indexOf(beforeId);
  if (from === -1 || to === -1) return ids;
  const rest = ids.filter((item) => item !== id);
  const insertAt = rest.indexOf(beforeId);
  return [...rest.slice(0, insertAt), id, ...rest.slice(insertAt)];
};
