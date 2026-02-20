#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, token, Address, Env, Symbol, Vec};

fn setup_env() -> (Env, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, StakingContract);
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    
    // Setup token
    let token_id = env.register_stellar_asset_contract(admin);
    let token_client = token::Client::new(&env, &token_id);
    let token_admin = token::StellarAssetClient::new(&env, &token_id);
    
    (env, admin, user, token_id)
}

#[test]
fn test_initialize() {
    let (env, admin, _user, token_id) = setup_env();
    let client = StakingContractClient::new(&env, &contract_id);

    client.initialize(
        &admin,
        &token_id,
        1000,  // reward_rate
        200,   // bonus_multiplier
        100,   // min_stake
        1000000 // max_stake
    );

    let pool = client.get_pool_info();
    assert_eq!(pool.token, token_id);
    assert_eq!(pool.reward_rate, 1000);
    assert_eq!(pool.bonus_multiplier, 200);
}

#[test]
fn test_stake_happy_path() {
    let (env, admin, user, token_id) = setup_env();
    let client = StakingContractClient::new(&env, &contract_id);

    // Initialize contract
    client.initialize(&admin, &token_id, 1000, 200, 100, 1000000);
    
    // Mint tokens to user
    let token_admin = token::StellarAssetClient::new(&env, &token_id);
    token_admin.mint(&user, &1000);

    // Stake tokens
    client.stake(&user, &500, &90 * 24 * 60 * 60, None);

    let position = client.get_position(&user).unwrap();
    assert_eq!(position.user, user);
    assert_eq!(position.amount, 500);
    assert_eq!(position.lock_period, 90 * 24 * 60 * 60);
    assert_eq!(position.reward_multiplier, 120); // 1.2x for 90 days
}

#[test]
fn test_stake_invalid_amount() {
    let (env, admin, user, token_id) = setup_env();
    let client = StakingContractClient::new(&env, &contract_id);

    // Initialize contract
    client.initialize(&admin, &token_id, 1000, 200, 100, 1000000);

    // Try to stake insufficient amount
    let result = client.try_stake(&user, &50, &90 * 24 * 60 * 60, None);
    assert_eq!(result, Err(Ok(StakingError::InvalidAmount)));
}

#[test]
fn test_unstake_happy_path() {
    let (env, admin, user, token_id) = setup_env();
    let client = StakingContractClient::new(&env, &contract_id);

    // Initialize and stake
    client.initialize(&admin, &token_id, 1000, 200, 100, 1000000);
    
    let token_admin = token::StellarAssetClient::new(&env, &token_id);
    token_admin.mint(&user, &500);
    token_admin.mint(&env.current_contract_address(), &1000); // For rewards
    
    client.stake(&user, &500, &30 * 24 * 60 * 60, None);

    // Fast forward time past lock period
    env.ledger().set(1000 + 31 * 24 * 60 * 60); // 31 days later

    // Unstake
    let rewards = client.unstake(&user).unwrap();
    assert!(rewards > 0);
}

#[test]
fn test_unstake_lock_period_not_expired() {
    let (env, admin, user, token_id) = setup_env();
    let client = StakingContractClient::new(&env, &contract_id);

    // Initialize and stake
    client.initialize(&admin, &token_id, 1000, 200, 100, 1000000);
    
    let token_admin = token::StellarAssetClient::new(&env, &token_id);
    token_admin.mint(&user, &500);
    token_admin.mint(&env.current_contract_address(), &1000);
    
    client.stake(&user, &500, &30 * 24 * 60 * 60, None);

    // Try to unstake before lock period
    let result = client.try_unstake(&user);
    assert_eq!(result, Err(Ok(StakingError::LockPeriodNotExpired)));
}

#[test]
fn test_claim_rewards() {
    let (env, admin, user, token_id) = setup_env();
    let client = StakingContractClient::new(&env, &contract_id);

    // Initialize and stake
    client.initialize(&admin, &token_id, 1000, 200, 100, 1000000);
    
    let token_admin = token::StellarAssetClient::new(&env, &token_id);
    token_admin.mint(&user, &500);
    token_admin.mint(&env.current_contract_address(), &1000);
    
    client.stake(&user, &500, &30 * 24 * 60 * 60, None);

    // Fast forward time to accumulate rewards
    env.ledger().set(1000 + 10 * 24 * 60 * 60); // 10 days later

    // Claim rewards
    let rewards = client.claim_rewards(&user).unwrap();
    assert!(rewards > 0);

    // Check that rewards were actually transferred
    let token_client = token::Client::new(&env, &token_id);
    let user_balance = token_client.balance(&user);
    assert!(user_balance > 500); // Original stake + rewards
}

#[test]
fn test_emergency_mode() {
    let (env, admin, user, token_id) = setup_env();
    let client = StakingContractClient::new(&env, &contract_id);

    // Initialize and stake
    client.initialize(&admin, &token_id, 1000, 200, 100, 1000000);
    
    let token_admin = token::StellarAssetClient::new(&env, &token_id);
    token_admin.mint(&user, &500);
    
    client.stake(&user, &500, &30 * 24 * 60 * 60, None);

    // Enable emergency mode
    client.set_emergency_mode(&admin, true);

    // Should be able to unstake even during emergency mode
    env.ledger().set(1000 + 1 * 24 * 60 * 60); // 1 day later
    let rewards = client.unstake(&user).unwrap();
    assert!(rewards >= 0);
}
