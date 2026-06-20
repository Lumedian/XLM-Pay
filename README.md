# XLMPay 💫

### Non-Custodial Recurring & Pull Payments on Stellar

Soroban Smart Contracts • Recurring Payments • Subscriptions • Payroll Streaming • Non-Custodial Infrastructure

XLMPay is an open-source protocol for **recurring and pull-based payments** on the **Stellar** network, built on **Soroban** smart contracts.

It lets a payer authorize a recipient to pull funds on a schedule — a subscription, a salary, rent, an installment plan — **without** giving up custody of their funds and **without** having to manually sign a transaction every single payment cycle.

---

# 🚀 The Problem

Sending a one-time crypto payment is easy: you sign a transaction, it settles, done.

**Recurring** payments are not. On most blockchains, including Stellar today, there is no native way for a merchant or employer to "charge" a wallet the way a credit card network can auto-charge a card. This leaves people with two bad options:

1. **Manually sign every single payment, every cycle.** Works in theory, fails in practice — people forget, get busy, or simply stop. This is a major reason on-chain subscriptions and recurring payroll barely exist today.
2. **Hand custody of funds to a third party** who pays on your behalf automatically. This defeats the entire point of holding your own wallet — you're back to trusting a middleman with your money.

There is currently no good middle option: a way to pre-authorize a *bounded, revocable, automatic* pull of funds while keeping full self-custody.

---

# ⚡ What XLMPay Does

XLMPay introduces a third option: a smart-contract-enforced **payment authorization** that sits between the payer and the recipient.

1. **The payer signs one authorization**, not a payment every cycle. That authorization defines hard limits:
   - maximum amount per pull
   - minimum interval between pulls (e.g., no more than once every 30 days)
   - an expiry date or maximum number of pulls
   - which asset (XLM, USDC, or any Stellar asset)
2. **The authorization is stored in a Soroban contract** — not with XLMPay, not with the recipient. The payer's funds never leave their wallet until a pull actually executes.
3. **The recipient calls `pull()` each billing cycle.** The contract checks the authorization's limits before releasing any funds. If the recipient tries to pull more than allowed, more often than allowed, or after expiry/revocation, the contract simply rejects it.
4. **The payer can revoke at any time**, unilaterally, on-chain. No cooperation from the recipient is required, and no further pulls succeed after revocation.
5. **Funds stay in the payer's wallet the entire time** — this is not a custodial pool, an escrow deposit, or a pre-funded balance. The contract holds a *permission*, not money.

In short: **autopay for self-custodial wallets, where the limits are enforced by code instead of trust.**

---

# 🧑‍🤝‍🧑 Who This Is For

* **On-chain subscription services** — SaaS products, content platforms, or any app that wants "subscribe and forget" instead of manual monthly payments
* **DAOs** — automated contributor salaries / payroll without a treasury admin manually sending funds every cycle
* **Rent and installment payments** — landlords, lenders, or BNPL-style products that need predictable recurring transfers
* **Remittances** — recurring family support payments sent automatically on a schedule
* **Any recurring B2B or B2C payment** where both sides want automation without a custodian in the middle

---

# 🏗 How It Works (Architecture)

```text
┌──────────────┐                                   ┌──────────────────┐
│    Payer      │  1. signs ONE authorization        │    Recipient      │
│  (wallet/DID) │ ───────────────────────────────►   │ (merchant/employer)│
└──────┬───────┘                                    └─────────┬─────────┘
       │                                                       │
       │                                                       │ 3. calls pull()
       │ funds remain in                                       │    each cycle
       │ payer's wallet                                        ▼
       │                                          ┌─────────────────────────────┐
       │                                          │   Soroban Smart Contracts     │
       │                                          │  • Authorization Registry     │
       │                                          │  • Pull Execution Engine      │
       │                                          │  • Limit Enforcement          │
       │                                          │    (amount/frequency/expiry)  │
       │                                          │  • Revocation Registry        │
       └─────────────── 4. revoke any time ───────►                               │
                                                  └─────────────────────────────┘
                                                                 │
                                                  2. on each valid pull, contract
                                                     releases funds directly
                                                     payer → recipient
                                                                 ▼
                                                       Funds settle on Stellar
```

**The contract never custodies funds.** It custodies a *rule*. On every `pull()` call, the contract checks the rule, and if it passes, the transfer happens directly from payer to recipient in the same operation — there's no intermediate holding account.

---

# ⚡ Core Features

## 🔁 One-Time Authorization, Recurring Payments

Sign once, pay automatically on schedule — no manual re-signing every cycle.

## 🛡 Hard On-Chain Limits

Every authorization is bounded by amount, frequency, and expiry, enforced by the contract — not by trusting the recipient's good behavior.

## 🚫 Instant, Unilateral Revocation

The payer can cancel an authorization at any time, without needing the recipient's cooperation or approval.

## 💰 Fully Non-Custodial

Funds never leave the payer's wallet until a valid pull executes. There is no pooled balance, escrow, or custodian holding funds in between payments.

## 📊 Streaming Mode (Roadmap)

In addition to discrete periodic pulls, a continuous streaming mode is planned for payroll- and rent-style use cases where funds accrue gradually rather than in lump-sum intervals.

## 🔄 Multi-Asset Support

Authorizations can be denominated in XLM or any Stellar-issued asset (e.g., USDC), since Soroban contracts can interact with the Stellar asset layer directly.

## 🔌 Simple Integration API

Recipients (merchants, payroll systems) integrate via a backend API and SDK without needing to write Soroban contract calls themselves.

