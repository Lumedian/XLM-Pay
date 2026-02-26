use soroban_sdk::{testutils::Address as _, Address, Env, String, Symbol};
use academy_rewards::{AcademyRewardsContract, AcademyRewardsContractClient, ContractError};

fn test_cross_contract_academy_scenarios() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let mut ledger_info = env.ledger().get();
    ledger_info.timestamp = 1000;
    env.ledger().set(ledger_info);
    
    let client = AcademyRewardsContractClient::new(&env, &env.register_contract(None, AcademyRewardsContract {}));
    client.initialize(&admin).unwrap();
    
    let users: Vec<Address> = (0..5).map(|_| Address::generate(&env)).collect();
    
    // Test multiple badge types with different users
    let badge_configs = vec![
        (1u32, "Bronze", 500u32, 10u32, 3600u64),
        (2u32, "Silver", 1000u32, 5u32, 7200u64),
        (3u32, "Gold", 1500u32, 3u32, 10800u64),
    ];
    
    // Create all badge types
    for (badge_type, name, discount, max_redemptions, validity) in &badge_configs {
        client.create_badge_type(
            &admin,
            badge_type,
            &String::from_str(&env, name),
            discount,
            max_redemptions,
            validity,
        ).unwrap();
    }
    
    // Mint badges to different users
    for (i, user) in users.iter().enumerate() {
        let badge_type = ((i % 3) + 1) as u32;
        client.mint_badge(&admin, user, &badge_type).unwrap();
        
        // Verify the correct badge was assigned
        let user_badge = client.get_user_badge(user).unwrap();
        assert_eq!(user_badge.badge_type, badge_type);
        
        let expected_discount = badge_configs[(badge_type - 1) as usize].2;
        assert_eq!(user_badge.discount_bps, expected_discount);
    }
    
    // Test badge redemption by multiple users
    for (i, user) in users.iter().enumerate() {
        let tx_hash = format!("tx_user_{}_1", i);
        let result = client.redeem_badge(user, &String::from_str(&env, &tx_hash));
        assert!(result.is_ok());
        
        // Verify redemption history
        let history = client.get_redemption_history(user, &0).unwrap();
        let badge_type = ((i % 3) + 1) as u32;
        assert_eq!(history.badge_type, badge_type);
        
        let expected_discount = badge_configs[(badge_type - 1) as usize].2;
        assert_eq!(history.discount_applied, expected_discount);
    }
    
    // Check total minted counts
    let total_minted_1 = client.get_total_minted(&1);
    let total_minted_2 = client.get_total_minted(&2);
    let total_minted_3 = client.get_total_minted(&3);
    
    // Should have approximately equal distribution
    assert!(total_minted_1 >= 1);
    assert!(total_minted_2 >= 1);
    assert!(total_minted_3 >= 1);
}

fn test_academy_time_based_scenarios() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let mut ledger_info = env.ledger().get();
    ledger_info.timestamp = 1000;
    env.ledger().set(ledger_info);
    
    let client = AcademyRewardsContractClient::new(&env, &env.register_contract(None, AcademyRewardsContract {}));
    client.initialize(&admin).unwrap();
    
    let user = Address::generate(&env);
    
    // Create badge with expiry
    client.create_badge_type(&admin, &1, &String::from_str(&env, "TimeBasedBadge"), &500, &10, &3600).unwrap();
    client.mint_badge(&admin, &user, &1).unwrap();
    
    // Test before expiry
    let discount_before_expiry = client.get_user_discount(&user);
    assert_eq!(discount_before_expiry, 500);
    
    // Test redemption before expiry
    let redemption_result = client.try_redeem_badge(&user, &String::from_str(&env, "tx_1"));
    assert!(redemption_result.is_ok());
    
    // Simulate time passing (expiry at 1000 + 3600 = 4600)
    ledger_info.timestamp = 5000; // After expiry
    env.ledger().set(ledger_info);
    
    // Test after expiry
    let discount_after_expiry = client.get_user_discount(&user);
    assert_eq!(discount_after_expiry, 0);
    
    // Test redemption after expiry should fail
    let redemption_after_expiry = client.try_redeem_badge(&user, &String::from_str(&env, "tx_2"));
    assert!(redemption_after_expiry.is_err());
}

fn test_academy_revoke_integration() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let mut ledger_info = env.ledger().get();
    ledger_info.timestamp = 1000;
    env.ledger().set(ledger_info);
    
    let client = AcademyRewardsContractClient::new(&env, &env.register_contract(None, AcademyRewardsContract {}));
    client.initialize(&admin).unwrap();
    
    let users: Vec<Address> = (0..3).map(|_| Address::generate(&env)).collect();
    
    // Create badge type
    client.create_badge_type(&admin, &1, &String::from_str(&env, "RevokeTestBadge"), &500, &10, &3600).unwrap();
    
    // Mint badges to multiple users
    for user in &users {
        client.mint_badge(&admin, user, &1).unwrap();
    }
    
    // Verify all users have active badges
    for user in &users {
        let discount = client.get_user_discount(user);
        assert_eq!(discount, 500);
    }
    
    // Revoke badges from first two users
    client.revoke_badge(&admin, &users[0]).unwrap();
    client.revoke_badge(&admin, &users[1]).unwrap();
    
    // Verify first two users have no discount
    let discount_user_0 = client.get_user_discount(&users[0]);
    let discount_user_1 = client.get_user_discount(&users[1]);
    let discount_user_2 = client.get_user_discount(&users[2]);
    
    assert_eq!(discount_user_0, 0);
    assert_eq!(discount_user_1, 0);
    assert_eq!(discount_user_2, 500); // Third user still active
    
    // Test redemption by revoked users should fail
    let redeem_result_0 = client.try_redeem_badge(&users[0], &String::from_str(&env, "tx_1"));
    let redeem_result_1 = client.try_redeem_badge(&users[1], &String::from_str(&env, "tx_2"));
    let redeem_result_2 = client.try_redeem_badge(&users[2], &String::from_str(&env, "tx_3"));
    
    assert!(redeem_result_0.is_err());
    assert!(redeem_result_1.is_err());
    assert!(redeem_result_2.is_ok());
}

