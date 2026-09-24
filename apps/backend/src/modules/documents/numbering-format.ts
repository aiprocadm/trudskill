/**
 * МГ-F3.1 (ТЗ перехода с CDOPROF, Фаза 3, срез 19.2): сборка номера документа по шаблону.
 *
 * Чистые функции — без состояния и без часов: сервис даёт им правило, очередное значение
 * счётчика, период и «факты» выпуска (код группы, номер протокола, порядок слушателя), а они
 * отвечают строкой номера или списком того, чего не хватает.
 *
 * Токены шаблона:
 * - `{prefix}` `{suffix}` `{period}` `{counter}` — как до среза (счётчик — шесть цифр);
 * - `{seq.year}` — тот же счётчик без ведущих нулей («12», а не «000012»);
 * - `{group.code}` — код учебной группы («номер приказа = код группы», CDOPROF);
 * - `{protocol.number}` — номер протокола группы («номер удостоверения = номер протокола…»);
 * - `{seq.group}` — порядок слушателя в группе, тот же, что строка в таблице протокола;
 * - `{series}` — серия бланка из правила;
 * - `{parts}` — три части номера CDOPROF через дефис, у каждой свой старт и флажок «сама
 *   растёт» (РМ126).
 *
 * «Политики» CDOPROF («номер приказа = код группы» и т. п.) — готовые шаблоны из этих токенов,
 * а не отдельное поле правила (РМ126): одна модель вместо двух, и любой шаблон виден глазом.
 */

/** Вместо номера в образце — слово: образец нельзя спутать с выданным документом (МГ-F5.1). */
export const SAMPLE_DOCUMENT_NUMBER = 'ОБРАЗЕЦ';

/** Часть номера CDOPROF: начальное значение и «растёт ли сама» с каждым выпуском. */
export interface NumberPart {
  start: number;
  auto: boolean;
}

/** Что известно о выпуске, кроме правила и счётчика. */
export interface NumberingFacts {
  groupId?: string | undefined;
  groupCode?: string | undefined;
  protocolNumber?: string | undefined;
  seqGroup?: number | undefined;
}

export interface NumberingRuleShape {
  prefix: string;
  suffix: string;
  pattern: string;
  series?: string | undefined;
  parts?: NumberPart[] | undefined;
}

/** Токены, которым нужны данные группы или протокола, — с человеческим названием. */
export const FACT_TOKENS = {
  '{group.code}': 'код группы',
  '{protocol.number}': 'номер протокола группы',
  '{seq.group}': 'порядок слушателя в группе'
} as const;

export type FactToken = keyof typeof FACT_TOKENS;

const FACT_OF: Record<FactToken, keyof NumberingFacts> = {
  '{group.code}': 'groupCode',
  '{protocol.number}': 'protocolNumber',
  '{seq.group}': 'seqGroup'
};

/** Какие «факты» нужны шаблону: пусто — номер собирается из одного счётчика, как раньше. */
export const factTokensOf = (pattern: string): FactToken[] =>
  (Object.keys(FACT_TOKENS) as FactToken[]).filter((token) => pattern.includes(token));

/** Номер собирается только из фактов — счётчик в нём не участвует (например, `{group.code}`). */
export const isDerivedPattern = (pattern: string): boolean =>
  factTokensOf(pattern).length > 0 &&
  !['{counter}', '{seq.year}', '{parts}'].some((token) => pattern.includes(token));

/** Чего не хватает для номера — названиями для человека, а не кодами токенов. */
export const missingFacts = (pattern: string, facts: NumberingFacts): string[] =>
  factTokensOf(pattern)
    .filter((token) => {
      const value = facts[FACT_OF[token]];
      return value === undefined || value === '';
    })
    .map((token) => FACT_TOKENS[token]);

/** Части номера: у «растущей» части к старту прибавляется число уже выданных номеров. */
export const formatParts = (parts: readonly NumberPart[], counter: number): string =>
  parts.map((part) => `${part.auto ? part.start + counter - 1 : part.start}`).join('-');

/**
 * Номер по правилу. `counter` — очередное значение счётчика (1, 2, …), `periodToken` — период
 * ('2026', '2026-09' или '' без сброса). Недостающий факт подставляется пустой строкой —
 * звать эту функцию стоит только после `missingFacts`.
 */
export function formatRuleNumber(
  rule: NumberingRuleShape,
  counter: number,
  periodToken: string,
  facts: NumberingFacts
): string {
  const values: Record<string, string> = {
    '{prefix}': rule.prefix,
    '{suffix}': rule.suffix,
    '{period}': periodToken,
    '{counter}': `${counter}`.padStart(6, '0'),
    '{seq.year}': `${counter}`,
    '{series}': rule.series ?? '',
    '{parts}': rule.parts?.length ? formatParts(rule.parts, counter) : `${counter}`,
    '{group.code}': facts.groupCode ?? '',
    '{protocol.number}': facts.protocolNumber ?? '',
    '{seq.group}': facts.seqGroup !== undefined ? `${facts.seqGroup}` : ''
  };
  return Object.entries(values).reduce(
    (acc, [token, value]) => acc.split(token).join(value),
    rule.pattern
  );
}
