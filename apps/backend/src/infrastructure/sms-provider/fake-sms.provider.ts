import type { SendSmsInput, SmsProvider, SmsSendResult } from './sms.provider.js';

/**
 * ТОЛЬКО для dev/staging и тестов. Ничего никуда не шлёт — складывает отправленное в
 * память, чтобы путь «выпустили токен → ушло вторым каналом» прогонялся без оператора
 * и без единой потраченной копейки. В production запрещён резолвером (`SmsProviderResolver`):
 * молча «доставить» СМС, которой не было, — худший вид отказа, слушатель будет ждать
 * сообщение, которого никогда не придёт.
 *
 * Идентификатор самопомечен префиксом `fake-sms:`, чтобы его нельзя было спутать с
 * настоящим идентификатором оператора при разборе инцидента.
 */
export class FakeSmsProvider implements SmsProvider {
  readonly code = 'fake' as const;

  /** Отправленное за время жизни процесса — читают тесты и dev-инструменты. */
  readonly sent: Array<SendSmsInput & { at: string }> = [];

  async send(input: SendSmsInput): Promise<SmsSendResult | null> {
    // Номер обязан быть нормализован ДО провайдера: оператор молча не доставит на мусор,
    // а мы посчитаем отправку успешной. Лучше честный отказ.
    if (!input.to.startsWith('+') || !input.text) return null;
    this.sent.push({ ...input, at: new Date().toISOString() });
    return {
      providerMessageId: `fake-sms:${this.sent.length}`,
      segments: Math.ceil(input.text.length / 70)
    };
  }
}
