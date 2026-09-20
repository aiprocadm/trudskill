import { Inject, Injectable, Optional } from '@nestjs/common';

import { brandedLetter } from './email-branding.js';
import { EMAIL_DELIVERIES_REPOSITORY, type RecipientKind } from './email-deliveries.repository.js';
import {
  EMAIL_TEMPLATE_DEFAULTS,
  type EmailTemplateKey,
  renderTemplate
} from './email-templates.js';
import { EMAIL_TEMPLATES_REPOSITORY } from './email-templates.repository.js';
import { NotificationsService } from './notifications.service.js';
import { TelegramChannelService } from './telegram/telegram-channel.service.js';
import { toPushNotification } from './web-push/template-push-mapping.js';
import { WEB_PUSH_SENDER } from './web-push/web-push-sender.js';
import { MAILER } from '../../infrastructure/mailer/mailer.service.js';
import { type TenantBranding, resolveTenantDisplayName } from '../tenant/tenant-branding.js';
import { TenantService } from '../tenant/tenant.service.js';

import type { EmailDeliveriesRepository } from './email-deliveries.repository.js';
import type { EmailTemplatesRepository } from './email-templates.repository.js';
import type { WebPushSenderPort } from './web-push/web-push-sender.js';
import type { MailerService } from '../../infrastructure/mailer/mailer.service.js';

export interface DispatchRecipient {
  email: string;
  name?: string;
  kind: RecipientKind;
  /**
   * Phase 10 Track C — IAM userId получателя (если известен). Используется только для
   * web-push фан-аута; email-доставка не зависит от него. Внешние/неизвестные получатели
   * (без userId) получают только email.
   */
  userId?: string;
}

export interface DispatchInput {
  tenantId: string;
  templateKey: EmailTemplateKey;
  recipients: DispatchRecipient[];
  variables: Record<string, string>;
  relatedEntityType?: string;
  relatedEntityId?: string;
  /** Phase 5B-2 — send-once key; when a delivery with this key exists, the dispatch is skipped. */
  dedupKey?: string;
}

/** Каноничный ключ адреса для дедупликации: без учёта регистра и краевых пробелов. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface DispatchSummary {
  /** Recipients successfully sent (or skipped_noop) this dispatch. */
  sent: number;
  /** Recipients skipped because already delivered under this dedupKey. */
  skipped: number;
  /** Recipients whose send failed this dispatch. */
  failed: number;
}

@Injectable()
export class NotificationDispatcher {
  constructor(
    @Inject(MAILER) private readonly mailer: MailerService,
    @Inject(EMAIL_TEMPLATES_REPOSITORY) private readonly templates: EmailTemplatesRepository,
    @Inject(EMAIL_DELIVERIES_REPOSITORY) private readonly deliveries: EmailDeliveriesRepository,
    @Inject(WEB_PUSH_SENDER) private readonly pushSender: WebPushSenderPort,
    // ФТ-D3.1: подпись бренда. @Optional — существующие тесты собирают диспетчер
    // четырьмя аргументами; без сервиса подпись падает к нейтральной.
    @Optional() @Inject(TenantService) private readonly tenantService?: TenantService,
    /*
     * ТЗ 11.1: колокольчик «Уведомления» внутри системы. Необязательная зависимость —
     * ровно как остальные каналы: без неё письмо всё равно уходит.
     */
    @Optional()
    @Inject(NotificationsService)
    private readonly notifications?: NotificationsService,
    /*
     * ФТ-F3: третий канал. `@Optional` по той же причине, что и подпись бренда, — существующие
     * тесты собирают диспетчер меньшим числом аргументов; без канала рассылка работает как
     * раньше, просто без мессенджера.
     */
    @Optional()
    @Inject(TelegramChannelService)
    private readonly telegram?: TelegramChannelService
  ) {}

  /**
   * Имя центра для подписи письма: бренд → название тенанта → нейтральное.
   * Любой сбой чтения — нейтральная подпись: письмо важнее витрины, и
   * renderTemplate превратил бы незаполненную переменную в пустоту
   * («С уважением, .»), поэтому значение подставляется ВСЕГДА.
   */
  private async resolveTenantSignature(tenantId: string): Promise<string> {
    return (await this.resolveTenantIdentity(tenantId)).name;
  }

