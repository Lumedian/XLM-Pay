use soroban_sdk::{testutils::Address as _, Address, Env, token};
use academy_vesting::{AcademyVestingContract, AcademyVestingContractClient, VestingError, VestingSchedule};

#[test]
fn test_vesting_edge_cases() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let mut ledger_info = env.ledger().get();
    ledger_info.timestamp = 1000;
    env.ledger().set(ledger_info);
    
    let issuer = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract(issuer);
    let token_client = token::Client::new(&env, &token_id);
    let token_admin = token::StellarAssetClient::new(&env, &token_id);
    
    let client = AcademyVestingContractClient::new(&env, &env.register_contract(None, AcademyVestingContract {}));
    client.init(&admin, &token_id, &Address::generate(&env)).unwrap();
    
    let beneficiary = Address::generate(&env);
    
    // Test zero amount grant (should fail)
    let zero_result = client.try_grant_vesting(&admin, &beneficiary, &0, &0, &100, &1000);
    assert!(zero_result.is_err());
    
    // Test negative amount grant (should fail)
    let negative_result = client.try_grant_vesting(&admin, &beneficiary, &(-1000), &0, &100, &1000);
    assert!(negative_result.is_err());
    
    // Test cliff greater than duration (should fail)
    let bad_cliff_result = client.try_grant_vesting(&admin, &beneficiary, &1000, &0, &2000, &1000);
    assert!(bad_cliff_result.is_err());
    
    // Test valid grant
    let valid_grant_id = client.grant_vesting(&admin, &beneficiary, &1000, &0, &100, &1000).unwrap();
    assert_eq!(valid_grant_id, 1);
    
    // Test maximum values
    let max_result = client.try_grant_vesting(&admin, &beneficiary, &i128::MAX, &0, &100, &1000);
    // Should either succeed or fail gracefully, but not panic
    match max_result {
        Ok(grant_id) => {
            assert!(grant_id > 0);
        }
        Err(_) => {
            // Error is acceptable for extreme values
        }
    }
    
    // Test minimum values
    let min_grant_id = client.grant_vesting(&admin, &beneficiary, &1, &0, &1, &1000).unwrap();
    assert!(min_grant_id > 0);
}

#[test]
fn test_vesting_time_edge_cases() {
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
    
    // Test grant with future start time
    let future_grant_id = client.grant_vesting(&admin, &beneficiary, &1000, &5000, &100, &1000).unwrap();
    
    // Before start time
    ledger_info.timestamp = 2000;
    env.ledger().set(ledger_info);
    let vested_before_start = client.get_vested_amount(&future_grant_id).unwrap();
    assert_eq!(vested_before_start, 0);
    
    // After start but before cliff
    ledger_info.timestamp = 5500;
    env.ledger().set(ledger_info);
    let vested_before_cliff = client.get_vested_amount(&future_grant_id).unwrap();
    assert_eq!(vested_before_cliff, 0);
    
    // After cliff
    ledger_info.timestamp = 6000;
    env.ledger().set(ledger_info);
    let vested_after_cliff = client.get_vested_amount(&future_grant_id).unwrap();
    assert!(vested_after_cliff > 0);
    assert!(vested_after_cliff < 1000);
    
    // Fully vested
    ledger_info.timestamp = 10000;
    env.ledger().set(ledger_info);
    let fully_vested = client.get_vested_amount(&future_grant_id).unwrap();
    assert_eq!(fully_vested, 1000);
}

#[test]
fn test_vesting_concurrent_operations() {
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
    
    let beneficiaries: Vec<Address> = (0..5).map(|_| Address::generate(&env)).collect();
    
    // Create multiple grants
    for (i, beneficiary) in beneficiaries.iter().enumerate() {
        let amount = (i as i128 + 1) * 1000;
        let grant_id = client.grant_vesting(&admin, beneficiary, &amount, &0, &100, &1000).unwrap();
        assert_eq!(grant_id, (i + 1) as u64);
    }
    
    // Mint tokens to contract
    token_admin.mint(&env.current_contract_address(), &15000);
    
    // Simulate concurrent claims
    ledger_info.timestamp = 200;
    env.ledger().set(ledger_info);
    
    for (i, beneficiary) in beneficiaries.iter().enumerate() {
        let grant_id = (i + 1) as u64;
        let claimed = client.claim(&grant_id, beneficiary).unwrap();
        assert!(claimed > 0);
        assert!(claimed <= ((i as i128 + 1) * 1000));
    }
    
    // Verify all grants were processed
    for i in 1..=5 {
        let schedule = client.get_vesting(&i).unwrap();
        assert!(schedule.claimed);
    }
}

