export const USAGE_METRICS = [
  'API_REQUEST',
  'EMAIL_SENT',
  'INDEXER_EVENT',
  'NOTIFICATION_SENT',
] as const;

export type UsageMetric = (typeof USAGE_METRICS)[number];

export const USER_ROLES = ['USER', 'ADMIN', 'MENTOR'] as const;

export type Role = (typeof USER_ROLES)[number];
