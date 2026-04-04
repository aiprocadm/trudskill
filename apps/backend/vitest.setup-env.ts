/**
 * Гарантирует валидный process.env до импорта модулей, тянущих `env.ts` (иначе Zod parse на этапе collect).
 */
const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/postgres',
  REDIS_URL: 'redis://127.0.0.1:6379',
  RABBITMQ_URL: 'amqp://guest:guest@127.0.0.1:5672',
  S3_ENDPOINT: 'http://127.0.0.1:9000',
  S3_ACCESS_KEY: 'test',
  S3_SECRET_KEY: 'test',
  S3_BUCKET: 'test',
  AUTH_JWT_SECRET: 'test-jwt-secret-min-10-chars',
  SESSION_SECRET: 'test-session-secret-min-10',
  CORS_ORIGIN: 'http://127.0.0.1:3000',
  PUBLIC_BASE_URL: 'http://127.0.0.1:3000',
  REALTIME_PUBLIC_URL: 'http://127.0.0.1:3002',
  REALTIME_PUBLISH_KEY: 'test-realtime-publish-key'
};

for (const [key, value] of Object.entries(defaults)) {
  if (process.env[key] === undefined || process.env[key] === '') {
    process.env[key] = value;
  }
}
