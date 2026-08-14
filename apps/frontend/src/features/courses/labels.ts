/**
 * Подписи карточки курса (`TXT-006`).
 *
 * В списке материалов человеку показывали имя поля базы: «1. Инструктаж [text]
 * min_view_seconds=60». Вид материала стоял кодом в квадратных скобках, а минимальное
 * время просмотра — машинным именем колонки со значением в секундах.
 */

export const MATERIAL_TYPE_LABELS: Record<string, string> = {
  text: 'Текст',
  video: 'Видео',
  file: 'Файл',
  external_url: 'Внешняя ссылка',
  scorm: 'Пакет SCORM'
};

export const materialTypeLabel = (type: string): string => MATERIAL_TYPE_LABELS[type] ?? type;

/**
 * Время просмотра человеку — минутами, а не «60 s».
 *
 * Ноль значит «без ограничения»: так задаются пакеты SCORM, где время считает сам пакет.
 */
export const viewTimeLabel = (seconds: number | undefined): string => {
  if (!seconds) return 'без ограничения';
  if (seconds < 60) return `${seconds} с`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes} мин ${rest} с` : `${minutes} мин`;
};

/** Что мешает опубликовать курс — списком, а не одной общей фразой. */
export const publishBlockers = (input: {
  hasVersion: boolean;
  hasModule: boolean;
  hasMaterial: boolean;
}): string[] => {
  const blockers: string[] = [];
  if (!input.hasVersion) blockers.push('нет ни одной версии курса');
  if (!input.hasModule) blockers.push('в версии нет ни одного модуля');
  if (!input.hasMaterial) blockers.push('в модуле нет ни одного материала');
  return blockers;
};
