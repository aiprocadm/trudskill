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

const dts = `// AUTO-GENERATED FILE. DO NOT EDIT.\n// SOURCE_SHA256: ${schemaHash}\nexport type GeneratedOpenApiVersion = 'v1';\n\nexport interface GeneratedClientConfig {\n  baseUrl: string;\n}\n\nexport type GeneratedApiPath =\n${pathLiteral};\n\nexport interface GeneratedApiMeta {\n  requestId: string;\n  correlationId: string;\n  timestamp: string;\n}\n\nexport interface GeneratedApiResponseEnvelope<T> {\n  data: T;\n  meta: GeneratedApiMeta;\n}\n\nexport interface GeneratedApiError {\n  code: string;\n  message: string;\n  details?: Array<{ field?: string; message: string; code?: string }>;\n}\n\nexport interface GeneratedErrorEnvelope {\n  error: GeneratedApiError;\n  meta: GeneratedApiMeta;\n}\n\nexport interface GeneratedLoginRequest {\n  login: string;\n  password: string;\n}\n\nexport interface GeneratedLogoutRequest {\n  sessionId: string;\n}\n\nexport interface GeneratedSessionDto {\n  id: string;\n  tenantId: string;\n  userId: string;\n  expiresAt: string;\n  revokedAt?: string;\n}\n\nexport interface GeneratedBaseFilterQuery {\n  page?: number | undefined;\n  page_size?: number | undefined;\n  q?: string | undefined;\n  status?: string | undefined;\n  sort?: string | undefined;\n  direction_id?: string | undefined;\n  course_id?: string | undefined;\n  course_version_id?: string | undefined;\n  module_id?: string | undefined;\n  group_id?: string | undefined;\n  learner_id?: string | undefined;\n}\n`;

await writeFile(targetTypes, dts, 'utf8');
console.log('Generated API contract artifacts.');
