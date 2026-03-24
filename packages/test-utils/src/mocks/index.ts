export const queueMock = () => ({ enqueue: async () => ({ jobId: crypto.randomUUID() }) });
export const fileStorageMock = () => ({ upload: async () => ({ fileId: crypto.randomUUID() }) });
export const websocketMock = () => ({ publish: async () => undefined });
export const asyncTaskMock = () => ({ run: async () => ({ status: 'succeeded' as const }) });
