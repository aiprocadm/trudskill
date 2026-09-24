/**
 * Как нумеровать — готовые шаблоны номера (МГ-F3.1, срез 19.3, РМ126).
 *
 * В CDOPROF это «политики» на экране из сорока полей: «номер приказа = номер группы», «номер
 * удостоверения = номеру протокола»… Здесь политика — просто готовая маска из токенов: человек
 * выбирает понятную фразу, а маска видна и правится, если нужно своё.
 */
export interface NumberingPreset {
  id: string;
  label: string;
  pattern: string;
  hint: string;
}

export const NUMBERING_PRESETS: readonly NumberingPreset[] = [
  {
    id: 'counter',
    label: 'Сквозной счётчик',
    pattern: '{prefix}{counter}{suffix}',
    hint: 'Каждый следующий документ получает номер на единицу больше.'
  },
  {
    id: 'group_code',
    label: 'Номер = код группы',
    pattern: '{group.code}',
    hint: 'Как в CDOPROF: номер приказа или протокола совпадает с кодом учебной группы.'
  },
  {
    id: 'protocol_seq',
    label: 'Номер протокола + порядок в группе',
    pattern: '{protocol.number}-{seq.group}',
    hint: 'Как в CDOPROF для удостоверений: номер протокола группы и номер строки слушателя в нём.'
  },
  {
    id: 'series_counter',
    label: 'Серия и номер',
    pattern: '{series} {counter}',
    hint: 'Серия бланка и сквозной номер — для дипломов и свидетельств.'
  },
  {
    id: 'parts',
    label: 'Номер из трёх частей',
    pattern: '{parts}',
    hint: 'Как в CDOPROF: до трёх частей через дефис, у каждой своё начало; растущая часть прибавляет по единице.'
  }
];

/** Какой готовый шаблон узнаётся в маске; своя маска — `custom`. */
export const presetOf = (pattern: string): string =>
  NUMBERING_PRESETS.find((preset) => preset.pattern === pattern)?.id ?? 'custom';
