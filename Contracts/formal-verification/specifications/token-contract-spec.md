# Token Contract Formal Specifications

This document defines the formal specifications and invariants for the Stellara Token contract.

## 🔐 Security Invariants

### 1. Token Conservation Invariant
```
∀ addresses a: 
    sum(balance_of(a)) + total_burned = initial_total_supply + total_minted
```

### 2. Authorization Invariant
```
∀ function f requiring auth:
    caller ∈ authorized_addresses ∨ caller = admin
```

### 3. Allowance Consistency Invariant
```
∀ (owner, spender):
    allowance[owner][spender] ≥ 0
    allowance[owner][spender] ≤ balance_of(owner)
```

### 4. Total Supply Bounds
```
0 ≤ total_supply ≤ MAX_TOKEN_SUPPLY
total_supply = sum_of_all_balances + burned_tokens
```

## 🎯 Critical Function Specifications

### 1. Transfer Function
**Function**: `transfer(from: Address, to: Address, amount: i128)`

**Preconditions**:
- `from` is authorized
- `amount ≥ 0`
- `balance_of(from) ≥ amount`
- `from ≠ to` (optional optimization)

**Postconditions**:
- `balance_of(from) = balance_of(from)_old - amount`
- `balance_of(to) = balance_of(to)_old + amount`
- `total_supply` remains unchanged
- Event `transfer(from, to, amount)` is emitted

**Safety Properties**:
- No overflow/underflow in balance calculations
- No unauthorized transfers
- State consistency maintained

### 2. Approve Function
**Function**: `approve(from: Address, spender: Address, amount: i128, expiration: u32)`

**Preconditions**:
- `from` is authorized
- `amount ≥ 0`
- `expiration ≥ current_ledger` (if amount > 0)

**Postconditions**:
- `allowance[from][spender] = amount`
- `allowance_expiration[from][spender] = expiration`
- Event `approve(from, spender, amount, expiration)` is emitted

**Safety Properties**:
- No negative allowances
- Proper expiration handling
- Authorization enforced

### 3. Transfer From Function
**Function**: `transfer_from(spender: Address, from: Address, to: Address, amount: i128)`

**Preconditions**:
- `spender` is authorized
- `from` is authorized
- `amount ≥ 0`
- `allowance[from][spender] ≥ amount`
- `allowance_expiration[from][spender] ≥ current_ledger`
- `balance_of(from) ≥ amount`

**Postconditions**:
- `balance_of(from) = balance_of(from)_old - amount`
- `balance_of(to) = balance_of(to)_old + amount`
- `allowance[from][spender] = allowance[from][spender]_old - amount`
- Events `transfer(from, to, amount)` and allowance update are emitted

**Safety Properties**:
- Allowance cannot be exceeded
- Expiration properly checked
- Double spending prevention

### 4. Mint Function
**Function**: `mint(to: Address, amount: i128)`

**Preconditions**:
- Caller is admin
- `amount ≥ 0`
- `total_supply + amount ≤ MAX_TOKEN_SUPPLY`

**Postconditions**:
- `balance_of(to) = balance_of(to)_old + amount`
- `total_supply = total_supply_old + amount`
- Event `mint(admin, to, amount)` is emitted

**Safety Properties**:
- Only admin can mint
- No overflow in total supply
- Supply cap enforcement

### 5. Burn Function
**Function**: `burn(from: Address, amount: i128)`

**Preconditions**:
- `from` is authorized
- `amount ≥ 0`
- `balance_of(from) ≥ amount`

**Postconditions**:
- `balance_of(from) = balance_of(from)_old - amount`
- `total_supply = total_supply_old - amount`
- Event `burn(from, amount)` is emitted

**Safety Properties**:
- No underflow in balances
- No underflow in total supply
- Proper authorization

### 6. Clawback Function
**Function**: `clawback(from: Address, amount: i128)`

**Preconditions**:
- Caller is admin
- `amount ≥ 0`
- `balance_of(from) ≥ amount`

**Postconditions**:
- `balance_of(from) = balance_of(from)_old - amount`
- `total_supply = total_supply_old - amount`
- Event `clawback(admin, from, amount)` is emitted

**Safety Properties**:
- Only admin can clawback
- No underflow conditions
- State consistency

### 7. Set Authorized Function
**Function**: `set_authorized(id: Address, authorize: bool)`

**Preconditions**:
- Caller is admin

**Postconditions**:
- `authorized[id] = authorize`
- Event `set_authorized(id, authorize)` is emitted

**Safety Properties**:
- Only admin can modify authorization
- Boolean state properly set

## 📊 Verification Properties

### Arithmetic Safety
- All arithmetic operations are checked for overflow/underflow
- `checked_add`, `checked_sub` used appropriately
- No silent wrapping behavior

### State Consistency
- All state changes are atomic
- Intermediate states are never exposed
- Invariants hold after each operation

### Access Control
- Authorization checks are performed before state changes
- Admin-only functions properly restricted
- No privilege escalation possible

### Event Emission
- All state-changing operations emit appropriate events
- Event data matches actual state changes
- No events emitted for failed operations

## 🧪 Test Scenarios

### Property-Based Tests
1. **Conservation Property**: Total tokens remain constant across transfers
2. **Authorization Property**: Unauthorized operations fail
3. **Bounds Property**: Balances and allowances stay within bounds
4. **Idempotency**: Repeated operations have consistent effects

### Edge Cases
- Zero amount transfers
- Maximum value amounts
- Self-transfers
- Expired allowances
- Simultaneous operations

### Attack Vectors
- Reentrancy attempts
- Race conditions
- Authorization bypass
- Integer overflow/underflow
- Denial of service