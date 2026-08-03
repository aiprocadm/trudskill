import 'reflect-metadata';
import { describe, expect, it } from 'vitest';

// Регресс на класс поломок «модуль объявил провайдера, но не импортировал модуль
// его зависимостей»: юнит-тесты собирают игрушечные модули, поэтому реальный граф
// AppModule до этого теста не собирал никто — дефект всплывал только на живом
// запуске (падение старта стенда 2026-08-03: LegalLogWriter в EsignModule без
// InfrastructureModule). Test.compile() строит весь граф зависимостей и зовёт
// конструкторы, но НЕ lifecycle-хуки — внешние подключения (БД/Redis/RabbitMQ)
// не устанавливаются, поэтому тесту достаточно фиктивных адресов в env.

const requiredEnv: Record<string, string> = {
  NODE_ENV: 'test',
  BACKEND_PORT: '3001',
  API_PREFIX: '/api/v1',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/postgres',
  REDIS_URL: 'redis://localhost:6379',
  RABBITMQ_URL: 'amqp://guest:guest@localhost:5672',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_ACCESS_KEY: 'minio',
  S3_SECRET_KEY: 'minio123',
  S3_BUCKET: 'test',
  AUTH_JWT_SECRET: 'secret_value_123',
  SESSION_SECRET: 'session_secret_123',
  CORS_ORIGIN: 'http://localhost:3000',
  PUBLIC_BASE_URL: 'http://localhost:3000',
  REALTIME_PUBLIC_URL: 'ws://localhost:3000',
  REALTIME_PUBLISH_KEY: 'test-realtime-publish-key',
  DB_MIGRATIONS_ENABLED: 'false',
  ALLOW_IN_MEMORY_STATE: 'true'
};

for (const [key, value] of Object.entries(requiredEnv)) {
  process.env[key] = value;
}

describe('AppModule DI graph', () => {
  it('собирается целиком: каждый провайдер получает свои зависимости', async () => {
    const [{ Test }, { AppModule }] = await Promise.all([
      import('@nestjs/testing'),
      import('./app.module.js')
    ]);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    expect(moduleRef).toBeDefined();
    // close() без init(): хуки onModuleDestroy зовутся у неинициализированных
    // сервисов — их обёртки обязаны это переживать, но тест валить не должны.
    await moduleRef.close().catch(() => undefined);
  }, 60_000);
});
