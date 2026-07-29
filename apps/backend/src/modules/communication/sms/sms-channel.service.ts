import { Inject, Injectable, Logger } from '@nestjs/common';

import { SmsProviderSettingsService } from './sms-provider-settings.service.js';
import { backendEnv } from '../../../env.js';
import { normalizePhone } from '../../../infrastructure/sms-provider/phone.util.js';
import {
  NoopSmsProvider,
  SMS_PROVIDER_REGISTRY,
  type SmsProvider,
  type SmsProviderRegistry
} from '../../../infrastructure/sms-provider/sms.provider.js';

/**
 * Второй канал доставки (ФТ-C1.3, Фаза 3 Task 5).
 *
 * Ключевое свойство — он НИКОГДА не бросает и никогда не мешает первому каналу. СМС здесь
 * дублирует то же самое письмо с той же самой ссылкой; если оператор молчит, слушатель
 * всё равно получает доступ по почте. Обратное недопустимо: сломанный СМС-шлюз не должен
 * закрывать людям экзамен.
 *
 * Форма конструктора — точная копия `WebinarProviderResolver`: явные `@Inject` на все
 * зависимости из контейнера (иначе структурный страж `di-explicit-injection.test.ts`
 * справедливо ругается — без метаданных типов Nest не найдёт их сам) и примитив со
 * значением по умолчанию последним. Сам класс регистрируется фабрикой: примитивный
 * параметр Nest иначе ищет в контейнере как `String` и падает на старте собранного кода.
 */
@Injectable()
export class SmsChannelService {
  private readonly logger = new Logger(SmsChannelService.name);
  private readonly noop = new NoopSmsProvider();

  constructor(
    @Inject(SMS_PROVIDER_REGISTRY) private readonly registry: SmsProviderRegistry,
    @Inject(SmsProviderSettingsService)
    private readonly settings: SmsProviderSettingsService,
    // Переопределяется в тестах; по умолчанию — реальный env на момент сборки DI.
    private readonly nodeEnv: string = backendEnv.NODE_ENV
  ) {}

  /** Активный провайдер тенанта; `noop`, если канал выключен или не настроен. */
  async providerForTenant(tenantId: string): Promise<SmsProvider> {
    const cfg = await this.settings.get(tenantId);
    if (!cfg.enabled || cfg.providerCode === 'noop') return this.noop;
    if (cfg.providerCode === 'fake' && this.nodeEnv === 'production') {
      // Прод-предохранитель, как у видео: схема env этого поймать не может — она не знает,
      // какой провайдер выбран у конкретного тенанта. Выдать несуществующую доставку за
      // настоящую хуже, чем не отправить: слушатель будет ждать сообщение, которого нет.
      this.logger.warn(
        `tenant ${tenantId} has sms provider=fake in production — forcing Noop (fake is staging-only)`
      );
      return this.noop;
    }
    return this.registry.get(cfg.providerCode) ?? this.noop;
  }

  /**
   * Отправляет сообщение вторым каналом. `false` = не отправлено по любой причине
   * (канал выключен, номера нет, номер мусорный, оператор отказал) — вызывающий код
   * продолжает работать как раньше.
   */
  async send(tenantId: string, rawPhone: string | undefined, text: string): Promise<boolean> {
    const to = normalizePhone(rawPhone);
    if (!to || !text) return false;

    try {
      const provider = await this.providerForTenant(tenantId);
      if (provider.code === 'noop') return false;

      const cfg = await this.settings.get(tenantId);
      const result = await provider.send({
        tenantId,
        to,
        text,
        ...(cfg.senderName ? { senderName: cfg.senderName } : {})
      });
      return result !== null;
    } catch (err) {
      // Номер в лог не пишем — это ПДн (redaction.util.ts прячет phone по той же причине).
      this.logger.error(
        `SMS send failed for tenant ${tenantId}: ${err instanceof Error ? err.message : String(err)}`
      );
      return false;
    }
  }
}
