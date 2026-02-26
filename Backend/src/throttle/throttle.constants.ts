export interface ThrottleConfig {
  limit: number;
  window: number;
}

export const STRATEGIES: Record<string, ThrottleConfig> = {
  GLOBAL: { limit: 100, window: 60 }, // per IP
  AUTH: { limit: 5, window: 60 }, // login/register
  MARKET: { limit: 60, window: 60 },
  CHAT: { limit: 30, window: 60 },
  ADMIN_ACTION: { limit: 10, window: 60 },
};

export const ROLE_LIMIT_MULTIPLIERS: Record<string, number> = {
  user: 1,
  moderator: 2,
  admin: 5,
  superadmin: 10,
};

export const BAN_RULES = {
  MAX_VIOLATIONS: 3,
  BASE_BAN_SECONDS: 60, // exponential
};
