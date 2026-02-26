use soroban_sdk::{testutils::Address as _, Address, Env, String, Symbol};
use academy_rewards::{AcademyRewardsContract, AcademyRewardsContractClient, ContractError, Badge, BadgeMetadata};

#[test]
fn test_academy_edge_cases() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let mut ledger_info = env.ledger().get();
    ledger_info.timestamp = 1000;
    env.ledger().set(ledger_info);
    
    let client = AcademyRewardsContractClient::new(&env, &env.register_contract(None, AcademyRewardsContract {}));
    client.initialize(&admin).unwrap();
    
    let user = Address::generate(&env);
    
    // Test zero discount
    client.create_badge_type(&admin, &1, &String::from_str(&env, "ZeroDiscount"), &0, &10, &3600).unwrap();
    client.mint_badge(&admin, &user, &1).unwrap();
    let discount = client.get_user_discount(&user);
    assert_eq!(discount, 0);
    
    // Test maximum valid discount (100%)
    client.create_badge_type(&admin, &2, &String::from_str(&env, "MaxDiscount"), &10000, &10, &3600).unwrap();
    client.mint_badge(&admin, &user, &2).unwrap();
    let max_discount = client.get_user_discount(&user);
    assert_eq!(max_discount, 10000);
    
    // Test invalid discount (should fail)
    let invalid_discount = client.try_create_badge_type(&admin, &3, &String::from_str(&env, "InvalidDiscount"), &10001, &10, &3600);
    assert!(invalid_discount.is_err());
    
    // Test zero max redemptions (unlimited)
    client.create_badge_type(&admin, &4, &String::from_str(&env, "UnlimitedRedemptions"), &500, &0, &3600).unwrap();
    client.mint_badge(&admin, &user, &4).unwrap();
    
    // Test multiple redemptions
    for i in 0..5 {
        let tx_hash = format!("tx_{}", i);
        let result = client.redeem_badge(&user, &String::from_str(&env, &tx_hash));
        assert!(result.is_ok());
    }
    
    // Test zero validity duration (never expires)
    client.create_badge_type(&admin, &5, &String::from_str(&env, "NoExpiry"), &500, &10, &0).unwrap();
    client.mint_badge(&admin, &user, &5).unwrap();
    let no_expiry_discount = client.get_user_discount(&user);
    assert_eq!(no_expiry_discount, 500);
}

#[test]
fn test_academy_pause_edge_cases() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let mut ledger_info = env.ledger().get();
    ledger_info.timestamp = 1000;
    env.ledger().set(ledger_info);
    
    let client = AcademyRewardsContractClient::new(&env, &env.register_contract(None, AcademyRewardsContract {}));
    client.initialize(&admin).unwrap();
    
    let user = Address::generate(&env);
    
    // Test with invalid admin
    let invalid_admin = Address::generate(&env);
    let pause_result = client.try_set_paused(&invalid_admin, &true);
    assert!(pause_result.is_err());
    
    // Test valid pause
    client.set_paused(&admin, &true).unwrap();
    
    // Test mint while paused
    client.create_badge_type(&admin, &1, &String::from_str(&env, "TestBadge"), &500, &10, &3600).unwrap();
    let mint_while_paused = client.try_mint_badge(&admin, &user, &1);
    assert!(mint_while_paused.is_err());
    
    // Test redeem while paused
    let redeem_while_paused = client.try_redeem_badge(&user, &String::from_str(&env, "tx_1"));
    assert!(redeem_while_paused.is_err());
    
    // Test valid unpause
    client.set_paused(&admin, &false).unwrap();
    
    // Test mint after unpause
    let mint_after_unpause = client.try_mint_badge(&admin, &user, &1);
    assert!(mint_after_unpause.is_ok());
}

