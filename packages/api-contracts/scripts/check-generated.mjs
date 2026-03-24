import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const file = resolve('src/generated/contracts.generated.d.ts');
const text = await readFile(file, 'utf8');
if (!text.includes('AUTO-GENERATED FILE. DO NOT EDIT.')) {
  throw new Error('Generated marker is missing.');
}
console.log('Generated artifacts marker check passed.');
