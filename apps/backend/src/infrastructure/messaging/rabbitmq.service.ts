import { Injectable, Logger } from '@nestjs/common';
import * as amqp from 'amqplib';

import { backendEnv } from '../../env.js';

import type { ChannelModel, ConfirmChannel } from 'amqplib';

/**
 * Публикация в очередь.
 *
 * ⚠️ Ревизия 2026-08-27 (порция 35, журнал 274) — три беды одного кэша.
 *
 * Соединение и канал кэшировались НАВСЕГДА и никогда не сбрасывались. После перезапуска
 * брокера (обновление, сбой) закэшированный канал оставался мёртвым до перезапуска самого
 * приложения: каждая публикация падала «Channel closed», и подтверждения оплат, письма и
 * задачи выпуска документов переставали уходить — до вмешательства человека.
 *
 * Хуже: соединение amqplib — это EventEmitter, а событие `error` никто не слушал. В Node
 * необработанное `error` на EventEmitter роняет ВЕСЬ процесс: сбой брокера превращался в
 * отказ бэкенда для всех — и администраторов, и слушателей.
 *
 * И третье: `ping` отвечал «связь есть», если канал просто лежал в поле, — то есть
 * проверка живости подтверждала кэш, а не связь.
 *
 * Теперь: обрыв слушается и сбрасывает кэш (следующая публикация поднимает связь заново),
 * а параллельные публикации ждут ОДНО подключение, а не открывают своё каждая.
 */
@Injectable()
export class RabbitMqService {
  private readonly logger = new Logger(RabbitMqService.name);
  private connection: ChannelModel | null = null;
  private channel: ConfirmChannel | null = null;
  /** Идущее подключение: параллельные публикации ждут его, а не плодят свои. */
  private connecting: Promise<ConfirmChannel> | null = null;

  async ping(): Promise<boolean> {
    try {
      await this.getChannel();
      return true;
    } catch {
      // Недоступность и ЕСТЬ ответ: проверка живости для того и вызывается.
      return false;
    }
  }

  async publish(
    exchange: string,
    routingKey: string,
    payload: unknown,
    options?: { requestId?: string; correlationId?: string; headers?: Record<string, string> }
  ): Promise<void> {
    const channel = await this.getChannel();
    await channel.assertExchange(exchange, 'topic', { durable: true });
    const enrichedPayload =
      payload && typeof payload === 'object'
        ? {
            ...(payload as Record<string, unknown>),
            request_id: options?.requestId,
            correlation_id: options?.correlationId
          }
        : payload;
    channel.publish(exchange, routingKey, Buffer.from(JSON.stringify(enrichedPayload)), {
      persistent: true,
      contentType: 'application/json',
      correlationId: options?.correlationId,
      headers: {
        ...(options?.headers ?? {}),
        'x-request-id': options?.requestId,
        'x-correlation-id': options?.correlationId
      }
    });
    await this.waitForConfirms(channel, 5_000);
  }

  private async getChannel(): Promise<ConfirmChannel> {
    if (this.channel) return this.channel;
    // Соединение живо, а канал закрылся — открываем новый канал на нём же.
    if (this.connection) return this.openChannelOn(this.connection);
    // Одно подключение на всех: без этого пачка одновременных публикаций открыла бы
    // по соединению каждая, и брокер получил бы всплеск подключений на ровном месте.
    this.connecting ??= this.openChannel().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private async openChannel(): Promise<ConfirmChannel> {
    const connection = await amqp.connect(backendEnv.RABBITMQ_URL);
    // Слушатели ставятся ДО первой публикации: необработанный `error` на EventEmitter
    // роняет процесс, поэтому подписка — не «улучшение», а условие безопасности.
    connection.on('error', (error: Error) => this.dropConnection(error));
    connection.on('close', () => this.dropConnection());

    this.connection = connection;
    const channel = await this.openChannelOn(connection);
    return channel;
  }

  private async openChannelOn(connection: ChannelModel): Promise<ConfirmChannel> {
    const channel = await connection.createConfirmChannel();
    channel.on('error', (error: Error) => this.dropChannel(error));
    channel.on('close', () => this.dropChannel());
    this.channel = channel;
    return channel;
  }

  /**
   * Умер КАНАЛ, соединение живо — забываем только канал.
   *
   * Сбрасывать заодно и соединение нельзя: ссылку мы бы потеряли, а само соединение
   * осталось бы открытым — на каждом сбое канала копился бы лишний коннект к брокеру.
   */
  private dropChannel(error?: Error): void {
    if (!this.channel) return;
    this.channel = null;
    this.logger.warn(
      `Канал очереди закрыт${error ? `: ${error.message}` : ''}. Откроем заново при отправке.`
    );
  }

  /**
   * Умерло СОЕДИНЕНИЕ — забываем всё. Само переподключение не запускаем: следующая
   * публикация поднимет связь сама, поэтому не нужен ни таймер повторов, ни его
   * остановка при выключении, а очередь всё равно ждёт следующего сообщения.
   */
  private dropConnection(error?: Error): void {
    if (!this.connection && !this.channel) return;
    this.connection = null;
    this.channel = null;
    this.logger.warn(
      `Связь с очередью потеряна${error ? `: ${error.message}` : ''}. Восстановим при отправке.`
    );
  }

  private async waitForConfirms(channel: ConfirmChannel, timeoutMs: number): Promise<void> {
    let timeoutHandle: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error(`RabbitMQ publish confirm timeout after ${timeoutMs}ms`)),
        timeoutMs
      );
    });

    try {
      await Promise.race([channel.waitForConfirms(), timeout]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }
}
