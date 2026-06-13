/**
 * Человекочитаемая (русская) подпись статуса — НЕ-цветовой носитель смысла для StatusChip
 * (WCAG 1.4.1: использование цвета). Покрывает значения `EntityStatus` и широко
 * используемые строковые статусы (enrollment/completion/document). Неизвестный ключ
 * возвращается как есть (fallback), чтобы чип всегда нёс осмысленный текст.
 */
const STATUS_LABELS: Record<string, string> = {
  // EntityStatus
  active: 'Активен',
  inactive: 'Неактивен',
  archived: 'В архиве',
  // Enrollment / completion
  pending: 'Ожидает',
  completed: 'Завершён',
  canceled: 'Отменён',
  not_started: 'Не начат',
  in_progress: 'В процессе',
  failed: 'Не пройден',
  // Documents / signing
  draft: 'Черновик',
  generated: 'Выдан',
  signed: 'Подписан',
  revoked: 'Аннулирован'
};

export function statusAccessibleLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}
