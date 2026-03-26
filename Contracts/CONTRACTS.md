# Stellara Smart Contracts - Detailed Documentation

## Contract Architecture

All contracts follow Soroban best practices and are optimized for the Testnet environment.

### Design Patterns

1. **Contract Initialization**: All contracts require explicit initialization before use
2. **Authentication**: Functions requiring authorization use `require_auth()` for security
3. **Data Storage**: Persistent state stored in contract instance storage
4. **Error Handling**: Using Symbol-based error codes for gas efficiency
5. **Fee Handling**: Standardized fee collection via `FeeManager`
6. **Cross-Contract Safety**: Atomic multi-contract operations via `safe_call`

## Cross-Contract Call Safety

The system implements a `CrossCall` module (`shared/src/safe_call.rs`) to ensure atomicity and proper error propagation when contracts call each other.

### Guarantees
1.  **Atomicity**: If a downstream contract call fails (panics or returns error), the upstream contract catches the error and propagates it, causing the entire transaction (including any prior state changes like fee payments) to roll back.
2.  **Defensive Checks**: The `safe_invoke` wrapper abstracts `env.try_invoke_contract`, ensuring that all cross-contract calls are handled safely.

### Usage
Use `shared::safe_call::safe_invoke` instead of raw `env.invoke_contract` when you need to handle potential failures gracefully or ensure explicit error codes are returned.

```rust
match safe_invoke(&env, &contract_id, &func_name, args) {
    Ok(val) => { /* success */ },
    Err(code) => { /* handle error or propagate */ }
}
```

## Fee Handling

All contracts implementing fee collection use the `FeeManager` from the shared library.

### Fee Collection Process
1. **Check Balance**: The contract verifies the payer has sufficient balance of the fee token.
2. **Collect Fee**: The fee is transferred from the payer to the designated fee recipient.
3. **Execute Operation**: If fee collection succeeds, the contract operation proceeds.

### Error Codes
- `InsufficientBalance` (1001): The payer does not have enough funds to cover the fee.
- `InvalidAmount` (1002): The fee amount is invalid (negative).

## Trading Contract

### Purpose
Enables decentralized exchange of cryptocurrency pairs with trade history tracking.

### State Variables
- `stats`: TradeStats - Global trading statistics
- `trades`: Vec<Trade> - Complete trade history

### Key Structs

```rust
pub struct Trade {
    pub id: u64,
    pub trader: Address,
    pub pair: Symbol,          // e.g., "USDT" 
    pub amount: i128,          // Amount being traded
    pub price: i128,           // Price per unit
    pub timestamp: u64,        // Ledger timestamp
    pub is_buy: bool,          // Buy vs Sell order
}

pub struct TradeStats {
    pub total_trades: u64,
    pub total_volume: i128,
    pub last_trade_id: u64,
}
```

## Treasury Contract

### Purpose
Manages protocol funds with multi-signature controls, configurable spending limits, a
proposal-based workflow for large disbursements, a full audit trail, and an emergency
freeze capability.

### Error Codes (5xxx range)
| Code | Name | Description |
|------|------|-------------|
| 5001 | `Unauthorized` | Caller lacks the required governance role |
| 5002 | `AlreadyInitialized` | `init` called more than once |
| 5003 | `InvalidAmount` | Amount ≤ 0 |
| 5004 | `ExceedsDailyLimit` | Withdrawal would breach the configured daily limit |
| 5005 | `ExceedsWeeklyLimit` | Withdrawal would breach the configured weekly limit |
| 5006 | `ThresholdRequired` | Amount above `proposal_threshold` must use `propose_spend` |
| 5007 | `ContractFrozen` | Treasury is frozen; all state changes are blocked |
| 5008 | `ProposalNotFound` | No proposal with the given ID exists |
| 5009 | `ProposalNotApproved` | `execute_spend` called on a non-Approved proposal |
| 5010 | `DuplicateApproval` | Approver already approved this proposal |
| 5011 | `InvalidThreshold` | `approval_threshold` is 0 or exceeds the number of approvers |
| 5012 | `NotInitialized` | Contract has not been initialized |

### Multi-Sig Model
- **Roles**: `Admin` (propose, withdraw directly, freeze, cancel) and `Approver`
  (approve/reject/execute spend proposals).
- **Direct withdrawal**: Admin can withdraw amounts ≤ `proposal_threshold` without a
  proposal, subject to daily and weekly limits.
- **Spend proposals**: Any amount can be routed through a `SpendProposal` requiring
  M-of-N approvals from a caller-specified approver list before execution.

### Spending Limits
Limits are tracked using time-bucket keys derived from `ledger.timestamp()`:
- `day_bucket = timestamp / 86_400`
- `week_bucket = timestamp / 604_800`

Both direct withdrawals and proposal executions count against these limits.
Setting a limit to `0` disables that particular check.

### Emergency Freeze
`freeze(admin)` / `unfreeze(admin)` — blocks all state-changing operations
(deposit, withdraw, propose, approve, execute) while active. Queries remain available.

### Audit Trail
Every deposit, direct withdrawal, and proposal execution appends a `TxRecord` to an
append-only on-chain log. Use `get_audit_log(start, count)` for paginated access.

### Key Functions
| Function | Auth Required | Description |
|---|---|---|
| `init` | — | One-time initialization |
| `deposit` | depositor | Transfer tokens into the treasury |
| `withdraw` | Admin | Direct withdrawal below threshold |
| `propose_spend` | Admin | Create an M-of-N spend proposal |
| `approve_spend` | Approver | Add an approval to a pending proposal |
| `execute_spend` | Admin/Approver | Execute a fully-approved proposal |
| `reject_spend` | Approver | Mark a pending proposal as Rejected |
| `cancel_spend` | Admin | Cancel a pending proposal |
| `freeze` / `unfreeze` | Admin | Emergency freeze control |
| `set_limits` | Admin | Update daily/weekly/threshold limits |
| `get_proposal` | — | Read a spend proposal by ID |
| `get_audit_log` | — | Paginated read of the audit trail |
| `get_balance` | — | Query treasury token balance |
| `is_frozen` | — | Query freeze state |
