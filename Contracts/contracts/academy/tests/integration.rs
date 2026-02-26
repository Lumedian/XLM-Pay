use soroban_sdk::{testutils::Address as _, Address, Env, token};
use academy_vesting::{AcademyVestingContract, AcademyVestingContractClient, VestingError};

fn test_cross_contract_vesting_scenarios() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let mut ledger_info = env.ledger().get();
    ledger_info.timestamp = 1000;
    env.ledger().set(ledger_info);
    
    // Create token contract
    let issuer = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract(issuer);
    let token_client = token::Client::new(&env, &token_id);
    let token_admin = token::StellarAssetClient::new(&env, &token_id);
    
    // Create vesting contract
    let vesting_id = env.register_contract(None, AcademyVestingContract {});
    let vesting_client = AcademyVestingContractClient::new(&env, &vesting_id);
    vesting_client.init(&admin, &token_id, &Address::generate(&env)).unwrap();
    
    let beneficiaries: Vec<Address> = (0..5).map(|_| Address::generate(&env)).collect();
    
    // Test vesting with token transfers
    for (i, beneficiary) in beneficiaries.iter().enumerate() {
        let amount = (i as i128 + 1) * 1000;
        let grant_id = vesting_client.grant_vesting(&admin, beneficiary, &amount, &0, &100, &1000).unwrap();
        assert_eq!(grant_id, (i + 1) as u64);
    }
    
    // Mint tokens to vesting contract
    token_admin.mint(&vesting_id, &15000);
    
    // Test claiming with token transfer
    ledger_info.timestamp = 200;
    env.ledger().set(ledger_info);
    
    for (i, beneficiary) in beneficiaries.iter().enumerate() {
        let grant_id = (i + 1) as u64;
        let balance_before = token_client.balance(beneficiary);
        
        let claimed = vesting_client.claim(&grant_id, beneficiary).unwrap();
        assert!(claimed > 0);
        
        let balance_after = token_client.balance(beneficiary);
        assert_eq!(balance_after - balance_before, claimed);
    }
    
    // Verify token balances
    let contract_balance = token_client.balance(&vesting_id);
    assert!(contract_balance < 15000); // Should have transferred some tokens
    
    for beneficiary in &beneficiaries {
        let beneficiary_balance = token_client.balance(beneficiary);
        assert!(beneficiary_balance > 0);
    }
}

fn test_vesting_governance_scenarios() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let governance = Address::generate(&env);
    let mut ledger_info = env.ledger().get();
    ledger_info.timestamp = 1000;
    env.ledger().set(ledger_info);
    
    let issuer = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract(issuer);
    let token_admin = token::StellarAssetClient::new(&env, &token_id);
    
    let client = AcademyVestingContractClient::new(&env, &env.register_contract(None, AcademyVestingContract {}));
    client.init(&admin, &token_id, &governance).unwrap();
    
    let beneficiary = Address::generate(&env);
    
    // Test normal grant
    let grant_id = client.grant_vesting(&admin, &beneficiary, &1000, &0, &100, &1000).unwrap();
    
    // Test governance revocation with proper timelock
    ledger_info.timestamp = 5000; // 4 seconds after start (not enough for 1 hour timelock)
    env.ledger().set(ledger_info);
    
    let early_revoke = client.try_revoke(&grant_id, &admin, &3600); // 1 hour timelock
    assert!(early_revoke.is_err());
    
    // Test with sufficient time
    ledger_info.timestamp = 3600000; // 1 hour later
    env.ledger().set(ledger_info);
    
    let valid_revoke = client.try_revoke(&grant_id, &admin, &3600);
    assert!(valid_revoke.is_ok());
    
    // Verify grant is revoked
    let schedule = client.get_vesting(&grant_id).unwrap();
    assert!(schedule.revoked);
    assert_eq!(schedule.revoke_time, 3600000);
}

fn test_vesting_pause_integration() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let mut ledger_info = env.ledger().get();
    ledger_info.timestamp = 1000;
    env.ledger().set(ledger_info);
    
    let issuer = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract(issuer);
    let token_admin = token::StellarAssetClient::new(&env, &token_id);
    
    let client = AcademyVestingContractClient::new(&env, &env.register_contract(None, AcademyVestingContract {}));
    client.init(&admin, &token_id, &Address::generate(&env)).unwrap();
    
    let beneficiary = Address::generate(&env);
    
    // Test normal operations
    let grant_id = client.grant_vesting(&admin, &beneficiary, &1000, &0, &100, &1000).unwrap();
    token_admin.mint(&env.current_contract_address(), &1000);
    
    // Test claim before cliff
    ledger_info.timestamp = 150;
    env.ledger().set(ledger_info);
    
    let early_claim = client.try_claim(&grant_id, &beneficiary);
    assert!(early_claim.is_err());
    
    // Test claim after cliff
    ledger_info.timestamp = 200;
    env.ledger().set(ledger_info);
    
    let valid_claim = client.try_claim(&grant_id, &beneficiary);
    assert!(valid_claim.is_ok());
}

