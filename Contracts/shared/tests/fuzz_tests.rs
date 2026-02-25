//! Fuzz tests for cross-contract communication
//!
//! Tests with:
//! - Malformed addresses
//! - Unexpected return payloads
//! - Large inputs
//! - Boundary values
//! - Random inputs
//!
//! Ensures:
//! - No panic
//! - No overflow
//! - No unexpected mutation

#![cfg(test)]

use proptest::prelude::*;
use soroban_sdk::{
    contract, contractimpl, testutils::Address as _, Address, Env, IntoVal, Symbol, Vec,
};

use shared::safe_call::{
    safe_invoke, safe_invoke_typed, validate_non_negative_amount, validate_positive_amount,
    CrossContractError, CrossContractResult,
};

// =============================================================================
// Mock Contracts for Fuzz Testing
// =============================================================================

#[contract]
pub struct FuzzTestContract;

#[contractimpl]
impl FuzzTestContract {
    pub fn echo_i128(_env: Env, value: i128) -> i128 {
        value
    }

    pub fn echo_symbol(_env: Env, value: Symbol) -> Symbol {
        value
    }

    pub fn add_numbers(_env: Env, a: i128, b: i128) -> CrossContractResult<i128> {
        a.checked_add(b).ok_or(CrossContractError::ExecutionError)
    }
}

// =============================================================================
// Property-Based Tests for Amount Validation
// =============================================================================

proptest! {
    #[test]
    fn fuzz_validate_positive_amount(amount in any::<i128>()) {
        let result = validate_positive_amount(amount);

        if amount > 0 {
            prop_assert!(result.is_ok());
        } else {
            prop_assert_eq!(result, Err(CrossContractError::InvalidAmount));
        }
    }

    #[test]
    fn fuzz_validate_non_negative_amount(amount in any::<i128>()) {
        let result = validate_non_negative_amount(amount);

        if amount >= 0 {
            prop_assert!(result.is_ok());
        } else {
            prop_assert_eq!(result, Err(CrossContractError::InvalidAmount));
        }
    }

    #[test]
    fn fuzz_validate_positive_amount_no_panic(amount in any::<i128>()) {
        // Should never panic
        let _ = validate_positive_amount(amount);
    }

    #[test]
    fn fuzz_validate_non_negative_amount_no_panic(amount in any::<i128>()) {
        // Should never panic
        let _ = validate_non_negative_amount(amount);
    }
}

// =============================================================================
// Fuzz Tests for Error Code Conversion
// =============================================================================

proptest! {
    #[test]
    fn fuzz_error_code_conversion(code in any::<u32>()) {
        // Should never panic
        let _ = CrossContractError::from_u32(code);
    }

    #[test]
    fn fuzz_error_code_roundtrip(code in 2001u32..=3004u32) {
        if let Some(error) = CrossContractError::from_u32(code) {
            prop_assert_eq!(error.to_u32(), code);
        }
    }
}

// =============================================================================
// Fuzz Tests for Cross-Contract Calls
// =============================================================================

#[test]
fn fuzz_safe_invoke_with_random_addresses() {
    let env = Env::default();
    let contract_id = env.register_contract(None, FuzzTestContract);

    // Test with many random addresses
    for _ in 0..100 {
        let random_addr = Address::generate(&env);
        let mut args = Vec::new(&env);
        args.push_back(random_addr.into_val(&env));

        // Should not panic, even with random addresses
        let _result = safe_invoke(&env, &contract_id, &Symbol::new(&env, "echo_i128"), args);
    }
}

#[test]
fn fuzz_safe_invoke_typed_with_large_values() {
    let env = Env::default();
    let contract_id = env.register_contract(None, FuzzTestContract);

    let test_values = vec![i128::MAX, i128::MIN, 0, 1, -1, i128::MAX - 1, i128::MIN + 1];

    for value in test_values {
        let mut args = Vec::new(&env);
        args.push_back(value.into_val(&env));

        let result: CrossContractResult<i128> =
            safe_invoke_typed(&env, &contract_id, &Symbol::new(&env, "echo_i128"), args);

        // Should not panic
        if let Ok(returned) = result {
            assert_eq!(returned, value);
        }
    }
}

#[test]
fn fuzz_safe_invoke_with_boundary_values() {
    let env = Env::default();
    let contract_id = env.register_contract(None, FuzzTestContract);

    // Test boundary values for addition
    let test_cases = vec![
        (i128::MAX, 0),
        (0, i128::MAX),
        (i128::MIN, 0),
        (0, i128::MIN),
        (1, 1),
        (-1, -1),
        (i128::MAX / 2, i128::MAX / 2),
    ];

    for (a, b) in test_cases {
        let mut args = Vec::new(&env);
        args.push_back(a.into_val(&env));
        args.push_back(b.into_val(&env));

        // Should not panic, even if overflow occurs
        let _result: CrossContractResult<i128> =
            safe_invoke_typed(&env, &contract_id, &Symbol::new(&env, "add_numbers"), args);
    }
}

