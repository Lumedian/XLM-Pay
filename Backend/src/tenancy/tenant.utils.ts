export function slugifyTenantName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

export function resolveDateRange(from?: string, to?: string): { from: Date; to: Date } {
  const now = new Date();
  const end = to ? new Date(to) : now;
  const start = from ? new Date(from) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

  return {
    from: start,
    to: end,
  };
}
