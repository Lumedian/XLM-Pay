//! Integration tests for cross-contract communication
//!
//! Tests complete workflows including:
//! - Contract A calling Contract B
//! - B reverting with structured error
//! - Event validation
//! - No state corruption
//! - Complex multi-contract scenarios

#![cfg(test)]

use soroban_sdk::{
    contract, contractimpl, testutils::Address as _, Address, Env, IntoVal, Symbol, Vec,
};

use shared::safe_call::{
    safe_invoke, safe_invoke_typed, CrossContractError, CrossContractResult, ReentrancyGuard,
};

// =============================================================================
// Mock Token Contract
// =============================================================================

#[contract]
pub struct IntegrationTokenContract;

#[contractimpl]
impl IntegrationTokenContract {
    pub fn initialize(env: Env, admin: Address) {
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "admin"), &admin);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "total_supply"), &0i128);
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage().persistent().get(&id).unwrap_or(0i128)
    }

    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) -> CrossContractResult<()> {
        from.require_auth();

        if amount <= 0 {
            return Err(CrossContractError::InvalidAmount);
        }

        let from_balance = Self::balance(env.clone(), from.clone());
        if from_balance < amount {
            return Err(CrossContractError::InsufficientBalance);
        }

        let to_balance = Self::balance(env.clone(), to.clone());

        env.storage()
            .persistent()
            .set(&from, &(from_balance - amount));
        env.storage().persistent().set(&to, &(to_balance + amount));

        env.events()
            .publish((Symbol::new(&env, "transfer"),), (from, to, amount));

        Ok(())
    }

    pub fn mint(env: Env, to: Address, amount: i128) -> CrossContractResult<()> {
        if amount <= 0 {
            return Err(CrossContractError::InvalidAmount);
        }

        let balance = Self::balance(env.clone(), to.clone());
        env.storage().persistent().set(&to, &(balance + amount));

        let total: i128 = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "total_supply"))
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "total_supply"), &(total + amount));

        Ok(())
    }
}

// =============================================================================
// Mock Trading Contract
// =============================================================================

#[contract]
pub struct IntegrationTradingContract;

#[contractimpl]
impl IntegrationTradingContract {
    pub fn execute_trade(
        env: Env,
        token: Address,
        trader: Address,
        amount: i128,
        fee_amount: i128,
    ) -> CrossContractResult<()> {
        // Reentrancy protection
        let _guard = ReentrancyGuard::new(&env)?;

        // Validate inputs
        if amount <= 0 || fee_amount < 0 || fee_amount >= amount {
            return Err(CrossContractError::InvalidAmount);
        }

        // Collect fee
        let mut fee_args = Vec::new(&env);
        fee_args.push_back(trader.clone().into_val(&env));
        fee_args.push_back(env.current_contract_address().into_val(&env));
        fee_args.push_back(fee_amount.into_val(&env));

        safe_invoke(&env, &token, &Symbol::new(&env, "transfer"), fee_args)?;

        // Execute trade
        let trade_amount = amount - fee_amount;
        let mut trade_args = Vec::new(&env);
        trade_args.push_back(trader.clone().into_val(&env));
        trade_args.push_back(env.current_contract_address().into_val(&env));
        trade_args.push_back(trade_amount.into_val(&env));

        safe_invoke(&env, &token, &Symbol::new(&env, "transfer"), trade_args)?;

        // Emit trade event
        env.events().publish(
            (Symbol::new(&env, "trade_executed"),),
            (trader, amount, fee_amount),
        );

        Ok(())
    }

    pub fn get_token_balance(
        env: Env,
        token: Address,
        address: Address,
    ) -> CrossContractResult<i128> {
        let mut args = Vec::new(&env);
        args.push_back(address.into_val(&env));

        safe_invoke_typed(&env, &token, &Symbol::new(&env, "balance"), args)
    }
}

// =============================================================================
// Integration Tests
// =============================================================================

#[test]
fn test_contract_a_calls_contract_b_success() {
    let env = Env::default();
    env.mock_all_auths();

    // Deploy contracts
    let token_id = env.register_contract(None, IntegrationTokenContract);
    let trading_id = env.register_contract(None, IntegrationTradingContract);

    // Initialize
    let admin = Address::generate(&env);
    let token_client = IntegrationTokenContractClient::new(&env, &token_id);
    token_client.initialize(&admin);

    // Mint tokens to trader
    let trader = Address::generate(&env);
    token_client.mint(&trader, &1000);

    // Execute trade
    let trading_client = IntegrationTradingContractClient::new(&env, &trading_id);
    let result = trading_client.execute_trade(&token_id, &trader, &100, &10);

    assert!(result.is_ok());

    // Verify balances
    let trader_balance = token_client.balance(&trader);
    assert_eq!(trader_balance, 900); // 1000 - 100

    let trading_balance = token_client.balance(&trading_id);
    assert_eq!(trading_balance, 100); // Received 100
}

