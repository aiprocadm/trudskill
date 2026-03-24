import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const requiredFiles = [
  'src/openapi/openapi.v1.json',
  'src/errors/contracts.ts',
  'src/meta/contracts.ts',
  'src/responses/contracts.ts'
];

for (const file of requiredFiles) {
  await readFile(resolve(file), 'utf8');
}

const spec = JSON.parse(await readFile(resolve('src/openapi/openapi.v1.json'), 'utf8'));
if (!String(spec?.servers?.[0]?.url ?? '').startsWith('/api/v1')) {
  throw new Error('OpenAPI server URL must start with /api/v1');
}

console.log('Contracts lint passed.');
