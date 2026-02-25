# Stellara Shared Library

## Overview

The Stellara Shared Library provides common utilities, types, and patterns used across all Stellara smart contracts. This library ensures consistency, security, and maintainability throughout the ecosystem.

## Modules

### Core Modules

#### `events.rs`
Standardized event types for on-chain action logging.

**Features:**
- Consistent event structures for off-chain indexing
- Standardized event topics for reliable backend integration
- Event emitter helpers for easy event publishing

**Event Categories:**
- Trading events (trade execution, pausing, fees)
- Governance events (proposals, approvals, execution)
- Social rewards events (rewards, claims)
- Token events (transfers, mints, burns)

**Usage:**
```rust
use shared::events::{EventEmitter, TradeExecutedEvent};

let event = TradeExecutedEvent {
    trade_id: 1,
    trader: trader_address,
    pair: Symbol::new(&env, "XLMUSDC"),
    amount: 1000,
    price: 100,
    is_buy: true,
    fee_amount: 10,
    fee_token: token_address,
    timestamp: env.ledger().timestamp(),
};

EventEmitter::trade_executed(&env, event);
```

#### `safe_call.rs`
Safe cross-contract invocation with error handling and reentrancy protection.

**Features:**
- Safe invocation wrapper with error handling
- Typed invocation for type safety
- Reentrancy guards
- Event emission for failed calls
- Standardized error codes

**Usage:**
```rust
use shared::safe_call::{safe_invoke, check_reentrancy, set_reentrancy_guard};

// Reentrancy protection
check_reentrancy(&env)?;
set_reentrancy_guard(&env);

// Safe cross-contract call
let result = safe_invoke(&env, &contract, &func, args)?;

clear_reentrancy_guard(&env);
```

#### `cross_contract.rs`
Standardized patterns for cross-contract communication.

**Features:**
- Token transfer patterns
- Governance interaction patterns
- Fee collection patterns
- Callback patterns
- Authorization helpers

**Usage:**
```rust
use shared::cross_contract::{transfer_token, collect_fee};

// Transfer tokens
transfer_token(&env, &token, &from, &to, amount)?;

// Collect fee
collect_fee(&env, &token, &payer, &recipient, fee_amount)?;
```

#### `governance.rs`
Governance-related types and utilities.

**Features:**
- Proposal structures
- Approval tracking
- Timelock mechanisms

#### `fees.rs`
Fee calculation and management utilities.

**Features:**
- Fee calculation helpers
- Fee collection patterns

## Error Codes

### Safe Call Errors (2000-2099)
- `2001` - CALL_FAILED: Cross-contract call failed
- `2002` - CONTRACT_NOT_FOUND: Target contract not found
- `2003` - INVALID_RESPONSE: Invalid response from contract
- `2004` - REENTRANCY_DETECTED: Reentrancy attempt detected
- `2005` - UNAUTHORIZED_CALLER: Unauthorized contract caller

### Business Logic Errors (3000-3999)
- `3001` - INVALID_AMOUNT: Invalid amount (negative or zero)
- `3002` - INSUFFICIENT_BALANCE: Insufficient balance
- `3003` - INVALID_STATE: Invalid contract state

### Standard Errors
- `UNAUTHORIZED` - Unauthorized access
- `NOT_FOUND` - Resource not found
- `INVALID_AMOUNT` - Invalid amount
- `PAUSED` - Contract is paused
- `ALREADY_EXISTS` - Resource already exists

## Security Features

### 1. Reentrancy Protection
Prevents reentrancy attacks through guard mechanisms:
```rust
check_reentrancy(&env)?;
set_reentrancy_guard(&env);
// ... operations ...
clear_reentrancy_guard(&env);
```

### 2. Authorization Checks
Ensures only authorized callers can execute functions:
```rust
verify_caller(&env, &expected_caller)?;
```

### 3. Input Validation
Validates all inputs before processing:
```rust
if amount <= 0 {
    return Err(3001); // INVALID_AMOUNT
}
```

### 4. Event Emission
Logs all important operations for monitoring:
```rust
emit_call_failed(&env, &contract, &func, error_code);
```

## Testing

The shared library includes comprehensive tests:

### Unit Tests
Located in `tests/cross_contract_tests.rs`:
- Mock contract implementations
- Basic functionality tests
- Pattern tests
- Integration tests

**Run tests:**
```bash
cargo test --package shared
```

### Integration Tests
Located in `tests/invariants.rs`:
- Property-based testing
- Invariant checking
- Security testing

## Usage in Contracts

### Adding as Dependency

In your contract's `Cargo.toml`:
```toml
[dependencies]
shared = { path = "../../shared" }
```

### Importing Modules

```rust
use shared::cross_contract::{transfer_token, collect_fee};
use shared::safe_call::{check_reentrancy, set_reentrancy_guard};
use shared::events::{EventEmitter, TradeExecutedEvent};
```

## Best Practices

### 1. Always Use Safe Invocation
```rust
// Good
let result = safe_invoke(&env, &contract, &func, args)?;

// Avoid
let result = env.invoke_contract(&contract, &func, args);
```

### 2. Protect State-Changing Operations
```rust
pub fn critical_operation(env: Env) -> Result<(), u32> {
    check_reentrancy(&env)?;
    set_reentrancy_guard(&env);
    
    // ... operations ...
    
    clear_reentrancy_guard(&env);
    Ok(())
}
```

### 3. Emit Events for Monitoring
```rust
env.events().publish(
    (Symbol::new(&env, "operation_complete"),),
    (user, amount, timestamp)
);
```

### 4. Use Standardized Error Codes
```rust
if balance < amount {
    return Err(3002); // INSUFFICIENT_BALANCE
}
```

### 5. Validate All Inputs
```rust
if amount <= 0 {
    return Err(3001); // INVALID_AMOUNT
}
```

## Documentation

For detailed documentation, see:
- [Cross-Contract Communication Guide](../CROSS_CONTRACT_GUIDE.md)
- [Implementation Summary](../CROSS_CONTRACT_IMPLEMENTATION.md)

## Examples

See the trading contract for production examples:
- `contracts/trading/src/cross_contract_example.rs`

## Contributing

When adding new shared utilities:

1. Follow existing patterns and conventions
2. Add comprehensive documentation
3. Include unit tests
4. Update this README
5. Add examples in the guide

## License

See the main project LICENSE file.
