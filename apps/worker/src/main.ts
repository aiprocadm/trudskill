import { workerEnv } from './env.js';

console.log(
  `Worker bootstrap complete. Concurrency=${workerEnv.WORKER_CONCURRENCY}. RabbitMQ=${workerEnv.RABBITMQ_URL}`
);