  /**
   * Имя центра И его бренд одним чтением (ТЗ 11.2 пункт 2, 13.3 / Р14).
   *
   * Раньше бренд читался и ВЫБРАСЫВАЛСЯ: из него брали только название для подписи. Между
   * тем в нём лежат логотип и фирменный цвет, ради которых центр и платит за аренду. Читать
   * его второй раз ради оформления значило бы ходить в настройки дважды на каждое письмо.
   */
  private async resolveTenantIdentity(
    tenantId: string
  ): Promise<{ name: string; branding: TenantBranding }> {
    if (!this.tenantService) return { name: 'учебный центр', branding: {} };
    /*
     * ПИСЬМО ВАЖНЕЕ ВИТРИНЫ. Любая беда с чтением бренда — нейтральная подпись и оформление
     * по умолчанию, но письмо уходит. Обёрнут весь вызов целиком, а не только его отказ:
     * служба настроек может быть не поднята вовсе (внутренние прогоны, память), и тогда
     * падает само обращение к методу, а не возвращаемое им обещание.
     */
    try {
      const [tenant, branding] = await Promise.all([
        Promise.resolve(this.tenantService.getTenantById(tenantId)).catch(() => null),
        Promise.resolve(this.tenantService.getBranding(tenantId)).catch(
          () => ({}) as TenantBranding
        )
      ]);
      return { name: resolveTenantDisplayName(branding, tenant?.name ?? null), branding };
    } catch {
      return { name: 'учебный центр', branding: {} };
    }
  }

  /**
   * Per-recipient idempotency + throw-safety: each `mailer.send` is wrapped in try/catch, so a
   * mailer throw is caught per-recipient and recorded as a `failed` delivery row while the loop
   * continues. `dispatch` itself never rejects due to a send failure — only a push-sender error
   * propagates (push runs after the email loop). On retry, recipients with a prior non-failed row
   * under the same `dedupKey` are skipped; failed/never-attempted ones are (re)sent.
   *
   * Returns a per-dispatch summary `{ sent, skipped, failed }` reflecting only the actions taken
   * in this call — callers accumulate `summary.sent` rather than `recipients.length` to avoid
   * overcounting on retry runs where some recipients are dedup-skipped.
   */
  async dispatch(input: DispatchInput): Promise<DispatchSummary> {
    // Build the set of already-succeeded recipients for this dedupKey (per-recipient idempotency).
    const alreadyDelivered = new Set<string>();
    if (input.dedupKey) {
      const prior = await this.deliveries.listByDedupKey(input.tenantId, input.dedupKey);
      for (const row of prior) {
        if (row.status !== 'failed') {
          alreadyDelivered.add(normalizeEmail(row.recipientEmail));
        }
      }
    }

    const override = await this.templates.getOverride(input.tenantId, input.templateKey);
    const base = override ?? EMAIL_TEMPLATE_DEFAULTS[input.templateKey];
    const identity = await this.resolveTenantIdentity(input.tenantId);
    // Явно переданный tenantName уважается — диспетчер лишь гарантирует дефолт.
    const variables =
      'tenantName' in input.variables
        ? input.variables
        : { ...input.variables, tenantName: identity.name };
    const rendered = renderTemplate(base, variables);
    /*
     * Оформленная часть (ТЗ 11.2 пункт 2): логотип и цвет центра. Собирается из того же
     * текста, что и простая часть, — держать шаблоны в двух видах нельзя, они разойдутся при
     * первой же правке.
     */
    const html = brandedLetter({
      subject: rendered.subject,
      body: rendered.body,
      branding: identity.branding,
      tenantName: identity.name
    });

    const sent: DispatchRecipient[] = [];
    let skipped = 0;
    let failed = 0;

    // Дедуп В ПРЕДЕЛАХ одного вызова: один и тот же адрес может встретиться дважды в одном
    // recipients[] (напр. staff-получатель совпал с employer contactEmail). Кросс-run `dedupKey`
    // тут не спасает — оба отправления происходят до записи строк этого run'а. Нормализуем адрес
    // по регистру/пробелам, чтобы `Learner@x` и `learner@x` считались одним получателем.
    const seenThisRun = new Set<string>();
    for (const recipient of input.recipients) {
      const dedupEmail = normalizeEmail(recipient.email);
      if (alreadyDelivered.has(dedupEmail) || seenThisRun.has(dedupEmail)) {
        skipped++;
        continue;
      }
      seenThisRun.add(dedupEmail);

      let result: Awaited<ReturnType<MailerService['send']>>;
      try {
        result = await this.mailer.send({
          to: recipient.email,
          subject: rendered.subject,
          body: rendered.body,
          html,
          /*
           * ТЗ 13.3 (Р14): имя отправителя — название центра. Раньше оно сюда НЕ доезжало:
           * рассыльщик знал название (подставлял его в подпись письма), но почтовику не
           * передавал — и все письма-уведомления уходили от имени платформы. Работало только
           * письмо со ссылкой для входа, где название передают вручную (журнал 598).
           */
          tenantName: identity.name,
          templateKey: input.templateKey
        });
      } catch (error) {
        result = {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error)
        };
      }

      await this.deliveries.record({
        tenantId: input.tenantId,
        templateKey: input.templateKey,
        recipientEmail: recipient.email,
        recipientKind: recipient.kind,
        subject: rendered.subject,
        // Фаза 6 Task 8: сохраняем тело КАК ОТПРАВЛЕНО — иначе повторная отправка
        // пересобрала бы письмо из сегодняшних данных и ушло бы ДРУГОЕ письмо.
        body: rendered.body,
        status: result.status,
        ...(result.providerMessageId ? { providerMessageId: result.providerMessageId } : {}),
        ...(result.error ? { error: result.error } : {}),
        ...(input.relatedEntityType ? { relatedEntityType: input.relatedEntityType } : {}),
        ...(input.relatedEntityId ? { relatedEntityId: input.relatedEntityId } : {}),
        ...(input.dedupKey ? { dedupKey: input.dedupKey } : {})
      });

      if (result.status !== 'failed') {
        sent.push(recipient);
      } else {
        failed++;
      }
    }

