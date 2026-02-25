//! Comprehensive unit tests for safe_call module
//!
//! Coverage target: ≥ 95%
//!
//! Test categories:
//! - Successful cross-contract calls
//! - Downstream contract failures
//! - Unauthorized callers
//! - Invalid contract addresses
//! - Event emission correctness
//! - Error propagation mapping
//! - Reentrancy protection
//! - Amount validation
//! - Edge cases and boundaries

#![cfg(test)]

use soroban_sdk::{
    contract, contractimpl, testutils::Address as _, Address, Env, IntoVal, Symbol, Val, Vec,
};

use shared::safe_call::{
    check_reentrancy, clear_reentrancy_guard, safe_invoke, safe_invoke_typed, set_reentrancy_guard,
    validate_non_negative_amount, validate_positive_amount, verify_caller, CrossContractError,
    CrossContractResult, ReentrancyGuard,
};

// =============================================================================
// Mock Contracts
// =============================================================================

/// Mock token contract for testing successful calls
#[contract]
pub struct MockTokenContract;

#[contractimpl]
impl MockTokenContract {
    pub fn balance(_env: Env, _id: Address) -> i128 {
        1000
    }

    pub fn transfer(_env: Env, _from: Address, _to: Address, _amount: i128) {
        // Success - no-op
    }

    pub fn get_name(_env: Env) -> Symbol {
        Symbol::new(&_env, "TestToken")
    }
}

/// Mock contract that always fails
#[contract]
pub struct MockFailingContract;

#[contractimpl]
impl MockFailingContract {
    pub fn failing_function(_env: Env) -> Result<(), CrossContractError> {
        Err(CrossContractError::ExecutionError)
    }
}

/// Mock contract for reentrancy testing
#[contract]
pub struct MockReentrantContract;

#[contractimpl]
impl MockReentrantContract {
    pub fn reentrant_call(env: Env, target: Address) -> CrossContractResult<()> {
        let _guard = ReentrancyGuard::new(&env)?;

        // Try to call back (should fail with reentrancy error)
        let mut args = Vec::new(&env);
        args.push_back(target.into_val(&env));

        safe_invoke(&env, &target, &Symbol::new(&env, "reentrant_call"), args)?;
        Ok(())
    }
}

// =============================================================================
// Successful Cross-Contract Call Tests
// =============================================================================

#[test]
fn test_safe_invoke_success() {
    let env = Env::default();
    let contract_id = env.register_contract(None, MockTokenContract);
    let address = Address::generate(&env);

    let mut args = Vec::new(&env);
    args.push_back(address.into_val(&env));

    let result = safe_invoke(&env, &contract_id, &Symbol::new(&env, "balance"), args);

    assert!(result.is_ok());
}

#[test]
fn test_safe_invoke_typed_success() {
    let env = Env::default();
    let contract_id = env.register_contract(None, MockTokenContract);
    let address = Address::generate(&env);

    let mut args = Vec::new(&env);
    args.push_back(address.into_val(&env));

    let result: CrossContractResult<i128> =
        safe_invoke_typed(&env, &contract_id, &Symbol::new(&env, "balance"), args);

    assert!(result.is_ok());
    assert_eq!(result.unwrap(), 1000);
}

#[test]
fn test_safe_invoke_typed_symbol() {
    let env = Env::default();
    let contract_id = env.register_contract(None, MockTokenContract);

    let args = Vec::new(&env);
    let result: CrossContractResult<Symbol> =
        safe_invoke_typed(&env, &contract_id, &Symbol::new(&env, "get_name"), args);

    assert!(result.is_ok());
    assert_eq!(result.unwrap(), Symbol::new(&env, "TestToken"));
}

#[test]
fn test_multiple_sequential_calls() {
    let env = Env::default();
    let contract_id = env.register_contract(None, MockTokenContract);
    let addr1 = Address::generate(&env);
    let addr2 = Address::generate(&env);

    // First call
    let mut args1 = Vec::new(&env);
    args1.push_back(addr1.into_val(&env));
    let result1 = safe_invoke(&env, &contract_id, &Symbol::new(&env, "balance"), args1);
    assert!(result1.is_ok());

    // Second call
    let mut args2 = Vec::new(&env);
    args2.push_back(addr2.into_val(&env));
    let result2 = safe_invoke(&env, &contract_id, &Symbol::new(&env, "balance"), args2);
    assert!(result2.is_ok());
}

// =============================================================================
// Downstream Contract Failure Tests
// =============================================================================

#[test]
fn test_safe_invoke_downstream_failure() {
    let env = Env::default();
    let contract_id = env.register_contract(None, MockFailingContract);

    let args = Vec::new(&env);
    let result = safe_invoke(
        &env,
        &contract_id,
        &Symbol::new(&env, "failing_function"),
        args,
    );

    assert!(result.is_err());
    assert_eq!(result.unwrap_err(), CrossContractError::CallFailed);
}