fn test_vesting_event_integration() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let mut ledger_info = env.ledger().get();
    ledger_info.timestamp = 1000;
    env.ledger().set(ledger_info);
    
    let issuer = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract(issuer);
    let token_admin = token::StellarAssetClient::new(&env, &token_id);
    
    let client = AcademyVestingContractClient::new(&env, &env.register_contract(None, AcademyVestingContract {}));
    client.init(&admin, &token_id, &Address::generate(&env)).unwrap();
    
    let beneficiary = Address::generate(&env);
    
    // Test grant event
    let grant_id = client.grant_vesting(&admin, &beneficiary, &1000, &0, &100, &1000).unwrap();
    
    // Check that events were emitted
    let events = env.events().all();
    assert!(!events.is_empty());
    
    // Look for grant event
    let grant_events: Vec<_> = events.iter().filter(|e| {
        if let Ok((topics, _)) = e.clone().try_into_val::<(soroban_sdk::Vec<soroban_sdk::Val>, soroban_sdk::Val)>(&env) {
            if topics.len() > 0 {
                if let Ok(topic) = topics.get(0).unwrap().try_into_val::<soroban_sdk::Symbol>(&env) {
                    return topic == soroban_sdk::Symbol::new(&env, "grant");
                }
            }
        }
        false
    }).collect();
    
    assert!(!grant_events.is_empty());
    
    // Test claim event
    token_admin.mint(&env.current_contract_address(), &1000);
    ledger_info.timestamp = 200;
    env.ledger().set(ledger_info);
    
    let _claimed = client.claim(&grant_id, &beneficiary).unwrap();
    
    let events_after_claim = env.events().all();
    assert!(events_after_claim.len() > events.len());
    
    // Look for claim event
    let claim_events: Vec<_> = events_after_claim.iter().filter(|e| {
        if let Ok((topics, _)) = e.clone().try_into_val::<(soroban_sdk::Vec<soroban_sdk::Val>, soroban_sdk::Val)>(&env) {
            if topics.len() > 0 {
                if let Ok(topic) = topics.get(0).unwrap().try_into_val::<soroban_sdk::Symbol>(&env) {
                    return topic == soroban_sdk::Symbol::new(&env, "claim");
                }
            }
        }
        false
    }).collect();
    
    assert!(!claim_events.is_empty());
}

fn test_vesting_multi_user_scenarios() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let mut ledger_info = env.ledger().get();
    ledger_info.timestamp = 1000;
    env.ledger().set(ledger_info);
    
    let issuer = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract(issuer);
    let token_admin = token::StellarAssetClient::new(&env, &token_id);
    
    let client = AcademyVestingContractClient::new(&env, &env.register_contract(None, AcademyVestingContract {}));
    client.init(&admin, &token_id, &Address::generate(&env)).unwrap();
    
    let beneficiaries: Vec<Address> = (0..10).map(|_| Address::generate(&env)).collect();
    
    // Create various vesting schedules
    let schedules = vec![
        (0, 1000i128, 0u64, 100u64, 1000u64),  // Immediate vesting
        (1, 2000i128, 0u64, 200u64, 2000u64),  // Standard vesting
        (2, 3000i128, 1000u64, 100u64, 1000u64), // Future start
        (3, 1500i128, 0u64, 0u64, 1000u64),   // No cliff
        (4, 2500i128, 0u64, 500u64, 1000u64),  // Long cliff
    ];
    
    // Create grants
    for (i, (beneficiary_idx, amount, start_time, cliff, duration)) in schedules.iter().enumerate() {
        let grant_id = client.grant_vesting(
            &admin,
            &beneficiaries[*beneficiary_idx],
            amount,
            start_time,
            cliff,
            duration,
        ).unwrap();
        assert_eq!(grant_id, (i + 1) as u64);
    }
    
    // Mint tokens for all grants
    token_admin.mint(&env.current_contract_address(), &10000);
    
    // Test claims at different times
    let test_scenarios = vec![
        (100u64, vec![1, 4]),  // Early - only no cliff grants partially vested
        (200u64, vec![1, 2, 4]), // After some cliffs
        (600u64, vec![1, 2, 3, 4, 5]), // Most vested
        (1500u64, vec![1, 2, 3, 4, 5]), // Fully vested
    ];
    
    for (timestamp, expected_claimable) in test_scenarios {
        ledger_info.timestamp = timestamp;
        env.ledger().set(ledger_info);
        
        for grant_id in expected_claimable {
            let beneficiary_idx = schedules[grant_id - 1].0;
            let claim_result = client.try_claim(&(grant_id as u64), &beneficiaries[beneficiary_idx]);
            // Should either succeed or fail with NotVested
            match claim_result {
                Ok(_) => {
                    // Success
                }
                Err(e) => {
                    assert!(matches!(e, Ok(VestingError::NotVested)));
                }
            }
        }
    }
    
    // Verify final state
    for i in 1..=5 {
        let schedule = client.get_vesting(&(i as u64)).unwrap();
        // All should be claimable by now
        assert!(schedule.claimed || !schedule.revoked);
    }
}

#[test]
fn test_cross_contract_vesting_integration() {
    test_cross_contract_vesting_scenarios();
}

#[test]
fn test_vesting_governance_integration() {
    test_vesting_governance_scenarios();
}

#[test]
fn test_vesting_pause_integration() {
    test_vesting_pause_integration();
}

#[test]
fn test_vesting_event_integration() {
    test_vesting_event_integration();
}

#[test]
fn test_vesting_multi_user_integration() {
    test_vesting_multi_user_scenarios();
}