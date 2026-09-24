/** Уровни образования ФРДО (МГ-C1.2, РМ81): коды в карточке — подписи по-русски на экране. */
export const EDUCATION_LEVEL_LABEL: Record<string, string> = {
  basic_general: 'Основное общее',
  secondary_general: 'Среднее общее',
  secondary_vocational: 'Среднее профессиональное',
  higher_bachelor: 'Высшее — бакалавриат',
  higher_specialist: 'Высшее — специалитет, магистратура',
  higher_postgraduate: 'Высшее — подготовка кадров высшей квалификации',
  other: 'Иное'
};

/** Подпись уровня: код из списка → название; старое свободное значение — как есть. */
export const educationLevelLabel = (value: string | undefined): string =>
  value ? (EDUCATION_LEVEL_LABEL[value] ?? value) : 'не указано';