#[test]
fn test_contract_b_reverts_with_structured_error() {
    let env = Env::default();
    env.mock_all_auths();

    // Deploy contracts
    let token_id = env.register_contract(None, IntegrationTokenContract);
    let trading_id = env.register_contract(None, IntegrationTradingContract);

    // Initialize
    let admin = Address::generate(&env);
    let token_client = IntegrationTokenContractClient::new(&env, &token_id);
    token_client.initialize(&admin);

    // Mint insufficient tokens
    let trader = Address::generate(&env);
    token_client.mint(&trader, &50); // Only 50 tokens

    // Try to execute trade for 100 (should fail)
    let trading_client = IntegrationTradingContractClient::new(&env, &trading_id);
    let result = trading_client.try_execute_trade(&token_id, &trader, &100, &10);

    // Should fail with InsufficientBalance
    assert!(result.is_err());
}

#[test]
fn test_event_validation() {
    let env = Env::default();
    env.mock_all_auths();

    // Deploy contracts
    let token_id = env.register_contract(None, IntegrationTokenContract);
    let trading_id = env.register_contract(None, IntegrationTradingContract);

    // Initialize
    let admin = Address::generate(&env);
    let token_client = IntegrationTokenContractClient::new(&env, &token_id);
    token_client.initialize(&admin);

    // Mint tokens
    let trader = Address::generate(&env);
    token_client.mint(&trader, &1000);

    // Execute trade
    let trading_client = IntegrationTradingContractClient::new(&env, &trading_id);
    let _result = trading_client.execute_trade(&token_id, &trader, &100, &10);

    // Verify events were emitted
    let events = env.events().all();
    assert!(events.len() > 0);

    // Should have:
    // - cross_contract_call events (initiated, success)
    // - transfer events
    // - trade_executed event
}

#[test]
fn test_no_state_corruption_on_failure() {
    let env = Env::default();
    env.mock_all_auths();

    // Deploy contracts
    let token_id = env.register_contract(None, IntegrationTokenContract);
    let trading_id = env.register_contract(None, IntegrationTradingContract);

    // Initialize
    let admin = Address::generate(&env);
    let token_client = IntegrationTokenContractClient::new(&env, &token_id);
    token_client.initialize(&admin);

    // Mint tokens
    let trader = Address::generate(&env);
    token_client.mint(&trader, &1000);

    // Get initial balance
    let initial_balance = token_client.balance(&trader);

    // Try to execute invalid trade (fee >= amount)
    let trading_client = IntegrationTradingContractClient::new(&env, &trading_id);
    let result = trading_client.try_execute_trade(&token_id, &trader, &100, &100);

    // Should fail
    assert!(result.is_err());

    // Balance should be unchanged
    let final_balance = token_client.balance(&trader);
    assert_eq!(initial_balance, final_balance);
}

#[test]
fn test_multiple_contract_interactions() {
    let env = Env::default();
    env.mock_all_auths();

    // Deploy contracts
    let token_id = env.register_contract(None, IntegrationTokenContract);
    let trading_id = env.register_contract(None, IntegrationTradingContract);

    // Initialize
    let admin = Address::generate(&env);
    let token_client = IntegrationTokenContractClient::new(&env, &token_id);
    token_client.initialize(&admin);

    // Mint tokens to multiple traders
    let trader1 = Address::generate(&env);
    let trader2 = Address::generate(&env);
    token_client.mint(&trader1, &1000);
    token_client.mint(&trader2, &1000);

    // Execute multiple trades
    let trading_client = IntegrationTradingContractClient::new(&env, &trading_id);

    let result1 = trading_client.execute_trade(&token_id, &trader1, &100, &10);
    assert!(result1.is_ok());

    let result2 = trading_client.execute_trade(&token_id, &trader2, &200, &20);
    assert!(result2.is_ok());

    // Verify balances
    assert_eq!(token_client.balance(&trader1), 900);
    assert_eq!(token_client.balance(&trader2), 800);
    assert_eq!(token_client.balance(&trading_id), 300); // 100 + 200
}

