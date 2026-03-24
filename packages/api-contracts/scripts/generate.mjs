import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const source = resolve('src/openapi/openapi.v1.json');
const targetSpec = resolve('src/generated/openapi.v1.generated.json');
const targetTypes = resolve('src/generated/contracts.generated.d.ts');

const content = await readFile(source, 'utf8');
const openapi = JSON.parse(content);
const schemaHash = createHash('sha256').update(content).digest('hex');
const paths = Object.keys(openapi.paths ?? {});

await mkdir(dirname(targetSpec), { recursive: true });
await writeFile(targetSpec, `// AUTO-GENERATED FILE. DO NOT EDIT.\n// SOURCE_SHA256: ${schemaHash}\n${content}\n`, 'utf8');

const pathLiteral = paths.length > 0 ? paths.map((path) => `  | '${path}'`).join('\n') : "  | never";

const dts = `// AUTO-GENERATED FILE. DO NOT EDIT.\n// SOURCE_SHA256: ${schemaHash}\nexport type GeneratedOpenApiVersion = 'v1';\n\nexport interface GeneratedClientConfig {\n  baseUrl: string;\n}\n\nexport type GeneratedApiPath =\n${pathLiteral};\n`;

await writeFile(targetTypes, dts, 'utf8');
console.log('Generated API contract artifacts.');