    // Phase 10 Track C — web-push fan-out, alongside email. Recipients with a known IAM
    // userId get a push to their subscribed browsers; the NoopWebPushSender (default,
    // WEB_PUSH_ENABLED=false) makes this a no-op so email behaviour is byte-for-byte unchanged.
    // Push is OUTSIDE the try/catch so a push failure still propagates (existing test expectation).
    const userIds = sent.map((r) => r.userId).filter((id): id is string => Boolean(id));
    if (userIds.length > 0) {
      await this.pushSender.sendToUsers(input.tenantId, userIds, toPushNotification(rendered));
    }

    /*
     * ТЗ 11.1: то же событие — в колокольчик «Уведомления» внутри системы.
     *
     * **Как было.** Раздел «Уведомления» существовал, и у слушателя это ОДИН ИЗ ПЯТИ пунктов
     * меню (задача 6.1), но класть в него события было некому: единственным, кто создавал
     * записи, был чат. Человек, у которого истекает срок обучения, видел в разделе пустоту —
     * а письмо мог не получить или не заметить (журнал 509).
     *
     * Отказ колокольчика не должен ронять рассылку: письмо уже ушло, и повторять его
     * из-за второстепенного канала нельзя — человек получил бы дубль.
     */
    if (this.notifications) {
      for (const recipient of sent) {
        try {
          await this.notifications.create({
            tenantId: input.tenantId,
            channelCode: 'in_app',
            subjectText: rendered.subject,
            bodyText: rendered.body,
            ...(recipient.userId ? { recipientUserId: recipient.userId } : {}),
            ...(input.relatedEntityType ? { relatedEntityType: input.relatedEntityType } : {}),
            ...(input.relatedEntityId ? { relatedEntityId: input.relatedEntityId } : {})
          });
        } catch {
          /* Канал второстепенный: письмо уже доставлено, повторять рассылку нельзя. */
        }
      }
    }

    /*
     * ФТ-F3 — то же уведомление в мессенджер, кому он привязан. Канал ТРЕТИЙ и по счёту, и
     * по важности: его отказы не влияют на итог рассылки (сам сервис не бросает), а
     * отправка идёт после письма — сначала обязательный канал, потом остальные.
     */
    if (this.telegram && userIds.length > 0) {
      const text = `${rendered.subject}\n\n${rendered.body}`;
      await Promise.all(userIds.map((id) => this.telegram!.notify(input.tenantId, id, text)));
    }

    return { sent: sent.length, skipped, failed };
  }
}