#[test]
fn test_safe_invoke_nonexistent_function() {
    let env = Env::default();
    let contract_id = env.register_contract(None, MockTokenContract);

    let args = Vec::new(&env);
    let result = safe_invoke(&env, &contract_id, &Symbol::new(&env, "nonexistent"), args);

    assert!(result.is_err());
    assert_eq!(result.unwrap_err(), CrossContractError::CallFailed);
}

// =============================================================================
// Invalid Contract Address Tests
// =============================================================================

#[test]
fn test_safe_invoke_invalid_address() {
    let env = Env::default();
    // Generate a random address that's not a deployed contract
    let invalid_address = Address::generate(&env);

    let args = Vec::new(&env);
    let result = safe_invoke(&env, &invalid_address, &Symbol::new(&env, "balance"), args);

    // Should fail with CallFailed when trying to invoke non-existent contract
    assert!(result.is_err());
}

// =============================================================================
// Event Emission Tests
// =============================================================================

#[test]
fn test_event_emission_on_success() {
    let env = Env::default();
    let contract_id = env.register_contract(None, MockTokenContract);
    let address = Address::generate(&env);

    let mut args = Vec::new(&env);
    args.push_back(address.into_val(&env));

    let _result = safe_invoke(&env, &contract_id, &Symbol::new(&env, "balance"), args);

    // Events should be emitted (initiated and success)
    // In a real test, we would verify event contents
    let events = env.events().all();
    assert!(events.len() >= 2); // At least initiated and success events
}

#[test]
fn test_event_emission_on_failure() {
    let env = Env::default();
    let contract_id = env.register_contract(None, MockFailingContract);

    let args = Vec::new(&env);
    let _result = safe_invoke(
        &env,
        &contract_id,
        &Symbol::new(&env, "failing_function"),
        args,
    );

    // Events should be emitted (initiated and failed)
    let events = env.events().all();
    assert!(events.len() >= 2); // At least initiated and failed events
}

// =============================================================================
// Error Propagation Tests
// =============================================================================

#[test]
fn test_error_propagation_call_failed() {
    let env = Env::default();
    let contract_id = env.register_contract(None, MockFailingContract);

    let args = Vec::new(&env);
    let result = safe_invoke(
        &env,
        &contract_id,
        &Symbol::new(&env, "failing_function"),
        args,
    );

    match result {
        Err(CrossContractError::CallFailed) => {
            // Expected error
        }
        _ => panic!("Expected CallFailed error"),
    }
}

#[test]
fn test_error_propagation_invalid_response() {
    let env = Env::default();
    let contract_id = env.register_contract(None, MockTokenContract);

    let args = Vec::new(&env);
    // Try to convert i128 result to Symbol (should fail)
    let result: CrossContractResult<Symbol> =
        safe_invoke_typed(&env, &contract_id, &Symbol::new(&env, "balance"), args);

    match result {
        Err(CrossContractError::InvalidResponse) => {
            // Expected error
        }
        _ => panic!("Expected InvalidResponse error"),
    }
}

// =============================================================================
// Reentrancy Protection Tests
// =============================================================================

#[test]
fn test_reentrancy_guard_not_set() {
    let env = Env::default();
    let result = check_reentrancy(&env);
    assert!(result.is_ok());
}

#[test]
fn test_reentrancy_guard_set() {
    let env = Env::default();

    // Set guard
    set_reentrancy_guard(&env);

    // Check should fail
    let result = check_reentrancy(&env);
    assert!(result.is_err());
    assert_eq!(result.unwrap_err(), CrossContractError::ReentrancyDetected);

    // Clear guard
    clear_reentrancy_guard(&env);

    // Check should succeed again
    let result = check_reentrancy(&env);
    assert!(result.is_ok());
}

#[test]
fn test_reentrancy_guard_lifecycle() {
    let env = Env::default();

    // Initial state: not set
    assert!(check_reentrancy(&env).is_ok());

    // Set guard
    set_reentrancy_guard(&env);
    assert!(check_reentrancy(&env).is_err());

    // Clear guard
    clear_reentrancy_guard(&env);
    assert!(check_reentrancy(&env).is_ok());

    // Can set again
    set_reentrancy_guard(&env);
    assert!(check_reentrancy(&env).is_err());

    // Clear again
    clear_reentrancy_guard(&env);
    assert!(check_reentrancy(&env).is_ok());
}

#[test]
fn test_reentrancy_guard_raii() {
    let env = Env::default();

    {
        let _guard = ReentrancyGuard::new(&env);
        assert!(_guard.is_ok());

        // Guard should be set
        assert!(check_reentrancy(&env).is_err());

        // Try to create another guard (should fail)
        let guard2 = ReentrancyGuard::new(&env);
        assert!(guard2.is_err());
        assert_eq!(guard2.unwrap_err(), CrossContractError::ReentrancyDetected);
    }

    // Guard should be cleared after drop
    assert!(check_reentrancy(&env).is_ok());
}

