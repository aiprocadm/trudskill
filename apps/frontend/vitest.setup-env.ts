const defaults: Record<string, string> = {
  NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:3001/api/v1',
  NEXT_PUBLIC_REALTIME_URL: 'http://127.0.0.1:3002',
  PUBLIC_BASE_URL: 'http://127.0.0.1:3000'
};

for (const [key, value] of Object.entries(defaults)) {
  if (process.env[key] === undefined || process.env[key] === '') {
    process.env[key] = value;
  }
}
