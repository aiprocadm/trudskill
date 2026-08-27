/**
 * Ревизия 2026-08-27 (порция 28, журнал 281) — «в форме есть несохранённые правки».
 *
 * Боковая панель умеет спрашивать подтверждение при закрытии (`CMP-010`), но ей нужно
 * сказать, есть ли что терять. Семь форм этого не говорили, поэтому Esc и клик мимо
 * панели стирали заполненное молча.
 *
 * Сравнение поверхностное по значениям: поля форм — строки, числа, флаги и списки
 * идентификаторов. Составные значения (список вариантов ответа) сравниваются по своему
 * текстовому представлению — для признака «что-то изменилось» этого достаточно, а
 * глубокое сравнение стоило бы дороже и врало бы на порядке ключей ровно так же.
 */
export function isFormDirty<T extends object>(current: T, initial: T): boolean {
  // Формы описаны интерфейсами без индексной сигнатуры — читаем их как записи здесь,
  // а не требуем `Record<string, unknown>` от каждого типа формы.
  const currentFields = current as Record<string, unknown>;
  const initialFields = initial as Record<string, unknown>;
  const keys = new Set([...Object.keys(currentFields), ...Object.keys(initialFields)]);
  for (const key of keys) {
    const a = currentFields[key];
    const b = initialFields[key];
    if (a === b) continue;
    if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
      if (JSON.stringify(a) !== JSON.stringify(b)) return true;
      continue;
    }
    return true;
  }
  return false;
}
