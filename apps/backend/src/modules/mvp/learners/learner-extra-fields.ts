/**
 * Именованные поля личного дела (ТЗ перехода §6.4 МГ-C1.3; срез 8.14, РМ84–РМ86).
 *
 * Вместо «дополнительная строка 1–10» из CDOPROF центр сам описывает свои поля в настройках
 * (`org.tenant_settings.payload.learnerExtraFields`, как `groupDefaults`): ключ, подпись, тип
 * (текст / дата / список). Значения лежат у слушателя в `extraFields` (колонка `extra_fields`),
 * в документах доступны как `{learner.extra.<ключ>}`.
 */
export const LEARNER_EXTRA_FIELDS_SETTINGS_KEY = 'learnerExtraFields';

/** ТЗ: «дополнительная строка 1–10» — столько же именованных полей на центр. */
export const MAX_LEARNER_EXTRA_FIELDS = 10;

export const LEARNER_EXTRA_FIELD_TYPES = ['text', 'date', 'list'] as const;
export type LearnerExtraFieldType = (typeof LEARNER_EXTRA_FIELD_TYPES)[number];

export interface LearnerExtraFieldDef {
  /** Латиница, цифры, подчёркивание; с буквы; до 40 знаков — это часть имени переменной документа. */
  key: string;
  label: string;
  type: LearnerExtraFieldType;
  /** Только для типа `list`: допустимые значения. */
  options?: string[];
}

export const LEARNER_EXTRA_FIELD_KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

/**
 * Снисходительный разбор описания из настроек (РМ84): испорченная запись пропускается, дубли
 * ключей — первая побеждает, лишние поля сверх лимита отбрасываются. Ломать карточки из-за
 * кривой настройки нельзя.
 */
export const resolveLearnerExtraFields = (raw: unknown): LearnerExtraFieldDef[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: LearnerExtraFieldDef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const key = str(rec.key)?.toLowerCase() ?? null;
    const label = str(rec.label);
    const type = str(rec.type) as LearnerExtraFieldType | null;
    if (!key || !LEARNER_EXTRA_FIELD_KEY_RE.test(key) || !label) continue;
    if (!type || !LEARNER_EXTRA_FIELD_TYPES.includes(type)) continue;
    if (seen.has(key)) continue;
    const options = Array.isArray(rec.options)
      ? rec.options.map(str).filter((v): v is string => v !== null)
      : [];
    if (type === 'list' && options.length === 0) continue;
    seen.add(key);
    out.push({ key, label, type, ...(type === 'list' ? { options } : {}) });
    if (out.length >= MAX_LEARNER_EXTRA_FIELDS) break;
  }
  return out;
};

export const learnerExtraFieldsFrom = (
  payload: Record<string, unknown> | undefined
): LearnerExtraFieldDef[] =>
  resolveLearnerExtraFields(payload?.[LEARNER_EXTRA_FIELDS_SETTINGS_KEY]);

export interface ExtraFieldsProblem {
  key: string;
  message: string;
}

/**
 * Проверка значений при правке карточки (РМ85): неизвестный ключ, дата не в ISO, значение вне
 * списка. Пустая строка — «очистить», допустима всегда. Возвращает список проблем — пусто,
 * если всё в порядке; текст готов для человека (TXT-004).
 */
export const validateLearnerExtraFields = (
  values: Record<string, unknown>,
  defs: ReadonlyArray<LearnerExtraFieldDef>
): ExtraFieldsProblem[] => {
  const byKey = new Map(defs.map((def) => [def.key, def]));
  const problems: ExtraFieldsProblem[] = [];
  for (const [key, raw] of Object.entries(values)) {
    const def = byKey.get(key);
    if (!def) {
      const allowed =
        defs.map((d) => `${d.label} (${d.key})`).join(', ') || 'ни одного поля не настроено';
      problems.push({
        key,
        message: `Поле «${key}» не описано в настройках центра. Допустимые: ${allowed}.`
      });
      continue;
    }
    if (raw === null || raw === undefined || raw === '') continue;
    if (typeof raw !== 'string') {
      problems.push({ key, message: `Поле «${def.label}»: ожидается текст.` });
      continue;
    }
    if (def.type === 'date' && !DATE_RE.test(raw)) {
      problems.push({ key, message: `Поле «${def.label}»: дата в формате ГГГГ-ММ-ДД.` });
    }
    if (def.type === 'list' && !(def.options ?? []).includes(raw)) {
      problems.push({
        key,
        message: `Поле «${def.label}»: выберите одно из значений — ${(def.options ?? []).join(', ')}.`
      });
    }
  }
  return problems;
};

/** Код переменной документа для именованного поля (РМ86). */
export const extraFieldVariableCode = (key: string): string => `learner.extra.${key}`;
const EXTRA_PREFIX = 'learner.extra.';

/** Разрешение `{learner.extra.<ключ>}` по значениям слушателя: нет значения — пустая строка. */
export const resolveExtraFieldVariables = (
  extraFields: Record<string, unknown> | undefined,
  codes: ReadonlyArray<string>
): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const code of codes) {
    if (!code.startsWith(EXTRA_PREFIX)) continue;
    const value = extraFields?.[code.slice(EXTRA_PREFIX.length)];
    out[code] = typeof value === 'string' ? value : value == null ? '' : String(value);
  }
  return out;
};
