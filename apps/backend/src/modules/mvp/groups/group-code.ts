import { todayIn } from '../../../common/utils/tenant-calendar.js';

/**
 * Автономер группы по шаблону центра (ТЗ перехода §6.1 МГ-B1.2; Фаза 2, срез 8.1, РМ47).
 *
 * Шаблон по умолчанию `{YY}{WW}{NN}`: год, ISO-неделя, порядковый номер в неделе (два знака,
 * при переполнении — три). Токены: `{YYYY}` `{YY}` `{MM}` `{DD}` `{WW}` `{NN}` `{NNN}`
 * `{direction.code}`. Календарь считается в часовом поясе центра — как дата документа
 * (журнал 300). Счётчик — минимальный свободный номер среди существующих кодов с тем же
 * префиксом: код нужен уникальный в центре, а не «следующий за последним».
 */
export const DEFAULT_GROUP_CODE_PATTERN = '{YY}{WW}{NN}';

const KNOWN_TOKENS = ['YYYY', 'YY', 'MM', 'DD', 'WW', 'NN', 'NNN', 'direction.code'] as const;
const TOKEN_RE = /\{([A-Za-z.]+)\}/g;

/** Шаблон допустим: только известные токены, длина разумная. Иначе — шаблон по умолчанию. */
export function isValidGroupCodePattern(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  const pattern = raw.trim();
  if (pattern.length === 0 || pattern.length > 40) return false;
  const tokens = [...pattern.matchAll(TOKEN_RE)].map((m) => m[1] ?? '');
  return tokens.every((t) => (KNOWN_TOKENS as ReadonlyArray<string>).includes(t));
}

/** ISO-неделя (1–53) календарной даты `YYYY-MM-DD`. */
export function isoWeek(date: string): number {
  const at = new Date(`${date}T00:00:00Z`);
  const day = at.getUTCDay() || 7;
  // Четверг той же недели однозначно определяет ISO-год и номер недели.
  at.setUTCDate(at.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(at.getUTCFullYear(), 0, 1));
  return Math.ceil(((at.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

const pad = (value: number, width: number): string => String(value).padStart(width, '0');

export interface GroupCodeInput {
  pattern?: string | undefined;
  /** Момент создания; календарь берётся в поясе центра. */
  at: Date;
  timezone: string | undefined;
  /** Коды групп центра — для счётчика и уникальности. */
  existingCodes: Iterable<string>;
  directionCode?: string | undefined;
}

/** Части шаблона без счётчика; `counter` — ширина счётчика (0 — в шаблоне его нет). */
export function renderGroupCodePrefix(input: GroupCodeInput): {
  prefix: string;
  counterWidth: number;
} {
  const pattern = isValidGroupCodePattern(input.pattern)
    ? input.pattern.trim()
    : DEFAULT_GROUP_CODE_PATTERN;
  const today = todayIn(input.timezone, input.at);
  const [yyyy = '', mm = '', dd = ''] = today.split('-');
  let counterWidth = 0;
  const prefix = pattern.replace(TOKEN_RE, (_, token: string) => {
    switch (token) {
      case 'YYYY':
        return yyyy;
      case 'YY':
        return yyyy.slice(-2);
      case 'MM':
        return mm;
      case 'DD':
        return dd;
      case 'WW':
        return pad(isoWeek(today), 2);
      case 'NN':
        counterWidth = Math.max(counterWidth, 2);
        return '\u0000';
      case 'NNN':
        counterWidth = Math.max(counterWidth, 3);
        return '\u0000';
      case 'direction.code':
        return (input.directionCode ?? '').trim();
      default:
        return '';
    }
  });
  return { prefix, counterWidth };
}

/**
 * Свободный код по шаблону. Счётчик подставляется на место `{NN}`/`{NNN}` (если токена нет —
 * в конец): минимальный номер, которого ещё нет среди кодов центра; при переполнении ширины
 * номер растёт на знак, а не обрезается.
 */
export function generateGroupCode(input: GroupCodeInput): string {
  const { prefix, counterWidth } = renderGroupCodePrefix(input);
  const width = counterWidth || 2;
  const template = prefix.includes('\u0000') ? prefix : `${prefix}\u0000`;
  const taken = new Set(input.existingCodes);
  for (let n = 1; n < 100_000; n += 1) {
    const candidate = template.replace('\u0000', pad(n, width));
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error('не удалось подобрать свободный код группы');
}
