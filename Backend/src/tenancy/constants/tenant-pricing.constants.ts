import { UsageMetric } from '../tenancy.types';

export const TENANT_PRICING_CENTS: Record<UsageMetric, number> = {
  API_REQUEST: 1,
  EMAIL_SENT: 25,
  INDEXER_EVENT: 2,
  NOTIFICATION_SENT: 5,
};
