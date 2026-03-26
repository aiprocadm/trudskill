import { workerEnv } from './env.js';

console.log(
  `Worker bootstrap complete. Concurrency=${workerEnv.WORKER_CONCURRENCY}. Queue=${workerEnv.DOCUMENT_GENERATION_QUEUE}. RabbitMQ=${workerEnv.RABBITMQ_URL}`
);