#[test]
fn test_academy_concurrent_operations() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let mut ledger_info = env.ledger().get();
    ledger_info.timestamp = 1000;
    env.ledger().set(ledger_info);
    
    let client = AcademyRewardsContractClient::new(&env, &env.register_contract(None, AcademyRewardsContract {}));
    client.initialize(&admin).unwrap();
    
    let users: Vec<Address> = (0..5).map(|_| Address::generate(&env)).collect();
    
    // Create multiple badge types
    for i in 1..=5 {
        client.create_badge_type(
            &admin,
            &i,
            &String::from_str(&env, &format!("Badge{}", i)),
            &(i * 100),
            &10,
            &3600,
        ).unwrap();
    }
    
    // Simulate concurrent minting
    for (i, user) in users.iter().enumerate() {
        let badge_type = (i % 5 + 1) as u32;
        let result = client.mint_badge(&admin, user, &badge_type);
        assert!(result.is_ok());
    }
    
    // Check that all badges were minted
    for (i, user) in users.iter().enumerate() {
        let badge_type = (i % 5 + 1) as u32;
        let user_badge = client.get_user_badge(user).unwrap();
        assert_eq!(user_badge.badge_type, badge_type);
    }
    
    let total_minted_1 = client.get_total_minted(&1);
    assert_eq!(total_minted_1, 1);
}

#[test]
fn test_academy_extreme_values() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let mut ledger_info = env.ledger().get();
    ledger_info.timestamp = 1000;
    env.ledger().set(ledger_info);
    
    let client = AcademyRewardsContractClient::new(&env, &env.register_contract(None, AcademyRewardsContract {}));
    client.initialize(&admin).unwrap();
    
    let user = Address::generate(&env);
    
    // Test with very large badge type IDs
    let large_badge_types = vec![u32::MAX, u32::MAX - 1, 1000000];
    
    for badge_type in large_badge_types {
        let result = client.try_create_badge_type(
            &admin,
            &badge_type,
            &String::from_str(&env, "LargeBadgeType"),
            &500,
            &10,
            &3600,
        );
        // Should either succeed or fail gracefully, but not panic
        match result {
            Ok(_) => {
                // Success is acceptable
                client.mint_badge(&admin, &user, &badge_type).unwrap();
            }
            Err(_) => {
                // Error is also acceptable
            }
        }
    }
    
    // Test with very large validity durations
    let large_durations = vec![u64::MAX, u64::MAX / 2, 31536000000]; // 1000 years
    
    for (i, duration) in large_durations.iter().enumerate() {
        let badge_type = (100 + i) as u32;
        client.create_badge_type(
            &admin,
            &badge_type,
            &String::from_str(&env, "LongDuration"),
            &500,
            &10,
            duration,
        ).unwrap();
        client.mint_badge(&admin, &user, &badge_type).unwrap();
    }
    
    // Test with very small positive values
    let small_badge_types = vec![1u32, 2u32, 3u32];
    
    for badge_type in small_badge_types {
        client.create_badge_type(&admin, &badge_type, &String::from_str(&env, "SmallBadge"), &1, &1, &1).unwrap();
        client.mint_badge(&admin, &user, &badge_type).unwrap();
    }
}

#[test]
fn test_academy_transaction_hash_edge_cases() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let mut ledger_info = env.ledger().get();
    ledger_info.timestamp = 1000;
    env.ledger().set(ledger_info);
    
    let client = AcademyRewardsContractClient::new(&env, &env.register_contract(None, AcademyRewardsContract {}));
    client.initialize(&admin).unwrap();
    
    let user = Address::generate(&env);
    
    client.create_badge_type(&admin, &1, &String::from_str(&env, "TestBadge"), &500, &10, &3600).unwrap();
    client.mint_badge(&admin, &user, &1).unwrap();
    
    // Test with various transaction hash lengths
    let test_hashes = vec![
        "a",           // 1 character
        "ab",          // 2 characters
        "short",       // 5 characters
        "normal_length_hash", // 18 characters
        "very_long_transaction_hash_that_exceeds_typical_lengths", // Very long
        "0x123456789abcdef0123456789abcdef0123456789abcdef", // Hex-like
    ];
    
    for (i, hash) in test_hashes.iter().enumerate() {
        let result = client.try_redeem_badge(&user, &String::from_str(&env, hash));
        if i < 6 { // First 6 should succeed
            assert!(result.is_ok());
        }
    }
    
    // Test duplicate transaction hash (should fail)
    let duplicate_hash = "duplicate_tx";
    let first_result = client.try_redeem_badge(&user, &String::from_str(&env, duplicate_hash));
    assert!(first_result.is_ok());
    
    let duplicate_result = client.try_redeem_badge(&user, &String::from_str(&env, duplicate_hash));
    assert!(duplicate_result.is_err());
}

