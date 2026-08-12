/**
 * Видимость колонок реестра (CMP-002).
 *
 * Бюджет «≤7 колонок» требует места, куда убрать остальные. Правила намеренно
 * консервативные: любая порча сохранённого набора должна приводить к «показать больше»,
 * а не к пустой таблице — пользователь скорее переживёт лишнюю колонку, чем реестр,
 * в котором не видно ничего.
 */
export const resolveVisibleColumns = (
  allKeys: readonly string[],
  visibleKeys: readonly string[] | undefined
): string[] => {
  if (!visibleKeys || visibleKeys.length === 0) return [...allKeys];
  const requested = new Set(visibleKeys);
  const first = allKeys[0];
  // Порядок держим по объявлению колонок: сохранённый набор — это множество, не раскладка.
  const resolved = allKeys.filter((key, index) => index === 0 || requested.has(key));
  return first !== undefined && resolved.length === 0 ? [first] : resolved;
};

export const toggleColumn = (
  allKeys: readonly string[],
  visibleKeys: readonly string[],
  key: string
): string[] => {
  const first = allKeys[0];
  // Идентифицирующая колонка скрытию не подлежит: без неё строку не опознать.
  if (key === first) return [...visibleKeys];
  if (!visibleKeys.includes(key)) {
    return allKeys.filter((item) => visibleKeys.includes(item) || item === key);
  }
  const next = visibleKeys.filter((item) => item !== key);
  return next.length === 0 ? [...visibleKeys] : next;
};
