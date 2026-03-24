import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const source = resolve('src/openapi/openapi.v1.json');
const targetSpec = resolve('src/generated/openapi.v1.generated.json');
const targetTypes = resolve('src/generated/contracts.generated.d.ts');

const content = await readFile(source, 'utf8');
await mkdir(dirname(targetSpec), { recursive: true });
await writeFile(targetSpec, `// AUTO-GENERATED FILE. DO NOT EDIT.\n${content}\n`, 'utf8');

const dts = `// AUTO-GENERATED FILE. DO NOT EDIT.\nexport type GeneratedOpenApiVersion = 'v1';\nexport interface GeneratedClientConfig {\n  baseUrl: string;\n}\n`;
await writeFile(targetTypes, dts, 'utf8');
console.log('Generated API contract artifacts.');
