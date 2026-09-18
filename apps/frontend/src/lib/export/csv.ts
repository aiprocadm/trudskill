/**
 * Выгрузка таблицы в CSV (ТЗ «Стабилизация, UX и развитие», 5.5 / Э5).
 *
 * Сборка файла и его отдача браузеру были написаны в экране отчётов вручную; ТЗ 5.5 просит
 * «выгрузить» ещё и в панели массовых действий. Третьей копии не будет: правило живёт здесь.
 *
 * Разделитель — точка с запятой, а первым байтом идёт BOM: Excel с русской локалью открывает
 * файл с запятыми одной колонкой, а без BOM показывает кракозябры вместо кириллицы. Человек
 * получает файл, чтобы открыть его в Excel, а не чтобы разбираться с кодировками.
 */
const SEPARATOR = ';';
const BOM = '﻿';

/** Значение в ячейке: кавычки удваиваются, перевод строки и разделитель прячутся в кавычки. */
export const csvCell = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : String(value);
  return /["\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const buildCsv = (headers: readonly string[], rows: readonly unknown[][]): string =>
  BOM + [headers, ...rows].map((row) => row.map(csvCell).join(SEPARATOR)).join('\r\n');

/**
 * Отдать собранный CSV браузеру.
 *
 * `filename` — без расширения: оно добавляется здесь, чтобы «.csv» не забыли в одном из мест.
 * Имя файла не содержит времени: метка времени приходит параметром, иначе тест не воспроизводим.
 */
export const downloadCsv = (filename: string, content: string): void => {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};