---

# ⚠️ Threat Model & Limitations

Being upfront about what can go wrong matters more for payment infrastructure than for most software.

| Risk | Mitigation | Status |
|---|---|---|
| Recipient attempts to pull more than authorized | Contract enforces hard amount/frequency caps at execution time | Core contract responsibility |
| Recipient pulls before the allowed interval has passed | Contract checks last-pull timestamp before releasing funds | Core contract responsibility |
| Payer's balance is insufficient at pull time | Pull simply fails; no partial-pull or debt is created | Documented behavior, no retry logic yet |
| Authorization continues after payer intends to cancel but forgets/delays | Revocation is instant once submitted, but payer must actively revoke — there's no "pause and resume" yet | Roadmap item |
| Malicious or buggy recipient contract integration | Authorization Registry only grants pull *rights* defined by the payer; it cannot be widened by the recipient | Needs third-party audit before production use |
| Smart contract bugs in limit enforcement logic | Test suite covers core paths (see Testing) | **Not yet audited** — do not use with real funds before an independent audit |
| Recipient identity confusion (wrong recipient pulls funds) | Authorizations are tied to a specific recipient address at creation time | Core contract responsibility |

### Disclaimer

XLMPay is payment **infrastructure**, not a managed payment service. Integrators are responsible for their own security review, key management practices, and any regulatory obligations relevant to their use case (e.g., payroll compliance, consumer protection rules for subscription billing). This project has not undergone a third-party security audit — treat it as early-stage software.

---

# 📁 Monorepo Structure

```text
xlmpay/
│
├── frontend/                  # Payer-facing web app: connect wallet, create/manage authorizations
│
├── backend/                   # API services for recipients: trigger pulls, track billing cycles, webhooks
│
├── contract/                  # Soroban smart contract: authorization, pull execution, revocation
│
├── docs/                      # Architecture, integration guides, contract reference
│
├── .github/                   # CI/CD workflows
│
├── package.json               # Root workspace configuration
├── turbo.json                  # Turborepo config (optional)
├── README.md
└── LICENSE
```

---

# 🖥 Frontend

The payer-facing interface for creating, viewing, and managing payment authorizations.

### Responsibilities

* connect Stellar wallet
* create a new authorization (set amount, frequency, expiry, recipient, asset)
* view active authorizations and their pull history
* revoke an authorization
* view upcoming/expected pulls

### Stack

* Next.js
* React
* TypeScript
* Tailwind CSS
* Stellar SDK

---

# ⚙️ Backend

The service layer used by recipients (merchants, payroll systems, landlords) to integrate pull payments into their own product.

### Responsibilities

* track billing cycles and trigger `pull()` calls at the right time
* expose a simple REST/GraphQL API so recipients don't need to write Soroban calls directly
* webhook notifications on successful pulls, failed pulls, and revocations
* authorization status lookups (active, expired, revoked)
* basic recipient dashboard data (upcoming pulls, payment history)

### Stack

* Node.js
* Express / NestJS
* PostgreSQL
* Stellar SDK

---

# ⛓ Contract

The trust-minimized core of the system. All enforcement of limits happens here, not in the frontend or backend.

### Responsibilities

* store payment authorizations (payer, recipient, asset, amount cap, frequency, expiry)
* execute `pull()`: validate limits, then transfer funds payer → recipient
* handle revocation, marking an authorization as permanently inactive
* emit events for successful pulls, failed pull attempts, and revocations (for backend/frontend to index)

### Stack

* Rust
* Soroban SDK

---

# 📦 Installation & Setup

## Prerequisites

* Node.js 18+
* Rust
* Soroban CLI
* npm / yarn / pnpm

## Clone Repository

```bash
git clone https://github.com/xlmpay/xlmpay.git
cd xlmpay
```

## Install Dependencies

```bash
npm install
```

## Run Frontend

```bash
cd frontend
npm run dev
```

## Run Backend

```bash
cd backend
npm run dev
```

## Build Smart Contract

```bash
cd contract
soroban contract build
```

---

# 🧪 Testing

## Frontend Tests

```bash
cd frontend
npm test
```

## Backend Tests

```bash
cd backend
npm test
```

## Contract Tests

```bash
cd contract
cargo test
```

> Contract test coverage does not constitute a security audit. See [Threat Model & Limitations](#%EF%B8%8F-threat-model--limitations) before using with real funds.

---

# 🌍 Use Cases

* on-chain SaaS subscriptions
* DAO contributor payroll
* recurring remittances
* rent payments
* installment / BNPL-style loan repayments
* recurring DAO membership dues

---

# 🔄 Future Roadmap

* continuous streaming payments (payroll/rent-style accrual, not just discrete pulls)
* pause/resume for authorizations (instead of only revoke-and-recreate)
* retry logic for failed pulls due to insufficient balance
* multi-recipient / split-payment authorizations
* mobile wallet integration
* developer SDK for faster recipient-side integration
* third-party smart contract security audit

---

# 🤝 Contributing

We welcome contributions from:

* frontend developers
* backend engineers
* Rust / Soroban developers
* security researchers
* technical writers

### Contribution Steps

1. Fork repository
2. Create feature branch
3. Commit changes
4. Open Pull Request

---

# 📚 Documentation

Planned documentation includes:

* contract reference (function signatures, authorization schema)
* recipient integration guide
* frontend wallet-connection guide
* security model and threat model
* API reference for backend endpoints

---

# 📜 License

MIT License
