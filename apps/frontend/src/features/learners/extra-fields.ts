/**
 * Именованные поля личного дела на фронте (ТЗ перехода §6.4 МГ-C1.3; срез 8.14b, РМ84–РМ89).
 *
 * Описание полей центр хранит в настройках (`tenant/settings` → `payload.learnerExtraFields`),
 * значения — у слушателя в `extraFields`. Разбор описания намеренно зеркалит серверный
 * (`apps/backend/src/modules/mvp/learners/learner-extra-fields.ts`): испорченная запись
 * пропускается, а не ломает экран. Дублирование осознанное — как у проверки СНИЛС.
 */
export const LEARNER_EXTRA_FIELDS_SETTINGS_KEY = 'learnerExtraFields';

/** ТЗ: «дополнительная строка 1–10» — столько же именованных полей на центр. */
export const MAX_LEARNER_EXTRA_FIELDS = 10;

export const LEARNER_EXTRA_FIELD_TYPES = ['text', 'date', 'list'] as const;
export type LearnerExtraFieldType = (typeof LEARNER_EXTRA_FIELD_TYPES)[number];

export const EXTRA_FIELD_TYPE_LABEL: Record<LearnerExtraFieldType, string> = {
  text: 'Текст',
  date: 'Дата',
  list: 'Выбор из списка'
};

export interface LearnerExtraFieldDef {
  /** Латиница, цифры, подчёркивание; с буквы; до 40 знаков — это часть имени переменной документа. */
  key: string;
  label: string;
  type: LearnerExtraFieldType;
  options?: string[];
}

export const LEARNER_EXTRA_FIELD_KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const isType = (value: string): value is LearnerExtraFieldType =>
  (LEARNER_EXTRA_FIELD_TYPES as ReadonlyArray<string>).includes(value);

/** Снисходительный разбор описания из настроек (РМ84) — зеркало серверного. */
export const parseLearnerExtraFields = (raw: unknown): LearnerExtraFieldDef[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: LearnerExtraFieldDef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const key = str(rec.key)?.toLowerCase() ?? null;
    const label = str(rec.label);
    const type = str(rec.type);
    if (!key || !LEARNER_EXTRA_FIELD_KEY_RE.test(key) || !label) continue;
    if (!type || !isType(type)) continue;
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
): LearnerExtraFieldDef[] => parseLearnerExtraFields(payload?.[LEARNER_EXTRA_FIELDS_SETTINGS_KEY]);

/** Код переменной документа для поля — так его вставляют в шаблон. */
export const extraFieldVariableCode = (key: string): string => `learner.extra.${key}`;

const TRANSLIT: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'j',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'c',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya'
};

/**
 * Имя переменной из подписи (РМ88): администратор пишет «Дата приёма», а имя `data_priema`
 * получает сам — придумывать латиницу руками ему не нужно. Имя остаётся правимым.
 */
export const suggestExtraFieldKey = (label: string): string => {
  const latin = label
    .toLowerCase()
    .split('')
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_');
  const started = /^[a-z]/.test(latin) ? latin : latin ? `f_${latin}` : '';
  return started.slice(0, 40).replace(/_+$/, '');
};

/** Строка редактора настроек: варианты списка — одной строкой через запятую. */
export interface ExtraFieldRow {
  key: string;
  label: string;
  type: LearnerExtraFieldType;
  options: string;
}

export const rowFromDef = (def: LearnerExtraFieldDef): ExtraFieldRow => ({
  key: def.key,
  label: def.label,
  type: def.type,
  options: (def.options ?? []).join(', ')
});

export const splitOptions = (options: string): string[] =>
  options
    .split(/[,;\n]/)
    .map((v) => v.trim())
    .filter(Boolean);

export const defFromRow = (row: ExtraFieldRow): LearnerExtraFieldDef => ({
  key: row.key.trim().toLowerCase(),
  label: row.label.trim(),
  type: row.type,
  ...(row.type === 'list' ? { options: splitOptions(row.options) } : {})
});

/**
 * Проверка описания перед сохранением — по-русски, с номером строки (TXT-004). Пусто —
 * сохранять можно.
 */
export const validateExtraFieldRows = (rows: ReadonlyArray<ExtraFieldRow>): string[] => {
  const problems: string[] = [];
  const seen = new Map<string, number>();
  rows.forEach((row, index) => {
    const no = index + 1;
    const label = row.label.trim();
    const key = row.key.trim().toLowerCase();
    if (!label) problems.push(`Поле ${no}: укажите подпись — так оно будет называться в карточке.`);
    if (!key) {
      problems.push(`Поле ${no}: укажите имя для документов латиницей, например otdel.`);
    } else if (!LEARNER_EXTRA_FIELD_KEY_RE.test(key)) {
      problems.push(
        `Поле ${no}: имя для документов — латинские буквы, цифры и подчёркивание, с буквы, до 40 знаков.`
      );
    } else if (seen.has(key)) {
      problems.push(`Поле ${no}: имя «${key}» уже занято полем ${seen.get(key)}.`);
    } else {
      seen.set(key, no);
    }
    if (row.type === 'list' && splitOptions(row.options).length === 0) {
      problems.push(`Поле ${no}: для выбора из списка перечислите варианты через запятую.`);
    }
  });
  if (rows.length > MAX_LEARNER_EXTRA_FIELDS) {
    problems.push(`Полей не больше ${MAX_LEARNER_EXTRA_FIELDS} — уберите лишние.`);
  }
  return problems;
};

const LEGACY_RE = /^legacy_(\d{1,2})$/;

/**
 * Подпись ключа, которого нет в описании центра (РМ89): такие приходят из переноса CDOPROF
 * (`legacy_N`) или остались от удалённого поля. Сырой ключ подписью не показываем.
 */
export const undescribedExtraFieldLabel = (key: string): string => {
  const legacy = LEGACY_RE.exec(key);
  if (legacy) return `Дополнительная строка ${legacy[1]} (из CDOPROF)`;
  return `Поле без описания «${key}»`;
};
