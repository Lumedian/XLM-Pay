#![cfg(test)]
use super::*;
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{Env, Address};

#[test]
fn test_reputation_flow() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let reporter = Address::generate(&env);

    let contract_id = env.register_contract(None, ReputationContract);
    let client = ReputationContractClient::new(&env, &contract_id);

    // 1. Init
    client.init(&admin);

    // 2. Try to add score without authorization
    // This should fail if we don't mock auths, but since we mock_all_auths, we need to check role
    // Wait, mock_all_auths handles the require_auth() call, but not the ACL check.
    
    // 3. Authorize reporter
    client.add_authorized_contract(&admin, &reporter);

    // 4. Add score
    client.add_score(&reporter, &user, &50);
    
    let rep = client.get_reputation(&user);
    assert_eq!(rep.score, 50);
    assert_eq!(rep.tier, symbol_short!("BRONZE"));

    // 5. Add more score to reach Silver
    client.add_score(&reporter, &user, &60);
    let rep = client.get_reputation(&user);
    assert_eq!(rep.score, 110);
    assert_eq!(rep.tier, symbol_short!("SILVER"));

    // 6. Test daily cap (cap is 100)
    // We already added 110 in total? Wait, the daily cap check is:
    // if daily_points + amount > config.daily_cap { return; }
    // First call: 0 + 50 = 50 (<= 100) -> OK. score=50, daily=50
    // Second call: 50 + 60 = 110 (> 100) -> SKIPPED. score=50, daily=50
    
    let rep = client.get_reputation(&user);
    assert_eq!(rep.score, 50); // Second call should have been skipped
}

#[test]
fn test_decay() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let reporter = Address::generate(&env);

    let contract_id = env.register_contract(None, ReputationContract);
    let client = ReputationContractClient::new(&env, &contract_id);

    client.init(&admin);
    client.add_authorized_contract(&admin, &reporter);

    // Add 100 points
    client.add_score(&reporter, &user, &100);
    
    // Jump 10 days ahead (86400 * 10 seconds)
    env.ledger().set_timestamp(env.ledger().timestamp() + 86400 * 10);
    
    // Decay is 1 pt per day. So 10 points should be decayed.
    let rep = client.get_reputation(&user);
    assert_eq!(rep.score, 90);
    assert_eq!(rep.tier, symbol_short!("BRONZE")); // 90 is Bronze
}

#[test]
fn test_deduction() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let reporter = Address::generate(&env);

    let contract_id = env.register_contract(None, ReputationContract);
    let client = ReputationContractClient::new(&env, &contract_id);

    client.init(&admin);
    client.add_authorized_contract(&admin, &reporter);

    client.add_score(&reporter, &user, &100);
    
    // Admin deducts score for violation
    client.deduct_score(&admin, &user, &50);
    
    let rep = client.get_reputation(&user);
    assert_eq!(rep.score, 50);
}