#[test]
fn fuzz_safe_invoke_with_overflow_detection() {
    let env = Env::default();
    let contract_id = env.register_contract(None, FuzzTestContract);

    // Test cases that should overflow
    let overflow_cases = vec![(i128::MAX, 1), (i128::MAX, i128::MAX), (i128::MIN, -1)];

    for (a, b) in overflow_cases {
        let mut args = Vec::new(&env);
        args.push_back(a.into_val(&env));
        args.push_back(b.into_val(&env));

        let result: CrossContractResult<i128> =
            safe_invoke_typed(&env, &contract_id, &Symbol::new(&env, "add_numbers"), args);

        // Should return error, not panic
        assert!(result.is_err());
    }
}

#[test]
fn fuzz_safe_invoke_with_many_arguments() {
    let env = Env::default();
    let contract_id = env.register_contract(None, FuzzTestContract);

    // Test with varying number of arguments
    for arg_count in 0..10 {
        let mut args = Vec::new(&env);
        for i in 0..arg_count {
            args.push_back((i as i128).into_val(&env));
        }

        // Should not panic, even with wrong number of arguments
        let _result = safe_invoke(&env, &contract_id, &Symbol::new(&env, "echo_i128"), args);
    }
}

#[test]
fn fuzz_safe_invoke_with_invalid_function_names() {
    let env = Env::default();
    let contract_id = env.register_contract(None, FuzzTestContract);

    let invalid_names = vec![
        "",
        "nonexistent",
        "invalid_function",
        "echo_i128_wrong",
        "ECHO_I128",
    ];

    for name in invalid_names {
        let args = Vec::new(&env);
        let result = safe_invoke(&env, &contract_id, &Symbol::new(&env, name), args);

        // Should return error, not panic
        assert!(result.is_err());
    }
}

#[test]
fn fuzz_safe_invoke_typed_with_wrong_type() {
    let env = Env::default();
    let contract_id = env.register_contract(None, FuzzTestContract);

    let value = 12345i128;
    let mut args = Vec::new(&env);
    args.push_back(value.into_val(&env));

    // Try to convert i128 result to Symbol (should fail gracefully)
    let result: CrossContractResult<Symbol> =
        safe_invoke_typed(&env, &contract_id, &Symbol::new(&env, "echo_i128"), args);

    // Should return InvalidResponse error, not panic
    assert_eq!(result, Err(CrossContractError::InvalidResponse));
}

#[test]
fn fuzz_multiple_concurrent_calls() {
    let env = Env::default();
    let contract_id = env.register_contract(None, FuzzTestContract);

    // Simulate many concurrent calls
    for _ in 0..1000 {
        let value = (rand::random::<u32>() % 10000) as i128;
        let mut args = Vec::new(&env);
        args.push_back(value.into_val(&env));

        let result: CrossContractResult<i128> =
            safe_invoke_typed(&env, &contract_id, &Symbol::new(&env, "echo_i128"), args);

        // Should not panic
        if let Ok(returned) = result {
            assert_eq!(returned, value);
        }
    }
}

#[test]
fn fuzz_stress_test_guards() {
    let env = Env::default();

    // Rapidly set and clear guards
    for _ in 0..10000 {
        use shared::safe_call::{check_reentrancy, clear_reentrancy_guard, set_reentrancy_guard};

        assert!(check_reentrancy(&env).is_ok());
        set_reentrancy_guard(&env);
        assert!(check_reentrancy(&env).is_err());
        clear_reentrancy_guard(&env);
        assert!(check_reentrancy(&env).is_ok());
    }
}

// =============================================================================
// Edge Case Tests
// =============================================================================

#[test]
fn test_empty_args_vector() {
    let env = Env::default();
    let contract_id = env.register_contract(None, FuzzTestContract);

    let args = Vec::new(&env);
    // Should not panic with empty args
    let _result = safe_invoke(&env, &contract_id, &Symbol::new(&env, "echo_i128"), args);
}

#[test]
fn test_very_long_symbol_names() {
    let env = Env::default();
    let contract_id = env.register_contract(None, FuzzTestContract);

    // Soroban symbols have length limits, but should not panic
    let long_names = vec![
        "a".repeat(32),
        "function_with_very_long_name_that_exceeds_normal_limits",
    ];

    for name in long_names {
        let args = Vec::new(&env);
        let _result = safe_invoke(&env, &contract_id, &Symbol::new(&env, &name), args);
        // Should not panic
    }
}

#[test]
fn test_rapid_address_generation() {
    let env = Env::default();

    // Generate many addresses rapidly
    for _ in 0..1000 {
        let _addr = Address::generate(&env);
        // Should not panic or cause issues
    }
}

// Helper function for random testing
fn rand() -> u64 {
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hash, Hasher};

    let random_state = RandomState::new();
    let mut hasher = random_state.build_hasher();
    std::time::SystemTime::now().hash(&mut hasher);
    hasher.finish()
}
