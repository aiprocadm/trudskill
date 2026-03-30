export interface TestApp {
  close: () => Promise<void>;
}

export const bootstrapTestApp = async (): Promise<TestApp> => ({
  close: async () => undefined
});

export const cleanupTestDatabase = async (): Promise<void> => undefined;

export const apiClient = (baseUrl: string) => ({
  get: async (path: string, headers?: Record<string, string>) =>
    fetch(`${baseUrl}${path}`, headers ? { method: 'GET', headers } : { method: 'GET' })
});

export const buildJsonRequest = (body: unknown, headers: Record<string, string> = {}) => ({
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body)
});
