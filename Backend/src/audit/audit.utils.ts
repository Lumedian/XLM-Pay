const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'cookie',
  'secret',
  'hashedRefreshToken',
  'emailEncrypted',
  'phoneEncrypted',
  'ssnEncrypted',
  'addressEncrypted',
]);

const MAX_DEPTH = 4;
const MAX_STRING_LENGTH = 2048;
const MAX_ARRAY_LENGTH = 50;

export function sanitizeForAudit(value: unknown, depth = 0): unknown {
  if (value == null) {
    return value;
  }

  if (depth >= MAX_DEPTH) {
    return '[MaxDepth]';
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_LENGTH).map((entry) => sanitizeForAudit(entry, depth + 1));
  }

  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}...[truncated]`
      : value;
  }

  if (typeof value !== 'object') {
    return value;
  }

  const record = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};

  for (const [key, entryValue] of Object.entries(record)) {
    if (entryValue === undefined) {
      continue;
    }

    sanitized[key] = SENSITIVE_KEYS.has(key)
      ? '[REDACTED]'
      : sanitizeForAudit(entryValue, depth + 1);
  }

  return sanitized;
}

export function extractIpAddress(headers: Record<string, unknown>, fallback?: string) {
  const forwardedFor = headers['x-forwarded-for'];

  if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
    return forwardedFor.split(',')[0].trim();
  }

  return fallback;
}
