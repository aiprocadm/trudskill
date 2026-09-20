import { Inject, Injectable, Logger } from '@nestjs/common';

import { type DigestItem, digestDedupKey, digestLetter, groupForDigest } from './daily-digest.js';
import { maskEmail } from '../../../common/logging/mask-pii.js';
import {
  EMAIL_DELIVERIES_REPOSITORY,
  type EmailDeliveriesRepository
} from '../../communication/email-deliveries.repository.js';
import { NotificationDispatcher } from '../../communication/notification-dispatcher.service.js';

import type { EmailTemplateKey } from '../../communication/email-templates.js';

/**
 * Копилка напоминаний: не более одного письма в день на человека
 * (ТЗ «Стабилизация, UX и развитие», 11.3, решение Р11).
 *
 * **Что было (журнал 601).** Четыре сканера ночного обхода слали письма каждый сам по себе. У
 * слушателя, у которого в один день подходят срок обучения и повторная проверка, в почте
 * оказывались два письма; у администратора центра, получающего копии по всем слушателям, — по
 * письму на каждого. Человек, получивший пять писем подряд, перестаёт читать их все — включая
 * то единственное, где написано про его собственный срок.
 *
 * **Устройство.** Сканеры больше не отправляют, а КЛАДУТ повод сюда. В конце обхода центра
 * `flush` раскладывает накопленное по людям и отправляет:
 *
 * - один повод — прежнее письмо со своим текстом, написанным под этот повод;
 * - два и больше — одно объединённое, со списком сроков по возрастанию.
 *
 * **Главная ловушка объединения — потеря отметок.** Подавление повторов работает по журналу
 * отправок: у каждого повода свой ключ, и именно он не даёт порогу сработать дважды. Если при
 * объединении записать только факт «объединённое письмо ушло», то завтра те же пороги сработают
 * снова, и человек будет получать одно и то же каждый день до самого срока. Поэтому отметка
 * каждого повода записывается отдельно — со ссылкой на то, что доставлен он был внутри общего
 * письма.
 */
export interface QueuedReminder {
  templateKey: EmailTemplateKey;
  /** Переменные для ОДИНОЧНОГО письма — когда повод у человека один. */
  variables: Record<string, string>;
  relatedEntityType?: string;
  relatedEntityId?: string;
  digest: DigestItem;
  /** Идентификатор человека в системе, если он есть: нужен для уведомления в кабинете. */
  userId?: string | undefined;
}

export interface FlushSummary {
  /** Сколько писем ушло на самом деле. */
  lettersSent: number;
  /** Сколько поводов в них уместилось. */
  reasonsCovered: number;
}

@Injectable()
export class ReminderOutbox {
  private readonly logger = new Logger(ReminderOutbox.name);
  private readonly queued = new Map<string, QueuedReminder[]>();

  constructor(
    @Inject(NotificationDispatcher) private readonly dispatcher: NotificationDispatcher,
    @Inject(EMAIL_DELIVERIES_REPOSITORY) private readonly deliveries: EmailDeliveriesRepository
  ) {}

  /** Положить повод. Ничего не отправляет — отправка в конце обхода. */
  queue(tenantId: string, reminder: QueuedReminder): void {
    const list = this.queued.get(tenantId) ?? [];
    list.push(reminder);
    this.queued.set(tenantId, list);
  }

  /** Сколько поводов накопилось у центра. Для сводки сканеров и проверок. */
  pending(tenantId: string): number {
    return this.queued.get(tenantId)?.length ?? 0;
  }