#[test]
fn test_vesting_extreme_values() {
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
    
    // Test with very large amounts
    let large_amounts = vec![
        i128::MAX / 1000000, // Large but manageable
        i128::MAX / 10000,   // Very large
        1_000_000_000_000i128, // 1 trillion
    ];
    
    for (i, amount) in large_amounts.iter().enumerate() {
        let grant_id = client.grant_vesting(&admin, &beneficiary, amount, &0, &100, &1000).unwrap();
        assert_eq!(grant_id, (i + 1) as u64);
        
        let schedule = client.get_vesting(&grant_id).unwrap();
        assert_eq!(schedule.amount, *amount);
    }
    
    // Test with very long durations
    let long_durations = vec![
        31536000u64,  // 1 year
        315360000u64, // 10 years
        u64::MAX / 1000000, // Very long but not max
    ];
    
    for (i, duration) in long_durations.iter().enumerate() {
        let grant_id = client.grant_vesting(&admin, &beneficiary, &1000, &0, &100, duration).unwrap();
        let expected_id = (large_amounts.len() + i + 1) as u64;
        assert_eq!(grant_id, expected_id);
    }
    
    // Test with very small positive values
    let small_amounts = vec![1i128, 2i128, 10i128];
    
    for (i, amount) in small_amounts.iter().enumerate() {
        let grant_id = client.grant_vesting(&admin, &beneficiary, amount, &0, &1, &1000).unwrap();
        let expected_id = (large_amounts.len() + long_durations.len() + i + 1) as u64;
        assert_eq!(grant_id, expected_id);
    }
}

#[test]
fn test_vesting_state_persistence() {
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
    
    // Create multiple grants over time
    for i in 1..=10 {
        let amount = i * 1000;
        let grant_id = client.grant_vesting(&admin, &beneficiary, &amount, &0, &100, &1000).unwrap();
        assert_eq!(grant_id, i as u64);
    }
    
    // Check state persistence
    for i in 1..=10 {
        let schedule = client.get_vesting(&(i as u64)).unwrap();
        assert_eq!(schedule.amount, (i * 1000) as i128);
        assert_eq!(schedule.beneficiary, beneficiary);
        assert!(!schedule.claimed);
        assert!(!schedule.revoked);
    }
    
    // Perform some claims
    token_admin.mint(&env.current_contract_address(), &55000); // Sum of 1000+2000+...+10000
    
    ledger_info.timestamp = 200;
    env.ledger().set(ledger_info);
    
    for i in 1..=5 {
        let claimed = client.claim(&(i as u64), &beneficiary).unwrap();
        assert!(claimed > 0);
    }
    
    // Check that state is still consistent
    for i in 1..=10 {
        let schedule = client.get_vesting(&(i as u64)).unwrap();
        if i <= 5 {
            assert!(schedule.claimed);
        } else {
            assert!(!schedule.claimed);
        }
    }
    
    // Verify no data loss
    let (stored_admin, stored_token, _) = client.get_info();
    assert_eq!(stored_admin, admin);
    assert_eq!(stored_token, token_id);
}

#[test]
fn test_vesting_error_recovery() {
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
    
    // Perform some valid operations
    let grant_id = client.grant_vesting(&admin, &beneficiary, &1000, &0, &100, &1000).unwrap();
    token_admin.mint(&env.current_contract_address(), &1000);
    
    // Try some invalid operations that should fail gracefully
    let invalid_results = vec![
        client.try_grant_vesting(&admin, &beneficiary, &0, &0, &100, &1000), // Zero amount
        client.try_grant_vesting(&admin, &beneficiary, &(-500), &0, &100, &1000), // Negative amount
        client.try_claim(&999, &beneficiary), // Non-existent grant
    ];
    
    // All should fail but not panic
    for result in invalid_results {
        assert!(result.is_err());
    }
    
    // Contract should still be functional
    ledger_info.timestamp = 200;
    env.ledger().set(ledger_info);
    
    let valid_result = client.claim(&grant_id, &beneficiary);
    assert!(valid_result.is_ok());
    
    // State should be consistent
    let schedule = client.get_vesting(&grant_id).unwrap();
    assert!(schedule.claimed);
}

#[test]
fn test_vesting_boundary_conditions() {
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
    
    // Test boundary amounts
    let boundary_amounts = vec![
        1i128,           // Minimum positive
        i128::MAX,       // Maximum possible
        i128::MIN + 1,   // Near minimum
    ];
    
    for (i, amount) in boundary_amounts.iter().enumerate() {
        let result = client.try_grant_vesting(&admin, &beneficiary, amount, &0, &100, &1000);
        
        match result {
            Ok(grant_id) => {
                // Success case
                assert!(grant_id > 0);
                println!("Grant {} with amount {} succeeded with ID: {}", i, amount, grant_id);
            }
            Err(e) => {
                // Error case - should be expected errors
                assert!(matches!(e, Ok(VestingError::InvalidSchedule)));
                println!("Grant {} with amount {} failed as expected: {:?}", i, amount, e);
            }
        }
    }
    
    // Test boundary time values
    let boundary_times = vec![
        0u64,            // Zero time
        u64::MAX,        // Maximum time
        1u64,            // Minimum positive time
    ];
    
    for (i, start_time) in boundary_times.iter().enumerate() {
        let result = client.try_grant_vesting(&admin, &beneficiary, &1000, start_time, &100, &1000);
        
        match result {
            Ok(grant_id) => {
                // Success case
                assert!(grant_id > 0);
                println!("Grant {} with start_time {} succeeded with ID: {}", i, start_time, grant_id);
            }
            Err(e) => {
                // Error case - should be expected errors
                assert!(matches!(e, Ok(VestingError::InvalidSchedule)));
                println!("Grant {} with start_time {} failed as expected: {:?}", i, start_time, e);
            }
        }
    }
}