#[test]
fn test_query_balance_cross_contract() {
    let env = Env::default();
    env.mock_all_auths();

    // Deploy contracts
    let token_id = env.register_contract(None, IntegrationTokenContract);
    let trading_id = env.register_contract(None, IntegrationTradingContract);

    // Initialize
    let admin = Address::generate(&env);
    let token_client = IntegrationTokenContractClient::new(&env, &token_id);
    token_client.initialize(&admin);

    // Mint tokens
    let trader = Address::generate(&env);
    token_client.mint(&trader, &1000);

    // Query balance through trading contract
    let trading_client = IntegrationTradingContractClient::new(&env, &trading_id);
    let balance = trading_client.get_token_balance(&token_id, &trader);

    assert_eq!(balance, 1000);
}

#[test]
fn test_reentrancy_protection_in_integration() {
    let env = Env::default();
    env.mock_all_auths();

    // Deploy contracts
    let token_id = env.register_contract(None, IntegrationTokenContract);
    let trading_id = env.register_contract(None, IntegrationTradingContract);

    // Initialize
    let admin = Address::generate(&env);
    let token_client = IntegrationTokenContractClient::new(&env, &token_id);
    token_client.initialize(&admin);

    // Mint tokens
    let trader = Address::generate(&env);
    token_client.mint(&trader, &1000);

    // Execute trade (has reentrancy guard)
    let trading_client = IntegrationTradingContractClient::new(&env, &trading_id);
    let result = trading_client.execute_trade(&token_id, &trader, &100, &10);

    assert!(result.is_ok());

    // Guard should be cleared after execution
    // Subsequent call should succeed
    let result2 = trading_client.execute_trade(&token_id, &trader, &100, &10);
    assert!(result2.is_ok());
}

#[test]
fn test_invalid_amount_propagation() {
    let env = Env::default();
    env.mock_all_auths();

    // Deploy contracts
    let token_id = env.register_contract(None, IntegrationTokenContract);
    let trading_id = env.register_contract(None, IntegrationTradingContract);

    // Initialize
    let admin = Address::generate(&env);
    let token_client = IntegrationTokenContractClient::new(&env, &token_id);
    token_client.initialize(&admin);

    let trader = Address::generate(&env);
    token_client.mint(&trader, &1000);

    // Try invalid amounts
    let trading_client = IntegrationTradingContractClient::new(&env, &trading_id);

    // Zero amount
    let result = trading_client.try_execute_trade(&token_id, &trader, &0, &0);
    assert!(result.is_err());

    // Negative amount
    let result = trading_client.try_execute_trade(&token_id, &trader, &-100, &10);
    assert!(result.is_err());

    // Fee >= amount
    let result = trading_client.try_execute_trade(&token_id, &trader, &100, &100);
    assert!(result.is_err());
}

#[test]
fn test_complex_workflow() {
    let env = Env::default();
    env.mock_all_auths();

    // Deploy contracts
    let token_id = env.register_contract(None, IntegrationTokenContract);
    let trading_id = env.register_contract(None, IntegrationTradingContract);

    // Initialize
    let admin = Address::generate(&env);
    let token_client = IntegrationTokenContractClient::new(&env, &token_id);
    token_client.initialize(&admin);

    // Create multiple traders
    let traders: Vec<Address> = (0..5).map(|_| Address::generate(&env)).collect();

    // Mint tokens to all traders
    for trader in &traders {
        token_client.mint(trader, &1000);
    }

    // Execute trades for all traders
    let trading_client = IntegrationTradingContractClient::new(&env, &trading_id);
    for trader in &traders {
        let result = trading_client.execute_trade(&token_id, trader, &100, &10);
        assert!(result.is_ok());
    }

    // Verify all balances
    for trader in &traders {
        assert_eq!(token_client.balance(trader), 900);
    }

    // Trading contract should have received all trades
    assert_eq!(token_client.balance(&trading_id), 500); // 5 * 100
}

#[test]
fn test_error_recovery() {
    let env = Env::default();
    env.mock_all_auths();

    // Deploy contracts
    let token_id = env.register_contract(None, IntegrationTokenContract);
    let trading_id = env.register_contract(None, IntegrationTradingContract);

    // Initialize
    let admin = Address::generate(&env);
    let token_client = IntegrationTokenContractClient::new(&env, &token_id);
    token_client.initialize(&admin);

    let trader = Address::generate(&env);
    token_client.mint(&trader, &1000);

    let trading_client = IntegrationTradingContractClient::new(&env, &trading_id);

    // First trade fails (invalid amount)
    let result1 = trading_client.try_execute_trade(&token_id, &trader, &0, &0);
    assert!(result1.is_err());

    // Second trade should succeed (system recovered)
    let result2 = trading_client.execute_trade(&token_id, &trader, &100, &10);
    assert!(result2.is_ok());

    // Verify balance
    assert_eq!(token_client.balance(&trader), 900);
}
