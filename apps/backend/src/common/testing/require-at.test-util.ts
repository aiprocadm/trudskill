/**
 * Взять элемент списка, потребовав его наличия (журнал расхождений, запись 287).
 *
 * Под `noUncheckedIndexedAccess` выражение `list[0]` имеет тип «элемент или undefined».
 * В тестах это почти всегда «должен быть, иначе проверять нечего»: если элемента нет,
 * тест обязан упасть СРАЗУ и внятно, а не через шесть строк с «cannot read properties
 * of undefined».
 *
 * Пример:
 *   const doc = requireAt(state.generatedDocuments, 0, 'выпущенный документ');
 */
export function requireAt<T>(list: readonly T[], index: number, what = 'элемент'): T {
  const item = list[index];
  if (item === undefined) {
    throw new Error(
      `Ожидался ${what} по индексу ${index}, но список содержит ${list.length} элемент(ов).`
    );
  }
  return item;
}
