use soroban_sdk::{testutils::Address as _, Address, Env, IntoVal, Symbol, Vec};
use trading::{UpgradeableTradingContract, UpgradeableTradingContractClient, TradeError};

#[test]
fn test_trading_edge_cases() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let approvers = Vec::new(&env);
    let executor = Address::generate(&env);
    
    let client = UpgradeableTradingContractClient::new(&env, &env.register_contract(None, UpgradeableTradingContract {}));
    client.init(&admin, &approvers, &executor).unwrap();
    
    let trader = Address::generate(&env);
    let pair = Symbol::new(&env, "XLMUSD");
    let fee_token = Address::generate(&env);
    let fee_recipient = Address::generate(&env);
    
    // Test zero amount
    let zero_result = client.trade(&trader, &pair, &0i128, &100i128, &true, &fee_token, &0i128, &fee_recipient);
    assert!(zero_result.is_err());
    
    // Test negative amount
    let negative_result = client.trade(&trader, &pair, &(-100i128), &100i128, &true, &fee_token, &0i128, &fee_recipient);
    assert!(negative_result.is_err());
    
    // Test maximum values
    let max_result = client.trade(&trader, &pair, &i128::MAX, &100i128, &true, &fee_token, &0i128, &fee_recipient);
    // Should either succeed or fail gracefully, but not panic
    match max_result {
        Ok(_) => {
            // Success is acceptable
            let stats = client.get_stats();
            assert_eq!(stats.total_trades, 1);
        }
        Err(_) => {
            // Error is also acceptable
        }
    }
    
    // Test minimum values
    let min_result = client.trade(&trader, &pair, &1i128, &1i128, &true, &fee_token, &0i128, &fee_recipient);
    assert!(min_result.is_ok());
}

#[test]
fn test_trading_pause_edge_cases() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let approvers = Vec::new(&env);
    let executor = Address::generate(&env);
    
    let client = UpgradeableTradingContractClient::new(&env, &env.register_contract(None, UpgradeableTradingContract {}));
    client.init(&admin, &approvers, &executor).unwrap();
    
    let trader = Address::generate(&env);
    let pair = Symbol::new(&env, "XLMUSD");
    let fee_token = Address::generate(&env);
    let fee_recipient = Address::generate(&env);
    
    // Test pause/unpause with invalid admin
    let invalid_admin = Address::generate(&env);
    let pause_result = client.pause(&invalid_admin);
    assert!(pause_result.is_err());
    
    // Test valid pause
    client.pause(&admin).unwrap();
    
    // Test trade while paused
    let trade_while_paused = client.trade(&trader, &pair, &1000i128, &100i128, &true, &fee_token, &0i128, &fee_recipient);
    assert!(trade_while_paused.is_err());
    
    // Test unpause with invalid admin
    let unpause_result = client.unpause(&invalid_admin);
    assert!(unpause_result.is_err());
    
    // Test valid unpause
    client.unpause(&admin).unwrap();
    
    // Test trade after unpause
    let trade_after_unpause = client.trade(&trader, &pair, &1000i128, &100i128, &true, &fee_token, &0i128, &fee_recipient);
    assert!(trade_after_unpause.is_ok());
}

#[test]
fn test_trading_concurrent_operations() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let approvers = Vec::new(&env);
    let executor = Address::generate(&env);
    
    let client = UpgradeableTradingContractClient::new(&env, &env.register_contract(None, UpgradeableTradingContract {}));
    client.init(&admin, &approvers, &executor).unwrap();
    
    let traders: Vec<Address> = (0..5).map(|_| Address::generate(&env)).collect();
    let pair = Symbol::new(&env, "XLMUSD");
    let fee_token = Address::generate(&env);
    let fee_recipient = Address::generate(&env);
    
    // Simulate concurrent trades
    for (i, trader) in traders.iter().enumerate() {
        let amount = (i as i128 + 1) * 100;
        let price = (i as i128 + 1) * 50;
        
        let result = client.trade(trader, &pair, &amount, &price, &true, &fee_token, &0i128, &fee_recipient);
        assert!(result.is_ok());
    }
    
    let stats = client.get_stats();
    assert_eq!(stats.total_trades, 5);
    assert_eq!(stats.total_volume, 1500); // 100 + 200 + 300 + 400 + 500
}

