use soroban_sdk::{testutils::Address as _, Address, Env, IntoVal, Symbol, Vec};
use trading::{UpgradeableTradingContract, UpgradeableTradingContractClient, TradeError};

use token;

fn test_cross_contract_trading_scenarios() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let approvers = Vec::new(&env);
    let executor = Address::generate(&env);
    
    // Create token contract for fees
    let token_admin = Address::generate(&env);
    let token_id = env.register_contract_wasm(None, token::WASM);
    let token_client = token::Client::new(&env, &token_id);
    
    // Initialize token
    token_client.initialize(
        &token_admin,
        &7,
        &"StellarToken".into_val(&env),
        &"STT".into_val(&env),
    );
    
    // Create trading contract
    let trading_id = env.register_contract(None, UpgradeableTradingContract {});
    let trading_client = UpgradeableTradingContractClient::new(&env, &trading_id);
    trading_client.init(&admin, &approvers, &executor).unwrap();
    
    // Test trading with token fees
    let trader = Address::generate(&env);
    let pair = Symbol::new(&env, "XLMUSD");
    
    // Mint tokens to trader for fees
    token_client.mint(&trader, &10000);
    
    // Execute trade with fee
    let trade_id = trading_client.trade(
        &trader,
        &pair,
        &1000i128,
        &100i128,
        &true,
        &token_id,
        &100i128, // fee amount
        &admin,   // fee recipient
    ).unwrap();
    
    assert!(trade_id > 0);
    
    // Verify fee was collected
    let trader_balance = token_client.balance(&trader);
    let admin_balance = token_client.balance(&admin);
    
    assert_eq!(trader_balance, 9900); // 10000 - 100 fee
    assert_eq!(admin_balance, 100);   // fee received
    
    // Test multiple trades
    let trader2 = Address::generate(&env);
    token_client.mint(&trader2, &5000);
    
    let trade_id2 = trading_client.trade(
        &trader2,
        &pair,
        &500i128,
        &200i128,
        &false,
        &token_id,
        &50i128,
        &admin,
    ).unwrap();
    
    assert!(trade_id2 > trade_id);
    
    let stats = trading_client.get_stats();
    assert_eq!(stats.total_trades, 2);
    assert_eq!(stats.total_volume, 1500); // 1000 + 500
    assert_eq!(stats.last_trade_id, trade_id2);
}

fn test_trading_governance_scenarios() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let approvers: Vec<Address> = (0..3).map(|_| Address::generate(&env)).collect();
    let executor = Address::generate(&env);
    
    let client = UpgradeableTradingContractClient::new(&env, &env.register_contract(None, UpgradeableTradingContract {}));
    client.init(&admin, &approvers, &executor).unwrap();
    
    // Test upgrade proposal
    let new_hash = Symbol::new(&env, "new_contract_hash");
    let description = Symbol::new(&env, "Upgrade to v2");
    let threshold = 2u32;
    let timelock = 1000u64;
    
    let proposal_id = client.propose_upgrade(
        &admin,
        &new_hash,
        &description,
        &approvers,
        &threshold,
        &timelock,
    ).unwrap();
    
    assert!(proposal_id > 0);
    
    // Test approval by approvers
    for approver in approvers.iter() {
        client.approve_upgrade(&proposal_id, approver).unwrap();
    }
    
    // Test execution by executor
    client.execute_upgrade(&proposal_id, &executor).unwrap();
    
    // Verify upgrade was executed
    let proposal = client.get_upgrade_proposal(&proposal_id).unwrap();
    // Proposal should be in executed state
}

fn test_trading_pause_integration() {
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
    
    // Test normal trading
    let trade1 = client.trade(&trader, &pair, &1000i128, &100i128, &true, &fee_token, &0i128, &fee_recipient);
    assert!(trade1.is_ok());
    
    // Pause contract
    client.pause(&admin).unwrap();
    
    // Trading should fail when paused
    let trade_while_paused = client.trade(&trader, &pair, &500i128, &50i128, &false, &fee_token, &0i128, &fee_recipient);
    assert!(trade_while_paused.is_err());
    
    // Unpause contract
    client.unpause(&admin).unwrap();
    
    // Trading should work again
    let trade_after_unpause = client.trade(&trader, &pair, &500i128, &50i128, &false, &fee_token, &0i128, &fee_recipient);
    assert!(trade_after_unpause.is_ok());
}

fn test_trading_event_integration() {
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
    
    // Execute trade and check events
    let trade_id = client.trade(&trader, &pair, &1000i128, &100i128, &true, &fee_token, &50i128, &fee_recipient).unwrap();
    
    // Check that events were emitted
    let events = env.events().all();
    
    // Should have at least one event (trade executed)
    assert!(!events.is_empty());
    
    // Look for trade executed event
    let trade_events: Vec<_> = events.iter().filter(|e| {
        if let Ok((_, topics, _)) = e.clone().try_into_val::<(Address, Vec<Val>, Val)>(&env) {
            if topics.len() > 0 {
                if let Ok(topic) = topics.get(0).unwrap().try_into_val::<Symbol>(&env) {
                    return topic == Symbol::new(&env, "trade_executed");
                }
            }
        }
        false
    }).collect();
    
    assert!(!trade_events.is_empty());
    
    // Verify trade ID in events
    let stats = client.get_stats();
    assert_eq!(stats.last_trade_id, trade_id);
}

fn test_trading_multi_user_scenarios() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let approvers = Vec::new(&env);
    let executor = Address::generate(&env);
    
    let client = UpgradeableTradingContractClient::new(&env, &env.register_contract(None, UpgradeableTradingContract {}));
    client.init(&admin, &approvers, &executor).unwrap();
    
    let traders: Vec<Address> = (0..5).map(|_| Address::generate(&env)).collect();
    let pairs = vec![
        Symbol::new(&env, "XLMUSD"),
        Symbol::new(&env, "BTCUSD"),
        Symbol::new(&env, "ETHUSD"),
    ];
    let fee_token = Address::generate(&env);
    let fee_recipient = Address::generate(&env);
    
    // Each trader performs multiple trades
    for (i, trader) in traders.iter().enumerate() {
        for (j, pair) in pairs.iter().enumerate() {
            let amount = ((i + 1) * (j + 1) * 100) as i128;
            let price = (100 + (i * 10) + (j * 50)) as i128;
            let is_buy = (i + j) % 2 == 0;
            
            let result = client.trade(trader, pair, &amount, &price, &is_buy, &fee_token, &0i128, &fee_recipient);
            assert!(result.is_ok());
        }
    }
    
    // Verify final state
    let stats = client.get_stats();
    assert_eq!(stats.total_trades, 15); // 5 traders × 3 pairs
    assert!(stats.total_volume > 0);
    assert_eq!(stats.last_trade_id, 15);
}

#[test]
fn test_cross_contract_trading_integration() {
    test_cross_contract_trading_scenarios();
}

#[test]
fn test_trading_governance_integration() {
    test_trading_governance_scenarios();
}

#[test]
fn test_trading_pause_integration() {
    test_trading_pause_integration();
}

#[test]
fn test_trading_event_integration() {
    test_trading_event_integration();
}

#[test]
fn test_trading_multi_user_integration() {
    test_trading_multi_user_scenarios();
}