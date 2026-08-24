/**
 * Русские названия для кодов подписания (НЭП).
 *
 * Экраны `/esign/*` печатали коды как есть: «submitted», «in_signing»,
 * «esign.participant.signed». Администратор учебного центра таких слов не знает — правило
 * продукта запрещает сырой код как значение в таблице.
 *
 * Значения взяты **из ограничений базы и из кода сервиса**, а не из головы:
 * `esign.esign_applications.status` и `esign.signing_processes.status` — миграция 0004,
 * типы событий — строки, которые пишет `esign.service.ts`.
 */

export const ESIGN_APPLICATION_STATUS_LABEL: Record<string, string> = {
  draft: 'Черновик',
  submitted: 'Подана',
  under_review: 'На проверке',
  approved: 'Одобрена',
  rejected: 'Отклонена',
  expired: 'Истёк срок',
  reused: 'Использована повторно'
};

export const ESIGN_PROCESS_STATUS_LABEL: Record<string, string> = {
  draft: 'Черновик',
  prepared: 'Подготовлен',
  awaiting_participants: 'Ждём участников',
  in_signing: 'Идёт подписание',
  signed: 'Подписан',
  failed: 'Сбой',
  cancelled: 'Отменён'
};

export const ESIGN_EVENT_LABEL: Record<string, string> = {
  'esign.application.created': 'Заявка создана',
  'esign.application_created': 'Заявка создана',
  'esign.application.submitted': 'Заявка подана',
  'esign.application.review_started': 'Заявку взяли на проверку',
  'esign.application.approved': 'Заявка одобрена',
  'esign.application.rejected': 'Заявка отклонена',
  'esign.application.reused': 'Заявка использована повторно',
  'esign.application_file.uploaded': 'Файл загружен',
  'esign.application_file.verified': 'Файл проверен',
  'esign.application_file.rejected': 'Файл отклонён',
  'esign.application_file.deleted': 'Файл удалён',
  'esign.process.created': 'Подписание создано',
  'esign.process.started': 'Подписание начато',
  'esign.process.cancelled': 'Подписание отменено',
  'esign.participant.invited': 'Участник приглашён',
  'esign.participant.viewed': 'Участник открыл документ',
  'esign.participant.signed': 'Участник подписал',
  'esign.participant.rejected': 'Участник отказался',
  'esign.participant.skipped': 'Участника пропустили'
};

/**
 * Неизвестный код не выдаётся за название: он подписывается как код. Врать «Событие»
 * там, где мы не знаем, что произошло, хуже — человек примет догадку за факт.
 */
export const formatEsignEvent = (code: string): string =>
  ESIGN_EVENT_LABEL[code] ?? `Событие (код ${code})`;

export const formatEsignApplicationStatus = (code: string): string =>
  ESIGN_APPLICATION_STATUS_LABEL[code] ?? `Статус (код ${code})`;

export const formatEsignProcessStatus = (code: string): string =>
  ESIGN_PROCESS_STATUS_LABEL[code] ?? `Статус (код ${code})`;