  /**
   * Отправить накопленное и очистить копилку.
   *
   * `day` — «сегодня» по календарю ЦЕНТРА: ключ подавления повтора объединённого письма
   * строится по дню, и одна дата на всех сдвигала бы границу суток у центров за Уралом (та же
   * причина, что у самих порогов, журнал 301).
   */
  async flush(tenantId: string, day: string): Promise<FlushSummary> {
    const items = this.queued.get(tenantId) ?? [];
    this.queued.delete(tenantId);
    if (items.length === 0) return { lettersSent: 0, reasonsCovered: 0 };

    const byKey = new Map<string, QueuedReminder>();
    for (const item of items)
      byKey.set(`${item.digest.email.toLowerCase()}::${item.digest.dedupKey}`, item);

    let lettersSent = 0;
    let reasonsCovered = 0;

    for (const group of groupForDigest(items.map((item) => item.digest))) {
      const first = byKey.get(`${group.email.toLowerCase()}::${group.items[0]!.dedupKey}`);
      try {
        if (group.items.length === 1 && first) {
          /*
           * Один повод — прежнее письмо. У каждого повода свой текст, написанный под него;
           * заворачивать одинокий повод в список из одного пункта значит ухудшить самый
           * частый случай ради редкого.
           */
          const summary = await this.dispatcher.dispatch({
            tenantId,
            templateKey: first.templateKey,
            recipients: [
              {
                email: group.email,
                kind: group.recipientKind,
                ...(group.recipientName ? { name: group.recipientName } : {}),
                ...(first.userId ? { userId: first.userId } : {})
              }
            ],
            variables: first.variables,
            ...(first.relatedEntityType ? { relatedEntityType: first.relatedEntityType } : {}),
            ...(first.relatedEntityId ? { relatedEntityId: first.relatedEntityId } : {}),
            dedupKey: group.items[0]!.dedupKey
          });
          lettersSent += summary.sent;
          reasonsCovered += summary.sent > 0 ? 1 : 0;
          continue;
        }

        const letter = digestLetter(group);
        const summary = await this.dispatcher.dispatch({
          tenantId,
          templateKey: 'reminder_digest',
          recipients: [
            {
              email: group.email,
              kind: group.recipientKind,
              ...(group.recipientName ? { name: group.recipientName } : {}),
              ...(first?.userId ? { userId: first.userId } : {})
            }
          ],
          variables: { lines: letter.body, count: String(letter.count) },
          dedupKey: digestDedupKey(group.email, day)
        });
        lettersSent += summary.sent;
        if (summary.sent > 0) {
          reasonsCovered += group.items.length;
          await this.markReasonsDelivered(tenantId, group.email, group.recipientKind, group.items);
        }
      } catch (err) {
        /*
         * Адрес в журнале приложения — маскированный: журналы читают шире, чем базу, и они
         * попадают в выгрузки и обращения в поддержку (сторож `pii-in-logs`).
         */
        this.logger.error(
          `Failed to send reminders to ${maskEmail(group.email)}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }

    return { lettersSent, reasonsCovered };
  }

  /**
   * Отметить каждый повод доставленным.
   *
   * Без этого объединение ЛОМАЕТ подавление повторов: у поводов не остаётся своих отметок, и
   * завтра те же пороги сработают снова. Строка в журнале честно говорит, что повод доехал
   * внутри общего письма, — так и диагностика «человек не получил письмо» остаётся рабочей.
   */
  private async markReasonsDelivered(
    tenantId: string,
    email: string,
    recipientKind: DigestItem['recipientKind'],
    items: readonly DigestItem[]
  ): Promise<void> {
    for (const item of items) {
      try {
        await this.deliveries.record({
          tenantId,
          templateKey: 'reminder_digest',
          recipientEmail: email,
          recipientKind,
          subject: `В составе общего письма: ${item.reasonTitle}`,
          status: 'sent',
          dedupKey: item.dedupKey
        });
      } catch (err) {
        /*
         * Отметка не записалась — повод придёт ещё раз завтра. Это неприятно, но несравнимо
         * лучше, чем уронить весь обход: остальные люди своих писем не получили бы вовсе.
         */
        this.logger.warn(
          `Failed to record digest reason ${item.dedupKey}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }
  }
}
