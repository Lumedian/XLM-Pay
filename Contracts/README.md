# XLMPay Contract

The Soroban smart contract that is the actual source of truth for XLMPay. This is where every payment authorization is stored, every limit is enforced, and every pull either succeeds or fails — not in the [`frontend/`](../frontend) and not in the [`backend/`](../backend).

If the frontend or backend disagree with what's on-chain, the chain is correct. Those two layers exist to make this contract easier to use; they have no authority of their own.

---

# 🚀 What This Contract Does

The contract manages a single core concept: a **payment authorization** — a payer's standing, bounded permission for a specific recipient to pull funds on a schedule.

It is responsible for:

* **Creating an authorization** — recorded only when signed by the payer themselves
* **Enforcing limits on every pull** — amount cap, minimum interval since the last pull, expiry date / max pull count
* **Executing a pull** — transferring funds directly from payer to recipient, only if all limits pass
* **Revoking an authorization** — permanently, callable only by the payer, effective immediately
* **Emitting events** for every state change (created, pulled, pull rejected, revoked) so the backend indexer and frontend can stay in sync without needing to trust each other

The contract **never** custodies funds. Payer funds remain in the payer's account at all times; the contract only holds the authorization record and executes a transfer at pull time if — and only if — that pull is currently valid.

---

# 🧠 Core Concepts

### Authorization

The central data structure. An authorization defines:

| Field | Description |
|---|---|
| `payer` | Address that owns the funds and signed the authorization |
| `recipient` | Address allowed to call `pull()` against this authorization |
| `asset` | The Stellar asset being paid (XLM or another Stellar asset contract) |
| `max_amount` | Maximum amount that can be pulled in a single `pull()` call |
| `min_interval` | Minimum time that must pass between consecutive successful pulls |
| `expiry` | Timestamp (or max pull count) after which the authorization can no longer be used |
| `status` | `active`, `expired`, or `revoked` |
| `last_pull_at` | Timestamp of the most recent successful pull, used to enforce `min_interval` |

### Pull

A single execution attempt against an authorization. A `pull()` call:

1. Loads the authorization by ID
2. Checks `status == active`
3. Checks `now >= last_pull_at + min_interval`
4. Checks `now <= expiry` (or pull count `< max_pulls`)
5. Checks requested amount `<= max_amount`
6. If all checks pass: transfers funds payer → recipient, updates `last_pull_at`, emits a success event
7. If any check fails: the call fails, no funds move, an event is emitted recording the rejection reason

### Revocation

