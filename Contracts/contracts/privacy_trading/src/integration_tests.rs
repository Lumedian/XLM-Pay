#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, Symbol, BytesN, TryFromVal, TryIntoVal};
use soroban_sdk::testutils::Events;
use shared::privacy::{utils, PrivacyPool};

// Import the real token contract
use privacy_token::{PrivateTokenContract, PrivateTokenContractClient};

#[test]
fn test_full_integration_flow() {
    let env = Env::default();
    env.mock_all_auths();

    // Deploy Real Privacy Token Contract (Base Token)
    // Attempt to register using the struct. If this fails, we might need WASM.
    let base_token_id = env.register_contract(None, PrivateTokenContract);
    let base_token_client = PrivateTokenContractClient::new(&env, &base_token_id);

    // Deploy Real Privacy Token Contract (Quote Token)
    let quote_token_id = env.register_contract(None, PrivateTokenContract);
    let quote_token_client = PrivateTokenContractClient::new(&env, &quote_token_id);

    // Deploy Privacy Trading Contract
    let trading_contract_id = env.register_contract(None, PrivateTradingContract);
    let trading_client = PrivateTradingContractClient::new(&env, &trading_contract_id);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    // Initialize Tokens
    base_token_client.initialize(
        &admin, 
        &Symbol::new(&env, "BaseToken"), 
        &Symbol::new(&env, "BASE"), 
        &18
    );
    quote_token_client.initialize(
        &admin, 
        &Symbol::new(&env, "QuoteToken"), 
        &Symbol::new(&env, "QUOTE"), 
        &18
    );

    // Initialize Trading
    trading_client.initialize(&admin, &base_token_id, &quote_token_id);

    // 1. User gets some public tokens (mint)
    base_token_client.mint(&admin, &user, &1000);
    
    // 2. User deposits into privacy pool
    let amount = 500i128;
    let note = utils::create_private_note(&env, amount).unwrap();
    let leaf_index = base_token_client.deposit(&user, &amount, &note.commitment); // Returns leaf_index

    // 3. User generates proof for the deposit
    // In a real scenario, this happens off-chain, but here we simulate it using the contract helper
    // Note: generate_proof is available in the contract interface for testing/convenience
    let proof = base_token_client.generate_proof(&leaf_index).unwrap();

    // 4. User creates an order using the proof
    // Sell 500 BASE for 1000 QUOTE
    let price = 2; 
    let expires_at = env.ledger().timestamp() + 3600;
    
    let nullifier_hash = PrivacyPool::compute_nullifier_hash(&env, &note.nullifier_secret);

    // Create order call
    let order_id = trading_client.create_order(
        &user,
        &OrderSide::Sell,
        &price,
        &note.commitment, // amount_commitment
        &nullifier_hash,
        &expires_at,
        &proof
    );

    // Verify order created
    assert_eq!(order_id, 1);

    // Verify order details
    let order = trading_client.get_order(&order_id).unwrap();
    assert_eq!(order.trader, user);
    assert_eq!(order.amount_commitment, note.commitment);
    assert_eq!(order.status, OrderStatus::Open);

    // DEBUG: Verify proof is still valid manually
    let is_valid = trading_client.verify_token_state(&base_token_client.address, &proof);
    assert!(is_valid, "Proof should still be valid before second attempt");

    // 5. Try to double spend (use same proof/nullifier again)
    let res = trading_client.try_create_order(
        &user,
        &OrderSide::Sell,
        &price,
        &note.commitment, // amount_commitment
        &nullifier_hash,
        &expires_at,
        &proof
    );

    // Check debug events
    let events = env.events().all();
    let mut root_hash: Option<BytesN<32>> = None;
    let mut proof_root: Option<BytesN<32>> = None;

    for (contract, topics, data) in events.iter() {
        std::println!("Event: contract={:?}, topics={:?}, data={:?}", contract, topics, data);

        if topics.len() >= 2 {
             let topic0: Symbol = Symbol::try_from_val(&env, &topics.get(0).unwrap()).unwrap();
             if topic0 == Symbol::new(&env, "debug_verify") {
                 let topic1: Symbol = Symbol::try_from_val(&env, &topics.get(1).unwrap()).unwrap();
                 if topic1 == Symbol::new(&env, "fail_root") {
                     std::println!("Failure: Root mismatch!");
                 }
                 if topic1 == Symbol::new(&env, "fail_proof") {
                     std::println!("Failure: Proof invalid!");
                 }
                 
                 if topic1 == Symbol::new(&env, "root") {
                     root_hash = Some(data.try_into_val(&env).unwrap());
                 } else if topic1 == Symbol::new(&env, "proof") {
                     proof_root = Some(data.try_into_val(&env).unwrap());
                 }
             }
        }
    }
    
    // If we found them, assert equality
    if let (Some(r), Some(p)) = (root_hash, proof_root) {
        assert_eq!(r, p, "Root hash and Proof root mismatch in debug events!");
    }

    assert!(res.is_err());
    // Error should be AlreadySpent
    assert_eq!(res.err(), Some(Ok(PrivateTradeError::AlreadySpent)));
}