#[test]
fn test_academy_state_persistence() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let mut ledger_info = env.ledger().get();
    ledger_info.timestamp = 1000;
    env.ledger().set(ledger_info);
    
    let client = AcademyRewardsContractClient::new(&env, &env.register_contract(None, AcademyRewardsContract {}));
    client.initialize(&admin).unwrap();
    
    let user = Address::generate(&env);
    
    // Create and mint multiple badges
    for i in 1..=10 {
        client.create_badge_type(
            &admin,
            &i,
            &String::from_str(&env, &format!("Badge{}", i)),
            &(i * 100),
            &10,
            &3600,
        ).unwrap();
        client.mint_badge(&admin, &user, &i).unwrap();
    }
    
    // Check state persistence
    for i in 1..=10 {
        let total_minted = client.get_total_minted(&i);
        assert_eq!(total_minted, 1);
        
        let metadata = client.get_badge_metadata(&i).unwrap();
        assert_eq!(metadata.discount_bps, (i * 100) as u32);
    }
    
    // Test redemption history
    for i in 0..5 {
        let tx_hash = format!("tx_{}", i);
        let result = client.redeem_badge(&user, &String::from_str(&env, &tx_hash));
        assert!(result.is_ok());
        
        let history = client.get_redemption_history(&user, &(i as u32)).unwrap();
        assert_eq!(history.badge_type, (i % 10 + 1) as u32);
        assert_eq!(history.discount_applied, ((i % 10 + 1) * 100) as u32);
    }
    
    // Verify no data loss
    let final_badge = client.get_user_badge(&user).unwrap();
    assert!(final_badge.active);
    assert_eq!(final_badge.redeemed_count, 5);
}

#[test]
fn test_academy_error_recovery() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let mut ledger_info = env.ledger().get();
    ledger_info.timestamp = 1000;
    env.ledger().set(ledger_info);
    
    let client = AcademyRewardsContractClient::new(&env, &env.register_contract(None, AcademyRewardsContract {}));
    client.initialize(&admin).unwrap();
    
    let user = Address::generate(&env);
    
    // Perform some valid operations
    client.create_badge_type(&admin, &1, &String::from_str(&env, "TestBadge"), &500, &10, &3600).unwrap();
    client.mint_badge(&admin, &user, &1).unwrap();
    
    // Try some invalid operations that should fail gracefully
    let invalid_results = vec![
        client.try_create_badge_type(&admin, &1, &String::from_str(&env, "Duplicate"), &500, &10, &3600), // Duplicate badge type
        client.try_mint_badge(&admin, &user, &999), // Non-existent badge type
        client.try_redeem_badge(&user, &String::from_str(&env, "non_existent_tx")), // User has no badge for this tx yet
    ];
    
    // All should fail but not panic
    for result in invalid_results {
        assert!(result.is_err());
    }
    
    // Contract should still be functional
    let valid_result = client.try_redeem_badge(&user, &String::from_str(&env, "valid_tx_1"));
    assert!(valid_result.is_ok());
    
    // State should be consistent
    let total_minted = client.get_total_minted(&1);
    assert_eq!(total_minted, 1);
}

#[test]
fn test_academy_boundary_conditions() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let mut ledger_info = env.ledger().get();
    ledger_info.timestamp = 1000;
    env.ledger().set(ledger_info);
    
    let client = AcademyRewardsContractClient::new(&env, &env.register_contract(None, AcademyRewardsContract {}));
    client.initialize(&admin).unwrap();
    
    let user = Address::generate(&env);
    
    // Test boundary discount values
    let boundary_discounts = vec![
        0u32,        // Minimum
        1u32,        // Minimum positive
        5000u32,     // Middle
        9999u32,     // Near maximum
        10000u32,    // Maximum
    ];
    
    for (i, discount) in boundary_discounts.iter().enumerate() {
        let badge_type = (i + 1) as u32;
        let result = client.try_create_badge_type(
            &admin,
            &badge_type,
            &String::from_str(&env, &format!("Discount{}", discount)),
            discount,
            &10,
            &3600,
        );
        
        if *discount <= 10000 {
            assert!(result.is_ok());
            client.mint_badge(&admin, &user, &badge_type).unwrap();
            let user_discount = client.get_user_discount(&user);
            assert_eq!(user_discount, *discount);
        } else {
            assert!(result.is_err());
        }
    }
}