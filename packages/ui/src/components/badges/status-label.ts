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
  // Два написания живут рядом намеренно: `canceled` приходит из типа `AsyncTaskStatus`,
  // `cancelled` — ключ карты цветов. Разное число «l» — не опечатка, а два источника.
  canceled: 'Отменён',
  cancelled: 'Отменён',
  not_started: 'Не начат',
  in_progress: 'В процессе',
  failed: 'Не пройден',
  // Фоновые задачи: очередь → выполнение (карта цветов, `AsyncStatusWidget`).
  queued: 'В очереди',
  running: 'Выполняется',
  // Публикация курса, теста, банка вопросов.
  published: 'Опубликован',
  // Доступ закрыт: `blocked` — запрет действия, `suspended` — временная приостановка
  // (арендатор на паузе). Слова разные, потому что и смысл разный.
  blocked: 'Заблокирован',
  suspended: 'Приостановлен',
  // Documents / signing — слова сверены с книгой выдачи (issuance-journal, канон):
  // «generated» это ещё ПОДГОТОВЛЕННЫЙ документ, выданным он становится в «final».
  draft: 'Черновик',
  generated: 'Подготовлен',
  final: 'Выдан',
  signed: 'Подписан',
  revoked: 'Аннулирован'
};

export function statusAccessibleLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}
