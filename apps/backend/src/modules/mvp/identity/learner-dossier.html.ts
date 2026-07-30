import type { LearnerDossier } from './learner-dossier.js';

/**
 * HTML личного дела (ФТ-C2, Фаза 3 Task 9 часть 2) — чистая функция без ввода-вывода.
 *
 * Документ отдают проверяющему, поэтому важнее читаемость и полнота, чем красота:
 * никаких внешних шрифтов и картинок (страница обязана рендериться одинаково без сети),
 * никакого JavaScript, только таблицы и текст.
 */

/** Экранирование: в деле есть ФИО и причины отклонения, введённые людьми. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const EMPTY = '—';

function cell(value: string | number | boolean | undefined): string {
  if (value === undefined || value === '') return EMPTY;
  if (typeof value === 'boolean') return value ? 'да' : 'нет';
  return escapeHtml(String(value));
}

/** ДД.ММ.ГГГГ ЧЧ:ММ — проверяющий читает даты, а не ISO-строки. */
export function formatMoment(iso: string | undefined): string {
  if (!iso) return EMPTY;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return escapeHtml(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${pad(
    d.getUTCHours()
  )}:${pad(d.getUTCMinutes())}`;
}

const IDENTITY_STATUS: Record<string, string> = {
  none: 'Не проходил',
  draft: 'Черновик',
  pending: 'На проверке',
  approved: 'Подтверждена',
  rejected: 'Отклонена'
};

const METHOD_LABEL: Record<string, string> = {
  selfie_passport: 'Селфи + паспорт',
  esia: 'Госуслуги (ЕСИА)'
};

function section(title: string, body: string): string {
  return `<section><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

function emptyNote(text: string): string {
  return `<p class="empty">${escapeHtml(text)}</p>`;
}

export function renderDossierHtml(dossier: LearnerDossier): string {
  const d = dossier;

  const identityRows = [
    ['Статус', IDENTITY_STATUS[d.identity.status] ?? d.identity.status],
    ['Способ', d.identity.method ? METHOD_LABEL[d.identity.method] : undefined],
    ['Подана', formatMoment(d.identity.submittedAt)],
    ['Решение принято', formatMoment(d.identity.reviewedAt)],
    ['Кем', d.identity.reviewedBy],
    ['Причина отклонения', d.identity.rejectionReason],
    // Про удалённые снимки говорим прямо: иначе проверяющий решит, что их не было.
    ['Снимки удалены по сроку хранения', formatMoment(d.identity.imagesPurgedAt)]
  ]
    .filter(([, value]) => value !== undefined)
    .map(([label, value]) => `<tr><th>${escapeHtml(label!)}</th><td>${cell(value)}</td></tr>`)
    .join('');

  const exams = d.exams.length
    ? `<table><thead><tr><th>Испытание</th><th>Начато</th><th>Длительность</th><th>Результат</th><th>Личность подтверждена</th></tr></thead><tbody>${d.exams
        .map(
          (e) =>
            `<tr><td>${cell(e.testTitle)}</td><td>${formatMoment(e.startedAt)}</td><td>${
              e.durationMinutes === undefined ? 'не завершено' : `${e.durationMinutes} мин`
            }</td><td>${
              e.passed === undefined
                ? EMPTY
                : `${e.passed ? 'сдан' : 'не сдан'}${
                    e.score === undefined ? '' : ` (${e.score}/${cell(e.maxScore)})`
                  }`
            }</td><td>${formatMoment(e.identityVerifiedAt)}</td></tr>`
        )
        .join('')}</tbody></table>`
    : emptyNote('Экзаменационных сессий нет');

  const documents = d.documents.length
    ? `<table><thead><tr><th>Документ</th><th>Номер</th><th>Дата</th><th>Статус</th></tr></thead><tbody>${d.documents
        .map(
          (doc) =>
            `<tr><td>${cell(doc.documentType)}</td><td>${cell(doc.documentNumber)}</td><td>${cell(
              doc.documentDate
            )}</td><td>${cell(doc.status)}${
              // Отзыв показываем рядом со статусом: скрыть его значило бы выдать
              // недействующий документ за действующий.
              doc.revokedAt ? ` (отозван ${formatMoment(doc.revokedAt)})` : ''
            }</td></tr>`
        )
        .join('')}</tbody></table>`
    : emptyNote('Документы не выдавались');

  const signed = d.unavailableSections.includes('signedActions')
    ? // Непрочитанный раздел НЕЛЬЗЯ показывать пустым: «подписей не было» и «мы не
      // смогли их прочитать» — разные утверждения, и в доказательном документе
      // подменять одно другим недопустимо.
      `<p class="warn">Раздел недоступен: не удалось прочитать журнал подписей. Отсутствие записей ниже НЕ означает, что подписанных действий не было.</p>`
    : d.signedActions.length
      ? `<table><thead><tr><th>Когда</th><th>Действие</th><th>Чем подписано</th><th>Адрес</th></tr></thead><tbody>${d.signedActions
          .map(
            (a) =>
              `<tr><td>${formatMoment(a.at)}</td><td>${cell(a.description)}</td><td>${cell(
                a.signedWith
              )}</td><td>${cell(a.ip)}</td></tr>`
          )
          .join('')}</tbody></table>`
      : emptyNote('Подписанных действий нет');

  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Личное дело — ${escapeHtml(
    d.learner.fullName
  )}</title>
<style>
  body { font-family: DejaVu Sans, Arial, sans-serif; font-size: 11pt; color: #111; margin: 24px; }
  h1 { font-size: 16pt; margin: 0 0 4px; }
  h2 { font-size: 12pt; margin: 20px 0 6px; border-bottom: 1px solid #999; padding-bottom: 2px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #bbb; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #f2f2f2; font-weight: 600; }
  .meta { color: #555; font-size: 9pt; margin: 0 0 12px; }
  .empty { color: #666; font-style: italic; }
  .warn { border: 1px solid #b00; padding: 6px; color: #b00; }
</style></head>
<body>
<h1>Личное дело слушателя</h1>
<p class="meta">${escapeHtml(d.learner.fullName)}${
    d.learner.snils ? ` · СНИЛС ${escapeHtml(d.learner.snils)}` : ''
  }${d.learner.dateOfBirth ? ` · д.р. ${escapeHtml(d.learner.dateOfBirth)}` : ''}<br>
Сформировано ${formatMoment(d.generatedAt)}</p>
${section('Подтверждение личности', `<table><tbody>${identityRows}</tbody></table>`)}
${section('Экзаменационные сессии', exams)}
${section('Выданные документы', documents)}
${section('Подписанные действия', signed)}
</body></html>`;
}