#[test]
fn test_trading_extreme_values() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let approvers = Vec::new(&env);
    let executor = Address::generate(&env);
    
    let client = UpgradeableTradingContractClient::new(&env, &env.register_contract(None, UpgradeableTradingContract {}));
    client.init(&admin, &approvers, &executor).unwrap();
    
    let trader = Address::generate(&env);
    let pair = Symbol::new(&env, "XLMUSD");
    let fee_token = Address::generate(&env);
    let fee_recipient = Address::generate(&env);
    
    // Test with very large amounts
    let large_amounts = vec![
        i128::MAX / 1000000, // Large but manageable
        i128::MAX / 10000,   // Very large
        1_000_000_000_000i128, // 1 trillion
    ];
    
    for amount in large_amounts {
        let result = client.trade(&trader, &pair, &amount, &100i128, &true, &fee_token, &0i128, &fee_recipient);
        // Should not panic, either succeed or fail gracefully
        match result {
            Ok(trade_id) => {
                assert!(trade_id > 0);
            }
            Err(_) => {
                // Error is acceptable for extreme values
            }
        }
    }
    
    // Test with very small positive values
    let small_amounts = vec![1i128, 2i128, 10i128];
    
    for amount in small_amounts {
        let result = client.trade(&trader, &pair, &amount, &100i128, &true, &fee_token, &0i128, &fee_recipient);
        assert!(result.is_ok());
    }
}

#[test]
fn test_trading_symbol_edge_cases() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let approvers = Vec::new(&env);
    let executor = Address::generate(&env);
    
    let client = UpgradeableTradingContractClient::new(&env, &env.register_contract(None, UpgradeableTradingContract {}));
    client.init(&admin, &approvers, &executor).unwrap();
    
    let trader = Address::generate(&env);
    let fee_token = Address::generate(&env);
    let fee_recipient = Address::generate(&env);
    
    // Test with various symbol lengths
    let test_pairs = vec![
        "A",           // 1 character
        "AB",          // 2 characters
        "XLM",         // 3 characters (common)
        "XLMUSD",      // 6 characters (common)
        "BTCUSDT",     // 7 characters
        "ETHUSDC",     // 7 characters
        "VERYLONGPAIRNAME", // Long name
    ];
    
    for pair_str in test_pairs {
        let pair = Symbol::new(&env, pair_str);
        let result = client.trade(&trader, &pair, &1000i128, &100i128, &true, &fee_token, &0i128, &fee_recipient);
        assert!(result.is_ok());
    }
    
    let stats = client.get_stats();
    assert_eq!(stats.total_trades, 7);
}

