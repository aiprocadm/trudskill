/**
 * Какие группы меню раскрыты (ТЗ «Стабилизация, UX и развитие», 3.1 / Н1).
 *
 * **Как было.** Меню состояло из двух этажей: семь пунктов роли, под ними кнопка «Ещё», а под
 * ней — девять групп и около пятидесяти пунктов. Человек видел семь строк и делал единственный
 * возможный вывод: в системе семь разделов. Всё остальное приходилось СНАЧАЛА найти за кнопкой
 * «Ещё», а её раскрытие жило только до перехода на другую страницу — то есть каждый раз заново.
 *
 * **Стало.** Группы видны сразу, по умолчанию свёрнуты, раскрываются кликом — и раскрытие
 * переживает переходы между страницами. Группа, в которой лежит текущая страница, раскрывается
 * сама: иначе человек на такой странице не видит, где он находится.
 *
 * Хранилище браузера трогаем через try/catch: в приватном режиме обращение к нему БРОСАЕТ
 * исключение, и меню упало бы целиком. Потерять память о раскрытии не жалко, уронить меню — да.
 */

/** Ключ с префиксом проекта — в одном домене может жить не только этот продукт. */
export const OPEN_GROUPS_STORAGE_KEY = 'trudskill.nav.open-groups';

export type OpenGroups = Record<string, boolean>;

/** Прочитать сохранённое. Любая беда (нет доступа, мусор в значении) — пустое состояние. */
export const readOpenGroups = (storage: Storage | null | undefined): OpenGroups => {
  if (!storage) return {};
  let raw: string | null = null;
  try {
    raw = storage.getItem(OPEN_GROUPS_STORAGE_KEY);
  } catch {
    /* приватный режим или запрет на данные сайта — молча, это не повод ронять меню */
    return {};
  }
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: OpenGroups = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'boolean') out[key] = value;
    }
    return out;
  } catch {
    /* значение испорчено чем-то посторонним — начинаем с чистого листа */
    return {};
  }
};

export const writeOpenGroups = (storage: Storage | null | undefined, state: OpenGroups): void => {
  if (!storage) return;
  try {
    storage.setItem(OPEN_GROUPS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* места нет или запись запрещена — меню продолжает работать, просто не запомнит */
  }
};

/**
 * Раскрыта ли группа сейчас.
 *
 * Правило порядка: **решение человека важнее автоматики.** Если он сам свернул группу, в
 * которой находится, — она остаётся свёрнутой; навязывать раскрытие значило бы спорить с
 * человеком о его же меню. Если решения не было — раскрыта та группа, где лежит текущая
 * страница, и только она.
 */
export const isGroupOpen = (input: {
  groupId: string;
  saved: OpenGroups;
  activeGroupId: string | null;
}): boolean => {
  const manual = input.saved[input.groupId];
  if (typeof manual === 'boolean') return manual;
  return input.groupId === input.activeGroupId;
};

/** Новое состояние после нажатия на заголовок группы. */
export const toggleGroup = (input: {
  groupId: string;
  saved: OpenGroups;
  activeGroupId: string | null;
}): OpenGroups => ({
  ...input.saved,
  [input.groupId]: !isGroupOpen(input)
});
