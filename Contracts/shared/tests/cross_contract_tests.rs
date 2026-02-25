//! Tests for cross-contract communication patterns

#![cfg(test)]

use soroban_sdk::{
    contract, contractimpl, testutils::Address as _, Address, Env, IntoVal, Symbol, Val, Vec,
};

// =============================================================================
// Mock Contracts for Testing
// =============================================================================

/// Mock token contract for testing
#[contract]
pub struct MockTokenContract;

#[contractimpl]
impl MockTokenContract {
    pub fn transfer(_env: Env, _from: Address, _to: Address, _amount: i128) {
        // Success - no-op for testing
    }

    pub fn transfer_from(
        _env: Env,
        _spender: Address,
        _from: Address,
        _to: Address,
        _amount: i128,
    ) {
        // Success - no-op for testing
    }

    pub fn balance(_env: Env, _id: Address) -> i128 {
        1000
    }
}

/// Mock contract that accepts callbacks
#[contract]
pub struct MockCallbackContract;

#[contractimpl]
impl MockCallbackContract {
    pub fn on_success(_env: Env, _caller: Address, _data: Val) {
        // Success - no-op for testing
    }

    pub fn on_failure(_env: Env, _caller: Address, _error_code: u32) {
        // Success - no-op for testing
    }
}

// =============================================================================
// Basic Functionality Tests
// =============================================================================

#[test]
fn test_mock_token_transfer() {
    let env = Env::default();
    let contract_id = env.register_contract(None, MockTokenContract);
    let client = MockTokenContractClient::new(&env, &contract_id);

    let from = Address::generate(&env);
    let to = Address::generate(&env);

    // Should not panic
    client.transfer(&from, &to, &100);
}

#[test]
fn test_mock_token_balance() {
    let env = Env::default();
    let contract_id = env.register_contract(None, MockTokenContract);
    let client = MockTokenContractClient::new(&env, &contract_id);

    let address = Address::generate(&env);
    let balance = client.balance(&address);

    assert_eq!(balance, 1000);
}

#[test]
fn test_mock_callback() {
    let env = Env::default();
    let contract_id = env.register_contract(None, MockCallbackContract);
    let client = MockCallbackContractClient::new(&env, &contract_id);

    let caller = Address::generate(&env);
    let data = 42i128.into_val(&env);

    // Should not panic
    client.on_success(&caller, &data);
}

// =============================================================================
// Cross-Contract Pattern Tests
// =============================================================================

#[test]
fn test_cross_contract_token_operations() {
    let env = Env::default();
    let token_id = env.register_contract(None, MockTokenContract);
    let client = MockTokenContractClient::new(&env, &token_id);

    let from = Address::generate(&env);
    let to = Address::generate(&env);

    // Test transfer
    client.transfer(&from, &to, &100);

    // Test balance query
    let balance = client.balance(&from);
    assert_eq!(balance, 1000);
}

#[test]
fn test_multiple_sequential_operations() {
    let env = Env::default();
    let token_id = env.register_contract(None, MockTokenContract);
    let client = MockTokenContractClient::new(&env, &token_id);

    let addr1 = Address::generate(&env);
    let addr2 = Address::generate(&env);
    let addr3 = Address::generate(&env);

    // Multiple transfers
    client.transfer(&addr1, &addr2, &50);
    client.transfer(&addr2, &addr3, &30);

    // Check balance
    let balance = client.balance(&addr3);
    assert_eq!(balance, 1000);
}

#[test]
fn test_callback_workflow() {
    let env = Env::default();
    let token_id = env.register_contract(None, MockTokenContract);
    let callback_id = env.register_contract(None, MockCallbackContract);

    let token_client = MockTokenContractClient::new(&env, &token_id);
    let callback_client = MockCallbackContractClient::new(&env, &callback_id);

    let from = Address::generate(&env);
    let to = Address::generate(&env);

    // Transfer tokens
    token_client.transfer(&from, &to, &100);

    // Notify via callback
    let data = 100i128.into_val(&env);
    callback_client.on_success(&from, &data);
}

// =============================================================================
// Integration Tests
// =============================================================================

#[test]
fn test_complete_transfer_workflow() {
    let env = Env::default();
    let token_id = env.register_contract(None, MockTokenContract);
    let client = MockTokenContractClient::new(&env, &token_id);

    let from = Address::generate(&env);
    let to = Address::generate(&env);
    let fee_recipient = Address::generate(&env);

    // Check initial balance
    let balance = client.balance(&from);
    assert_eq!(balance, 1000);

    // Collect fee
    client.transfer(&from, &fee_recipient, &10);

    // Transfer remaining amount
    client.transfer(&from, &to, &90);
}

#[test]
fn test_transfer_with_callback_notification() {
    let env = Env::default();
    let token_id = env.register_contract(None, MockTokenContract);
    let callback_id = env.register_contract(None, MockCallbackContract);

    let token_client = MockTokenContractClient::new(&env, &token_id);
    let callback_client = MockCallbackContractClient::new(&env, &callback_id);

    let from = Address::generate(&env);
    let to = Address::generate(&env);

    // Transfer tokens
    token_client.transfer(&from, &to, &100);

    // Notify via callback
    let data = 100i128.into_val(&env);
    callback_client.on_success(&from, &data);
}

#[test]
fn test_batch_operations() {
    let env = Env::default();
    let token_id = env.register_contract(None, MockTokenContract);
    let client = MockTokenContractClient::new(&env, &token_id);

    let sender = Address::generate(&env);

    // Batch transfers to multiple recipients
    for _ in 0..5 {
        let recipient = Address::generate(&env);
        client.transfer(&sender, &recipient, &20);
    }

    // Verify sender balance (mock always returns 1000)
    let balance = client.balance(&sender);
    assert_eq!(balance, 1000);
}