#[test]
fn test_trading_state_persistence() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let approvers = Vec::new(&env);
    let executor = Address::generate(&env);
    
    let client = UpgradeableTradingContractClient::new(&env, &env.register_contract(None, UpgradeableTradingContract {}));
    client.init(&admin, &approvers, &executor).unwrap();
    
    let trader = Address::generate(&env);
    let pair = Symbol::new(&env, "XLMUSD");
    let fee_token = Address::generate(&env);
    let fee_recipient = Address::generate(&env);
    
    // Perform multiple trades
    for i in 1..=10 {
        let amount = i * 100;
        let result = client.trade(&trader, &pair, &amount, &100i128, &true, &fee_token, &0i128, &fee_recipient);
        assert!(result.is_ok());
    }
    
    // Check state persistence
    let stats1 = client.get_stats();
    assert_eq!(stats1.total_trades, 10);
    assert_eq!(stats1.total_volume, 5500); // Sum of 100+200+...+1000
    assert_eq!(stats1.last_trade_id, 10);
    
    // Perform more trades
    for i in 11..=20 {
        let amount = i * 100;
        let result = client.trade(&trader, &pair, &amount, &100i128, &true, &fee_token, &0i128, &fee_recipient);
        assert!(result.is_ok());
    }
    
    // Check state is still consistent
    let stats2 = client.get_stats();
    assert_eq!(stats2.total_trades, 20);
    assert_eq!(stats2.total_volume, 21000); // Sum of 100+200+...+2000
    assert_eq!(stats2.last_trade_id, 20);
    
    // Verify no data loss
    assert!(stats2.total_trades >= stats1.total_trades);
    assert!(stats2.total_volume >= stats1.total_volume);
    assert!(stats2.last_trade_id >= stats1.last_trade_id);
}

#[test]
fn test_trading_error_recovery() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let approvers = Vec::new(&env);
    let executor = Address::generate(&env);
    
    let client = UpgradeableTradingContractClient::new(&env, &env.register_contract(None, UpgradeableTradingContract {}));
    client.init(&admin, &approvers, &executor).unwrap();
    
    let trader = Address::generate(&env);
    let pair = Symbol::new(&env, "XLMUSD");
    let fee_token = Address::generate(&env);
    let fee_recipient = Address::generate(&env);
    
    // Perform some valid trades
    let _ = client.trade(&trader, &pair, &1000i128, &100i128, &true, &fee_token, &0i128, &fee_recipient);
    let _ = client.trade(&trader, &pair, &2000i128, &100i128, &true, &fee_token, &0i128, &fee_recipient);
    
    // Try some invalid operations that should fail gracefully
    let invalid_results = vec![
        client.trade(&trader, &pair, &0i128, &100i128, &true, &fee_token, &0i128, &fee_recipient), // Zero amount
        client.trade(&trader, &pair, &(-500i128), &100i128, &true, &fee_token, &0i128, &fee_recipient), // Negative amount
    ];
    
    // All should fail but not panic
    for result in invalid_results {
        assert!(result.is_err());
    }
    
    // Contract should still be functional
    let valid_result = client.trade(&trader, &pair, &500i128, &100i128, &true, &fee_token, &0i128, &fee_recipient);
    assert!(valid_result.is_ok());
    
    // State should be consistent
    let stats = client.get_stats();
    assert_eq!(stats.total_trades, 3); // 2 valid + 1 valid after errors
}

#[test]
fn test_trading_boundary_conditions() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let approvers = Vec::new(&env);
    let executor = Address::generate(&env);
    
    let client = UpgradeableTradingContractClient::new(&env, &env.register_contract(None, UpgradeableTradingContract {}));
    client.init(&admin, &approvers, &executor).unwrap();
    
    let trader = Address::generate(&env);
    let pair = Symbol::new(&env, "XLMUSD");
    let fee_token = Address::generate(&env);
    let fee_recipient = Address::generate(&env);
    
    // Test boundary amounts
    let boundary_amounts = vec![
        1i128,           // Minimum positive
        i128::MAX,       // Maximum possible
        i128::MIN + 1,   // Near minimum
    ];
    
    for (i, amount) in boundary_amounts.iter().enumerate() {
        let result = client.trade(&trader, &pair, amount, &100i128, &true, &fee_token, &0i128, &fee_recipient);
        
        match result {
            Ok(trade_id) => {
                // Success case
                assert!(trade_id > 0);
                println!("Trade {} with amount {} succeeded with ID: {}", i, amount, trade_id);
            }
            Err(e) => {
                // Error case - should be expected errors
                assert!(matches!(e, TradeError::InvalidAmount));
                println!("Trade {} with amount {} failed as expected: {:?}", i, amount, e);
            }
        }
    }
}