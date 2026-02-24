
#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Env, BytesN};
use shared::privacy::utils;
use crate::test_utils::{MockTokenContract, MockTokenContractClient};

fn setup_contracts() -> (Env, Address, MockTokenContractClient<'static>, PrivateTradingContractClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();

    // Deploy Mock Token Contract
    let token_contract_id = env.register_contract(None, MockTokenContract);
    let token_client = MockTokenContractClient::new(&env, &token_contract_id);

    // Deploy Privacy Trading Contract
    let trading_contract_id = env.register_contract(None, PrivateTradingContract);
    let trading_client = PrivateTradingContractClient::new(&env, &trading_contract_id);

    let admin = Address::generate(&env);

    // Initialize Token
    token_client.initialize(&admin);

    // Initialize Trading
    trading_client.initialize(&admin, &token_contract_id, &token_contract_id);

    (env, admin, token_client, trading_client)
}

#[test]
fn test_cross_contract_verification() {
    let (env, _admin, token_client, trading_client) = setup_contracts();
    let user = Address::generate(&env);

    // Create a private note for deposit
    let note = utils::create_private_note(&env, 500i128).unwrap();
    
    // Deposit into mock token contract
    let leaf_index = token_client.deposit(&user, &500, &note.commitment);
    
    // Generate proof from token contract
    let proof = token_client.generate_proof(&leaf_index).unwrap();

    // Verify proof using trading contract
    // This calls verify_token_state -> invokes token contract -> verifies proof locally
    let is_valid = trading_client.verify_token_state(&token_client.address, &proof);
    
    assert!(is_valid, "Cross-contract proof verification failed");
}

#[test]
fn test_invalid_proof_verification() {
    let (env, _admin, token_client, trading_client) = setup_contracts();
    let user = Address::generate(&env);

    let note = utils::create_private_note(&env, 500i128).unwrap();
    let leaf_index = token_client.deposit(&user, &500, &note.commitment);
    
    // Get valid proof
    let mut proof = token_client.generate_proof(&leaf_index).unwrap();
    
    // Tamper with the proof (change leaf hash)
    proof.leaf = BytesN::from_array(&env, &[0u8; 32]);

    // Verify should fail
    let is_valid = trading_client.verify_token_state(&token_client.address, &proof);
    
    assert!(!is_valid, "Invalid proof should be rejected");
}
