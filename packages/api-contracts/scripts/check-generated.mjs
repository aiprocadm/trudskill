import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const source = resolve('src/openapi/openapi.v1.json');
const generatedSpec = resolve('src/generated/openapi.v1.generated.json');
const generatedTypes = resolve('src/generated/contracts.generated.d.ts');

const sourceText = await readFile(source, 'utf8');
const schemaHash = createHash('sha256').update(sourceText).digest('hex');
const expectedMarker = `SOURCE_SHA256: ${schemaHash}`;

const [specText, typesText] = await Promise.all([
  readFile(generatedSpec, 'utf8'),
  readFile(generatedTypes, 'utf8')
]);

for (const [label, text] of [
  ['openapi.v1.generated.json', specText],
  ['contracts.generated.d.ts', typesText]
]) {
  if (!text.includes('AUTO-GENERATED FILE. DO NOT EDIT.')) {
    throw new Error(`${label}: generated marker is missing.`);
  }

  if (!text.includes(expectedMarker)) {
    throw new Error(`${label}: generated file is stale. Run pnpm contracts:generate.`);
  }
}

console.log('Generated artifacts integrity check passed.');