Only the `payer` address on an authorization can revoke it. Revocation is immediate and permanent — there is currently no "pause and resume," only revoke-and-recreate. (See [roadmap](../README.md#-future-roadmap).)

---

# 📜 Public Interface

> Exact function signatures will evolve during development — this reflects the intended interface as of this writing. Treat as a working draft, not a frozen spec, until version 1.0.

```rust
// Create a new payment authorization. Must be invoked with the payer's signature.
pub fn create_authorization(
    env: Env,
    payer: Address,
    recipient: Address,
    asset: Address,
    max_amount: i128,
    min_interval: u64,
    expiry: u64,
) -> u64; // returns authorization ID

// Attempt to pull funds under an existing authorization. Callable by the recipient.
pub fn pull(
    env: Env,
    authorization_id: u64,
    amount: i128,
) -> bool; // true if pull succeeded, fails/panics with reason otherwise

// Revoke an authorization. Must be invoked with the payer's signature.
pub fn revoke(
    env: Env,
    authorization_id: u64,
);

// Read-only: fetch the current state of an authorization.
pub fn get_authorization(
    env: Env,
    authorization_id: u64,
) -> Authorization;
```

### Events emitted

| Event | Emitted when |
|---|---|
| `AuthorizationCreated` | A new authorization is successfully created |
| `PullSucceeded` | A `pull()` call passes all checks and funds transfer |
| `PullRejected` | A `pull()` call fails a check (includes the rejection reason) |
| `AuthorizationRevoked` | A payer revokes an authorization |

These events are what the backend indexer listens to — they are the only way off-chain components should learn about state changes.

---

# 🔐 Authorization & Signing Rules

These rules are the actual security boundary of the entire system. Everything else in this repo exists around them.

* `create_authorization` **must** require the `payer`'s signature. A recipient cannot create or widen an authorization on someone else's behalf.
* `pull` is called by the `recipient`, but it can **never** succeed beyond what the payer already signed off on at creation time. The recipient has no ability to raise `max_amount`, shorten `min_interval`, or extend `expiry`.
* `revoke` **must** require the `payer`'s signature. No one else — not the recipient, not the backend, not an XLMPay-controlled key — can revoke or freeze an authorization on the payer's behalf, and equally, no one else can prevent a payer from revoking.
* There is intentionally no "admin" or upgrade key in the core authorization/pull/revoke logic that could override payer-set limits. Any future governance or upgrade mechanism (see roadmap) must not be able to retroactively change the terms of an existing authorization.

---

# ⚠️ Threat Model & Known Open Questions

| Risk | How the contract addresses it | Status |
|---|---|---|
| Recipient tries to pull more than `max_amount` | Rejected at the `pull()` check | Implemented |
| Recipient pulls more frequently than `min_interval` | Rejected via `last_pull_at` check | Implemented |
| Recipient pulls after `expiry` or after revocation | Rejected via `status`/`expiry` check | Implemented |
| Reentrancy during the transfer step of `pull()` | Needs explicit handling — transfer should be the last action in the function, state updated before transfer completes | **Needs verification in implementation** |
| Integer overflow/underflow on amount or timestamp arithmetic | Should use checked arithmetic throughout | **Needs verification in implementation** |
| Front-running of `pull()` calls | Pulls are deterministic given authorization state; unclear if there's any meaningful front-running surface, but not yet formally analyzed | **Open question** |
| Payer revokes mid-flight while a `pull()` is in the same ledger close | Needs explicit ordering guarantee or atomic check-then-act within a single transaction | **Needs verification in implementation** |
| Upgradeable contract logic changing rules retroactively | No upgrade mechanism in the core contract by default; any future upgrade path must not retroactively alter existing authorizations | Design constraint, not yet implemented |

This contract has **not been audited**. Do not deploy to mainnet with real funds until an independent security review has been completed. See the [root README's Threat Model](../README.md#%EF%B8%8F-threat-model--limitations) for project-wide risk context.

---

# 📁 Folder Structure

```text
contract/
│
├── src/
│   ├── lib.rs                  # Contract entrypoints (create_authorization, pull, revoke, etc.)
│   ├── types.rs                # Authorization struct and related types
│   ├── errors.rs                # Custom error/rejection reasons
│   └── events.rs                # Event definitions
│
├── tests/
│   ├── create_authorization.rs
│   ├── pull.rs
│   ├── revoke.rs
│   └── edge_cases.rs            # interval boundaries, expiry boundaries, overflow cases
│
├── Cargo.toml
├── Cargo.lock
└── README.md                    # This file
```

---

# 📦 Installation & Setup

## Prerequisites

* Rust (stable toolchain)
* [Soroban CLI](https://developers.stellar.org/docs/tools/cli)
* `wasm32-unknown-unknown` target installed:

```bash
rustup target add wasm32-unknown-unknown
```

## Build

```bash
cd contract
soroban contract build
```

This produces a `.wasm` file under `target/wasm32-unknown-unknown/release/`.

## Run Tests

```bash
cargo test
```

## Deploy (Testnet Example)

```bash
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/xlmpay_contract.wasm \
  --source <your-testnet-identity> \
  --network testnet
```

> Replace `<your-testnet-identity>` with a configured Soroban CLI identity. Never deploy with a mainnet identity until the contract has been audited.

---

# 🧪 Testing Philosophy

Test coverage should specifically target the boundary conditions, since those are where authorization logic is most likely to have bugs:

* exact-boundary timing (`pull()` called at exactly `last_pull_at + min_interval`)
* exact-boundary amounts (`amount == max_amount` vs. `amount == max_amount + 1`)
* exact-boundary expiry (`pull()` at the exact expiry timestamp)
* pulling immediately after revocation
* pulling on an authorization that never existed / wrong recipient calling `pull()`
* repeated rapid `pull()` calls in the same ledger

```bash
cargo test
```

Passing tests are a baseline, not a substitute for an external audit before mainnet deployment.

---

# 🤝 Contributing

See the [root README](../README.md) for overall contribution guidelines. Contract-specific notes:

* Any change to `pull()`, `create_authorization()`, or `revoke()` logic requires accompanying tests for the boundary conditions listed above
* Do not introduce admin/upgrade keys capable of altering existing authorizations without extensive discussion and documentation — this directly conflicts with the project's non-custodial design goal
* Security researchers: please report findings privately first; see `SECURITY.md` (to be added) for responsible disclosure guidelines

---
