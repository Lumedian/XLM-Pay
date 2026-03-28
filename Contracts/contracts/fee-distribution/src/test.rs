#![cfg(test)]

use soroban_sdk::{
    testutils::Address as _,
    Env, Address,
};
use crate::{FeeDistributionContract, FeeDistributionContractClient, FeeSplits, FeeRecipients};

fn setup_test(env: &Env) -> (FeeDistributionContractClient<'_>, Address, FeeRecipients) {
    let contract_id = env.register_contract(None, FeeDistributionContract);
    let client = FeeDistributionContractClient::new(env, &contract_id);

    let admin = Address::generate(env);
    let treasury = Address::generate(env);
    let staking = Address::generate(env);
    let burn = Address::generate(env);

    let splits = FeeSplits {
        treasury_bps: 5000, // 50%
        staking_bps: 3000,  // 30%
        burn_bps: 2000,     // 20%
    };

    let recipients = FeeRecipients {
        treasury: treasury.clone(),
        staking: staking.clone(),
        burn: burn.clone(),
    };

    client.init(&admin, &splits, &recipients);

    (client, admin, recipients)
}

#[test]
fn test_initialization() {
    let env = Env::default();
    let (client, _admin, recipients) = setup_test(&env);

    let splits = client.get_splits();
    assert_eq!(splits.treasury_bps, 5000);
    assert_eq!(splits.staking_bps, 3000);
    assert_eq!(splits.burn_bps, 2000);

    let stored_recipients = client.get_recipients();
    assert_eq!(stored_recipients.treasury, recipients.treasury);
    assert_eq!(stored_recipients.staking, recipients.staking);
    assert_eq!(stored_recipients.burn, recipients.burn);
}

#[test]
fn test_distribution() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _recipients) = setup_test(&env);

    let payer = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract(token_admin.clone());
    let token_client = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);
    token_client.mint(&payer, &10000);
    
    // Execute distribution
    let amount = 10000i128;
    client.distribute_fees(&token_id, &payer, &amount);

    let stats = client.get_stats(&token_id);
    assert_eq!(stats.total_treasury, 5000);
    assert_eq!(stats.total_staking, 3000);
    assert_eq!(stats.total_burn, 2000);
}

#[test]
fn test_set_splits() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _recipients) = setup_test(&env);

    let new_splits = FeeSplits {
        treasury_bps: 4000,
        staking_bps: 4000,
        burn_bps: 2000,
    };

    client.set_splits(&admin, &new_splits);
    let splits = client.get_splits();
    assert_eq!(splits.treasury_bps, 4000);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #103)")]
fn test_invalid_splits() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _recipients) = setup_test(&env);

    let invalid_splits = FeeSplits {
        treasury_bps: 5000,
        staking_bps: 5000,
        burn_bps: 5000, // Total > 10000
    };

    client.set_splits(&admin, &invalid_splits);
}

#[test]
fn test_distribute_held_fees() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _recipients) = setup_test(&env);

    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract(token_admin.clone());
    let token_client = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);
    
    // Manually mint to the contract
    token_client.mint(&client.address, &10000);

    client.distribute_held_fees(&token_id);

    let stats = client.get_stats(&token_id);
    assert_eq!(stats.total_treasury, 5000);
    assert_eq!(stats.total_staking, 3000);
    assert_eq!(stats.total_burn, 2000);
}
