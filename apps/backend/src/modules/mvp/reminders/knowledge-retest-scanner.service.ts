import { Inject, Injectable, Logger } from '@nestjs/common';

import { pickMilestone } from './milestone.util.js';
import { ReminderOutbox } from './reminder-outbox.service.js';
import { buildStaffRecipients } from './reminder-recipients.js';
import { ReminderSettingsService } from './reminder-settings.service.js';
import { learnerRecipient } from '../enrollment-recipient.js';
import { ExamOutcomeService } from '../exam/exam-outcome.service.js';

import type { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

export interface KnowledgeRetestScanSummary {
  /** Сколько поводов положено в копилку (ТЗ 11.3): отправка — в конце обхода. */
  remindersQueued: number;
}

/**
 * Напоминания о повторной проверке знаний (ТЗ «Стабилизация, UX и развитие», 11.3 + 10.4,
 * решения Р11 и Р9).
 *
 * **Что было (журнал 596).** Пороги «за 14, 7 и 3 дня до истечения 30-дневного срока» были
 * ОБЪЯВЛЕНЫ в настройках напоминаний и даже закреплены тестом — а слать их было некому:
 * сканера не существовало. Тест при этом проходил, потому что проверял ЧИСЛА, а не то, что
 * по ним кто-то работает. Классическое «построено и не подключено», и заметить его можно
 * было только пойдя от требования к коду, а не от кода к тесту.
 *
 * **Почему сроки берутся у службы итогов, а не считаются здесь.** Тридцать дней — требование
 * пункта 79 Порядка № 2464, и оно уже посчитано в `ExamOutcomeService.retakes` для экрана
 * слушателя и списка центра. Второй расчёт того же срока разошёлся бы с первым молча: письмо
 * говорило бы одну дату, экран — другую, и человек не знал бы, какой верить.
 *
 * **Получатели — слушатель И сотрудники центра.** По Порядку повторную проверку организует
 * центр: назначает дату, собирает комиссию. Письмо одному слушателю оставило бы центр в
 * неведении о том, что у него копится долг по срокам.
 */
@Injectable()
export class KnowledgeRetestScanner {
  private readonly logger = new Logger(KnowledgeRetestScanner.name);

  constructor(
    /* ТЗ 11.3: копилка вместо прямой отправки — одно письмо в день на человека. */
    @Inject(ReminderOutbox) private readonly outbox: ReminderOutbox,
    /* ТЗ 11.3: пороги задаёт центр; умолчания Р11 живут в `reminder-settings.ts`. */
    @Inject(ReminderSettingsService) private readonly settings: ReminderSettingsService,
    /* ТЗ 10.4: сроки повторной проверки считает служба итогов — здесь их не пересчитывают. */
    @Inject(ExamOutcomeService) private readonly outcomes: ExamOutcomeService
  ) {}

  async scanTenant(
    tenantId: string,
    asOf: string,
    state: InMemoryMvpState
  ): Promise<KnowledgeRetestScanSummary> {
    let remindersQueued = 0;
    const milestones = await this.settings.milestones(tenantId, 'knowledgeRetest');
    const tasks = await this.outcomes.retakes(tenantId);
    if (tasks.length === 0) return { remindersQueued };

    /* Копия сотрудникам одна на центр — считаем её один раз, как в соседних сканерах. */
    const staffRecipients = buildStaffRecipients(state, tenantId);

    for (const task of tasks) {
      const milestone = pickMilestone(asOf, task.dueAt, milestones);
      if (milestone === null) continue;

      /*
       * Получатель-слушатель собирается тем же правилом, что и во всех письмах центра: без
       * почты в карточке письма нет, а привязанная учётная запись даёт ещё и уведомление в
       * самом кабинете. Своя сборка здесь разошлась бы с остальными письмами молча.
       */
      const learnerRow = state.learners.find(
        (item) => item.tenantId === tenantId && item.id === task.learnerId
      );
      const resolved = learnerRecipient(learnerRow);
      const recipients = [
        ...(resolved
          ? [
              {
                email: resolved.email,
                name: resolved.name,
                kind: 'learner' as const,
                ...(resolved.userId ? { userId: resolved.userId } : {})
              }
            ]
          : []),
        ...staffRecipients
      ];
      if (recipients.length === 0) continue;

      /*
       * В ключ входит сама дата срока. Если центр перенесёт проверку или слушатель пересдаст
       * и снова не сдаст, срок станет другим — и напоминание сработает заново. Без даты в
       * ключе порог, отработавший по старому сроку, был бы подавлен навсегда: та же грабля,
       * что чинили у сроков обучения и лицензий (§5.150).
       */
      const dedupKey = `retest:${task.learnerId}:${task.testId}:${task.dueAt.slice(0, 10)}:${milestone}`;
      for (const recipient of recipients) {
        /*
         * ТЗ 11.3: письмо не отправляется здесь, а КЛАДЁТСЯ в копилку. В конце обхода центра
         * человек получит одно письмо на все поводы, а не по письму на каждый.
         */
        this.outbox.queue(tenantId, {
          templateKey: 'knowledge_retest',
          variables: {
            learnerName: resolved?.name ?? task.learnerName,
            courseTitle: task.testTitle,
            dueDate: task.dueAt.slice(0, 10),
            daysLeft: dayCount(task.daysLeft)
          },
          relatedEntityType: 'assessment.retake',
          relatedEntityId: `${task.learnerId}:${task.testId}`,
          ...('userId' in recipient && recipient.userId ? { userId: recipient.userId } : {}),
          digest: {
            email: recipient.email,
            recipientKind: recipient.kind,
            ...(recipient.name ? { recipientName: recipient.name } : {}),
            subjectName: resolved?.name ?? task.learnerName,
            reasonTitle: 'Повторная проверка знаний',
            about: task.testTitle,
            dueDate: task.dueAt.slice(0, 10),
            dedupKey
          }
        });
        remindersQueued += 1;
      }
    }

    return { remindersQueued };
  }
}

/**
 * «3 дня», «1 день», «сегодня последний день».
 *
 * Слово в письме, а не число: «Осталось 1» человек читает как обрывок, а «осталось 0 дней»
 * — как ошибку системы.
 */
export const dayCount = (daysLeft: number): string => {
  if (daysLeft <= 0) return 'сегодня последний день';
  const abs = daysLeft % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return `${daysLeft} дней`;
  if (last === 1) return `${daysLeft} день`;
  if (last >= 2 && last <= 4) return `${daysLeft} дня`;
  return `${daysLeft} дней`;
};
