const REDACTED = '[REDACTED]';

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /authorization/i,
  /cookie/i,
  /presigned/i,
  /signature/i
];

const isSensitiveKey = (key: string) => SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));

export const redactValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        isSensitiveKey(key) ? REDACTED : redactValue(entry)
      ])
    );
  }

  return value;
};

export const safeSerialize = (value: unknown): string => JSON.stringify(redactValue(value));
