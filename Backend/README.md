# XLMPay Backend

The service layer that lets **recipients** (merchants, payroll systems, landlords, anyone receiving recurring payments) integrate with XLMPay without writing Soroban contract calls themselves.

This service does not hold funds and does not have signing authority over any payer's wallet. Its job is to track billing schedules, trigger `pull()` calls on the [`contract/`](../contract) at the right time, index on-chain activity for fast lookups, and notify recipients of outcomes. All actual fund movement and limit enforcement happens on-chain — this backend is a convenience and orchestration layer, not a trust layer.

---

# 🚀 What This Service Does

* Expose a REST API recipients can integrate against instead of calling Soroban directly
* Track billing cycles per authorization and trigger `pull()` at the correct time
* Index on-chain events (successful pulls, failed pulls, revocations) for fast querying — the chain remains the source of truth; this is a read cache, not an authority
* Send webhook notifications to recipients on pull success, pull failure, and revocation
* Provide authorization status lookups (active / expired / revoked) without requiring a direct RPC call from the recipient's system
* Surface basic recipient-side data: upcoming pulls, payment history, failure reasons

This service does **not**:

* hold custody of any funds
* have the ability to create, modify, or widen a payment authorization — only the payer can do that, by signing on-chain
* bypass any contract-enforced limit (amount cap, frequency cap, expiry) — it can only call `pull()` and let the contract accept or reject it

---

# 🏗 How It Fits In

```text
Recipient's system
       │
       │  REST API calls (check status, register webhook, view history)
       ▼
┌─────────────────────┐
│   XLMPay Backend      │
│  • Scheduler           │──── calls pull() at the right time ────►  Soroban Contract
│  • Event Indexer       │◄─── reads on-chain events ───────────────  (source of truth)
│  • Webhook Dispatcher  │
│  • API Layer           │
└─────────────────────┘
       │
       │  webhook (pull succeeded/failed, authorization revoked)
       ▼
Recipient's system
```

The backend polls or subscribes to on-chain events to stay in sync, but never assumes its own database is authoritative over the chain. If the indexed state and on-chain state ever disagree, the chain wins.

---

# 🧑‍💻 Tech Stack

* **Node.js** — runtime
* **Express / NestJS** — API framework
* **PostgreSQL** — indexed authorization and pull-history data
* **Stellar SDK** — submitting `pull()` transactions and reading contract state
* **BullMQ / cron-based scheduler** — triggering pulls on schedule (exact choice TBD, see [Scheduling](#-scheduling-approach))
* **Redis** (optional) — job queue backing store, if BullMQ is used

---

# 📁 Folder Structure

```text
backend/
│
├── src/
│   ├── api/                     # REST route handlers
│   │   ├── authorizations.ts     # status lookups, history
│   │   └── webhooks.ts           # webhook registration endpoints
│   │
│   ├── scheduler/                # Billing cycle tracking and pull triggering
│   │   ├── jobs.ts
│   │   └── pull-runner.ts        # calls contract pull() at the scheduled time
│   │
│   ├── indexer/                  # Listens to / polls on-chain events
│   │   ├── eventListener.ts
│   │   └── sync.ts               # reconciles local DB with chain state
│   │
│   ├── webhooks/                 # Outbound webhook dispatch + retry logic
│   │   └── dispatcher.ts
│   │
│   ├── db/                       # Database models and migrations
│   │   ├── models/
│   │   └── migrations/
│   │
│   ├── lib/
│   │   ├── stellar.ts             # Stellar SDK setup, network config
│   │   └── contract.ts            # Soroban contract call wrappers
│   │
│   └── server.ts                 # App entrypoint
│
├── tests/
│
├── .env.example
├── tsconfig.json
├── package.json
└── README.md                     # This file
```

---

# 📦 Installation & Setup

## Prerequisites

* Node.js 18+
* PostgreSQL (local or hosted)
* Redis (only if using a queue-backed scheduler)
* npm / yarn / pnpm

## Install Dependencies

```bash
cd backend
npm install
```

## Environment Variables

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `STELLAR_NETWORK` | `testnet` or `mainnet` |
| `SOROBAN_RPC_URL` | RPC endpoint for the Soroban network being used |
| `CONTRACT_ID` | Deployed XLMPay Soroban contract address |
| `PULL_SIGNER_SECRET` | Keypair used to submit `pull()` transactions (see [Security Notes](#-security-notes) — this key has **no** authority over payer funds) |
| `REDIS_URL` | Only required if the scheduler uses a Redis-backed queue |
| `WEBHOOK_SIGNING_SECRET` | Used to sign outbound webhook payloads so recipients can verify authenticity |

## Run Database Migrations

```bash
npm run migrate
```

## Run Locally

```bash
npm run dev
```

## Build for Production

```bash
npm run build
npm start
```

---

# 🕒 Scheduling Approach

Each authorization has a defined interval (e.g., "every 30 days"). The scheduler:

1. Reads active authorizations from the indexed database
2. Determines which ones are due for a pull
3. Submits a `pull()` call to the contract for each
4. Records the result (success/failure) and reconciles against the on-chain event in the next sync pass

If a pull fails (e.g., insufficient payer balance, authorization revoked since last sync), the failure is recorded and a webhook is dispatched — there is currently no automatic retry. See the [root roadmap](../README.md#-future-roadmap) for planned retry logic.

---

# 🔌 API Overview

> Full request/response schemas live in [`docs/`](../docs) once published. High-level surface:

| Endpoint | Purpose |
|---|---|
| `GET /authorizations/:id` | Look up status of a specific authorization |
| `GET /authorizations?recipient=...` | List authorizations for a given recipient address |
| `GET /authorizations/:id/history` | Pull history for an authorization |
| `POST /webhooks` | Register a webhook URL for a recipient |
| `POST /webhooks/test` | Send a test event to a registered webhook |

All write actions that affect an authorization itself (create, revoke) happen on-chain via the payer's wallet — this API is read/orchestration only, it cannot create or alter authorizations on a payer's behalf.

---

# 🧪 Testing

```bash
npm test
```

Tests cover:

* API route handlers (request validation, response shapes)
* scheduler logic (correctly identifying due pulls)
* indexer reconciliation (local DB vs. mocked on-chain state)
* webhook dispatch and retry behavior

---

# 🔐 Security Notes

* The backend holds a signer key (`PULL_SIGNER_SECRET`) used only to **submit** `pull()` transactions. This key has no special authority — it can only trigger a pull attempt, and the contract independently enforces whether that pull is actually allowed (amount, frequency, expiry, revocation status). Compromise of this key lets an attacker spam pull attempts, all of which the contract will reject if they violate the authorization — it does **not** let an attacker move funds beyond what the payer already authorized.
* The backend's database is a **cache/index**, not a source of truth. Any discrepancy between indexed state and on-chain state must resolve in favor of the chain. Do not build recipient-facing logic that trusts the database over a fresh on-chain check for anything safety-critical.
* Webhook payloads are signed (`WEBHOOK_SIGNING_SECRET`) so recipients can verify a webhook actually originated from this service before acting on it.
* This service has not undergone a third-party security audit. See the [root README's Threat Model](../README.md#%EF%B8%8F-threat-model--limitations) before relying on it in production.

---

# 🤝 Contributing

See the [root README](../README.md) for overall contribution guidelines. Backend-specific notes:

* New contract interactions should go through `lib/contract.ts`, not be called ad hoc elsewhere
* Any change to indexer reconciliation logic should include tests for the "chain and DB disagree" case
* Run `npm run lint` and `npm test` before opening a PR

---