fn test_academy_pause_integration() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let mut ledger_info = env.ledger().get();
    ledger_info.timestamp = 1000;
    env.ledger().set(ledger_info);
    
    let client = AcademyRewardsContractClient::new(&env, &env.register_contract(None, AcademyRewardsContract {}));
    client.initialize(&admin).unwrap();
    
    let user = Address::generate(&env);
    
    // Create and mint badge
    client.create_badge_type(&admin, &1, &String::from_str(&env, "PauseTestBadge"), &500, &10, &3600).unwrap();
    client.mint_badge(&admin, &user, &1).unwrap();
    
    // Test normal operations
    let normal_discount = client.get_user_discount(&user);
    assert_eq!(normal_discount, 500);
    
    // Test normal redemption
    let normal_redeem = client.try_redeem_badge(&user, &String::from_str(&env, "tx_1"));
    assert!(normal_redeem.is_ok());
    
    // Pause the contract
    client.set_paused(&admin, &true).unwrap();
    
    // Test operations while paused
    let paused_discount = client.get_user_discount(&user);
    assert_eq!(paused_discount, 500); // Should still return discount but can't redeem
    
    let paused_redeem = client.try_redeem_badge(&user, &String::from_str(&env, "tx_2"));
    assert!(paused_redeem.is_err());
    
    let paused_mint = client.try_mint_badge(&admin, &user, &1);
    assert!(paused_mint.is_err());
    
    // Unpause the contract
    client.set_paused(&admin, &false).unwrap();
    
    // Test operations after unpausing
    let unpaused_discount = client.get_user_discount(&user);
    assert_eq!(unpaused_discount, 500);
    
    let unpaused_redeem = client.try_redeem_badge(&user, &String::from_str(&env, "tx_3"));
    assert!(unpaused_redeem.is_ok());
}

fn test_academy_metadata_integration() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let mut ledger_info = env.ledger().get();
    ledger_info.timestamp = 1000;
    env.ledger().set(ledger_info);
    
    let client = AcademyRewardsContractClient::new(&env, &env.register_contract(None, AcademyRewardsContract {}));
    client.initialize(&admin).unwrap();
    
    let user = Address::generate(&env);
    
    // Create badge type with specific metadata
    let badge_type = 1u32;
    let name = "MetadataTestBadge";
    let discount_bps = 750u32;
    let max_redemptions = 15u32;
    let validity_duration = 7200u64;
    
    client.create_badge_type(
        &admin,
        &badge_type,
        &String::from_str(&env, name),
        &discount_bps,
        &max_redemptions,
        &validity_duration,
    ).unwrap();
    
    // Verify metadata
    let metadata = client.get_badge_metadata(&badge_type).unwrap();
    assert_eq!(metadata.name, String::from_str(&env, name));
    assert_eq!(metadata.discount_bps, discount_bps);
    assert_eq!(metadata.max_redemptions, max_redemptions);
    assert_eq!(metadata.validity_duration, validity_duration);
    assert_eq!(metadata.enabled, true);
    
    // Mint badge and verify it has correct properties
    client.mint_badge(&admin, &user, &badge_type).unwrap();
    
    let user_badge = client.get_user_badge(&user).unwrap();
    assert_eq!(user_badge.badge_type, badge_type);
    assert_eq!(user_badge.discount_bps, discount_bps);
    assert_eq!(user_badge.max_redemptions, max_redemptions);
    assert_eq!(user_badge.active, true);
    
    // Test redemption limit
    for i in 0..max_redemptions {
        let tx_hash = format!("tx_{}", i);
        let result = client.redeem_badge(&user, &String::from_str(&env, &tx_hash));
        assert!(result.is_ok());
        
        let history = client.get_redemption_history(&user, &i).unwrap();
        assert_eq!(history.badge_type, badge_type);
        assert_eq!(history.discount_applied, discount_bps);
    }
    
    // Next redemption should fail due to limit
    let limit_reached = client.try_redeem_badge(&user, &String::from_str(&env, "tx_limit"));
    assert!(limit_reached.is_err());
}

#[test]
fn test_cross_contract_academy_integration() {
    test_cross_contract_academy_scenarios();
}

#[test]
fn test_academy_time_based_integration() {
    test_academy_time_based_scenarios();
}

#[test]
fn test_academy_revoke_integration() {
    test_academy_revoke_integration();
}

#[test]
fn test_academy_pause_integration() {
    test_academy_pause_integration();
}

#[test]
fn test_academy_metadata_integration() {
    test_academy_metadata_integration();
}