# Multi-Tenant Migration Strategy

1. Bootstrap a default tenant and map all existing single-tenant traffic into that tenant so current clients remain functional.
2. Add `tenant_id` to tenant-owned tables and backfill legacy rows to the default tenant inside one transactional migration window.
3. Move all user-facing reads and writes to tenant-scoped queries before enabling enterprise onboarding.
4. Provision new enterprise tenants through the onboarding workflow, then configure per-tenant feature flags and settings before traffic cutover.
5. Meter API, notification, email, and indexer activity into `tenant_usage_events` and generate billing snapshots from those immutable usage records.
6. Once all callers send tenant headers consistently, tighten isolation further with database policies or separate schemas for the highest-assurance tenants.
