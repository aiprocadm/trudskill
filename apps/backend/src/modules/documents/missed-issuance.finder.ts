/**
 * Ревизия 2026-08-27 (порция 37, журнал 273) — поиск невыпущенных документов.
 *
 * **Зачем.** Выпуск документов при завершении обучения держится на событии ВНУТРИ процесса:
 * зачисление переводится в «завершено», событие уходит слушателю, тот выпускает. Если
 * процесс в этот момент перезапустили (выкатка, сбой, нехватка памяти), событие исчезает
 * вместе с ним — повторять его некому. Слушатель ждёт удостоверение, администратор уверен,
 * что оно выдано, и узнают об этом в худший момент: на проверке.
 *
 * Механизм надёжной доставки (`core.outbox_events`) в проекте построен целиком — таблица,
 * рассыльщик, метрика в состоянии здоровья, — но в него НЕ ПИШЕТ НИКТО. Подключать его
 * ради одного случая значило бы переносить весь выпуск в очередь: другая архитектура,
 * отдельная работа. Здесь — дешёвая и честная страховка: раз в час ищем завершённые
 * зачисления, по которым обязательный документ так и не выпущен, и повторяем выпуск.
 * Повтор безопасен: выпуск уже идемпотентен (durable-dedup), поэтому «лишний» прогон
 * ничего не задваивает.
 */

/** Завершённое зачисление и то, что по нему ДОЛЖНО быть выпущено. */
export interface CompletedEnrollmentView {
  enrollmentId: string;
  /** Виды документов из набора курса с автовыпуском (`templateId`). */
  autoIssueTemplateIds: string[];
  /** Момент завершения — ISO. Свежие пропускаем: выпуск ещё может идти прямо сейчас. */
  completedAt?: string;
}

/** Уже выпущенный документ: по какому зачислению и по какому бланку. */
export interface IssuedDocumentView {
  sourceEntityType: string;
  sourceEntityId?: string;
  templateId?: string;
}

export interface FindMissedIssuanceInput {
  completed: CompletedEnrollmentView[];
  issued: IssuedDocumentView[];
  /** «Сейчас» в миллисекундах — передаётся снаружи, чтобы тест не зависел от календаря. */
  nowMs: number;
  /** Сколько ждать, прежде чем считать выпуск потерянным. */
  graceMs: number;
}

/**
 * Зачисления, по которым обязательный документ не выпущен и ждать больше нечего.
 *
 * Свежие завершения не трогаем: выпуск асинхронный, и через секунду после завершения
 * «пропуск» — это норма, а не потеря. Ошибиться в эту сторону дороже: повторный выпуск
 * идемпотентен, но лишняя работа на каждом прогоне никому не нужна.
 */
export function findMissedIssuance(input: FindMissedIssuanceInput): string[] {
  const issuedByEnrollment = new Map<string, Set<string>>();
  for (const document of input.issued) {
    if (document.sourceEntityType !== 'enrollment' || !document.sourceEntityId) continue;
    const templates = issuedByEnrollment.get(document.sourceEntityId) ?? new Set<string>();
    if (document.templateId) templates.add(document.templateId);
    issuedByEnrollment.set(document.sourceEntityId, templates);
  }

  const missed: string[] = [];
  for (const enrollment of input.completed) {
    if (enrollment.autoIssueTemplateIds.length === 0) continue;
    const completedAtMs = enrollment.completedAt ? Date.parse(enrollment.completedAt) : NaN;
    // Без даты завершения судить не берёмся: она нужна, чтобы отличить «ещё выпускается»
    // от «потерялось», а гадать на юридически значимом документе нельзя.
    if (!Number.isFinite(completedAtMs)) continue;
    if (input.nowMs - completedAtMs < input.graceMs) continue;

    const issuedTemplates = issuedByEnrollment.get(enrollment.enrollmentId);
    const allIssued = enrollment.autoIssueTemplateIds.every((templateId) =>
      issuedTemplates?.has(templateId)
    );
    if (!allIssued) missed.push(enrollment.enrollmentId);
  }
  return missed;
}