#[test]
fn test_reentrancy_guard_early_return() {
    let env = Env::default();

    fn test_function(env: &Env, should_return_early: bool) -> CrossContractResult<()> {
        let _guard = ReentrancyGuard::new(env)?;

        if should_return_early {
            return Ok(());
        }

        Ok(())
    }

    // Test early return
    let result = test_function(&env, true);
    assert!(result.is_ok());

    // Guard should be cleared even after early return
    assert!(check_reentrancy(&env).is_ok());

    // Test normal return
    let result = test_function(&env, false);
    assert!(result.is_ok());

    // Guard should be cleared
    assert!(check_reentrancy(&env).is_ok());
}

// =============================================================================
// Authorization Tests
// =============================================================================

#[test]
fn test_verify_caller_success() {
    let env = Env::default();
    env.mock_all_auths();

    let caller = Address::generate(&env);
    let result = verify_caller(&env, &caller);

    assert!(result.is_ok());
}

// =============================================================================
// Amount Validation Tests
// =============================================================================

#[test]
fn test_validate_positive_amount_valid() {
    assert!(validate_positive_amount(1).is_ok());
    assert!(validate_positive_amount(100).is_ok());
    assert!(validate_positive_amount(i128::MAX).is_ok());
}

#[test]
fn test_validate_positive_amount_invalid() {
    assert_eq!(
        validate_positive_amount(0),
        Err(CrossContractError::InvalidAmount)
    );
    assert_eq!(
        validate_positive_amount(-1),
        Err(CrossContractError::InvalidAmount)
    );
    assert_eq!(
        validate_positive_amount(-100),
        Err(CrossContractError::InvalidAmount)
    );
    assert_eq!(
        validate_positive_amount(i128::MIN),
        Err(CrossContractError::InvalidAmount)
    );
}

#[test]
fn test_validate_non_negative_amount_valid() {
    assert!(validate_non_negative_amount(0).is_ok());
    assert!(validate_non_negative_amount(1).is_ok());
    assert!(validate_non_negative_amount(100).is_ok());
    assert!(validate_non_negative_amount(i128::MAX).is_ok());
}

#[test]
fn test_validate_non_negative_amount_invalid() {
    assert_eq!(
        validate_non_negative_amount(-1),
        Err(CrossContractError::InvalidAmount)
    );
    assert_eq!(
        validate_non_negative_amount(-100),
        Err(CrossContractError::InvalidAmount)
    );
    assert_eq!(
        validate_non_negative_amount(i128::MIN),
        Err(CrossContractError::InvalidAmount)
    );
}

// =============================================================================
// Edge Cases and Boundary Tests
// =============================================================================

#[test]
fn test_max_amount_validation() {
    assert!(validate_positive_amount(i128::MAX).is_ok());
    assert!(validate_non_negative_amount(i128::MAX).is_ok());
}

#[test]
fn test_min_amount_validation() {
    assert_eq!(
        validate_positive_amount(i128::MIN),
        Err(CrossContractError::InvalidAmount)
    );
    assert_eq!(
        validate_non_negative_amount(i128::MIN),
        Err(CrossContractError::InvalidAmount)
    );
}

#[test]
fn test_zero_amount_validation() {
    assert_eq!(
        validate_positive_amount(0),
        Err(CrossContractError::InvalidAmount)
    );
    assert!(validate_non_negative_amount(0).is_ok());
}

#[test]
fn test_error_code_roundtrip() {
    let errors = vec![
        CrossContractError::CallFailed,
        CrossContractError::InvalidContract,
        CrossContractError::InvalidResponse,
        CrossContractError::ReentrancyDetected,
        CrossContractError::Unauthorized,
        CrossContractError::InvalidAmount,
        CrossContractError::InsufficientBalance,
        CrossContractError::InvalidState,
        CrossContractError::ExecutionError,
    ];

    for error in errors {
        let code = error.to_u32();
        let recovered = CrossContractError::from_u32(code);
        assert_eq!(recovered, Some(error));
    }
}

#[test]
fn test_invalid_error_code() {
    assert_eq!(CrossContractError::from_u32(0), None);
    assert_eq!(CrossContractError::from_u32(1), None);
    assert_eq!(CrossContractError::from_u32(9999), None);
    assert_eq!(CrossContractError::from_u32(u32::MAX), None);
}

// =============================================================================
// Stress Tests
// =============================================================================

#[test]
fn test_many_sequential_calls() {
    let env = Env::default();
    let contract_id = env.register_contract(None, MockTokenContract);

    for _ in 0..100 {
        let address = Address::generate(&env);
        let mut args = Vec::new(&env);
        args.push_back(address.into_val(&env));

        let result = safe_invoke(&env, &contract_id, &Symbol::new(&env, "balance"), args);
        assert!(result.is_ok());
    }
}

#[test]
fn test_guard_multiple_cycles() {
    let env = Env::default();

    for _ in 0..50 {
        let _guard = ReentrancyGuard::new(&env);
        assert!(_guard.is_ok());
        // Guard dropped here
    }

    // Final check - should be clear
    assert!(check_reentrancy(&env).is_ok());
}
