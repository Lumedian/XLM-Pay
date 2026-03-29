export function validateCacheKey(key: string, tenantId: string) {
  if (!key.startsWith(`${tenantId}:`)) {
    throw new Error('Cache isolation breach');
  }
}