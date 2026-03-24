// @ts-expect-error Prisma CLI resolves this package at runtime.
import { defineConfig } from '@prisma/config';

const fallbackDatabaseUrl = 'postgresql://postgres:postgres@localhost:5432/stellara_backend';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL || fallbackDatabaseUrl,
  },
});
