use proptest::prelude::*;
use proptest::strategy::{BoxedStrategy, Strategy};
use soroban_sdk::{testutils::Address as _, Address, Env, IntoVal, Symbol, Vec};
use std::collections::HashMap;

use trading::{UpgradeableTradingContract, UpgradeableTradingContractClient, TradeError};

#[derive(Debug, Clone)]
enum TradeAction {
    Trade { trader_idx: usize, pair: String, amount: i128, price: i128, is_buy: bool },
    GetStats,
    Pause { admin_idx: usize },
    Unpause { admin_idx: usize },
}

impl Arbitrary for TradeAction {
    type Parameters = ();
    type Strategy = BoxedStrategy<Self>;

    fn arbitrary_with(_args: Self::Parameters) -> Self::Strategy {
        prop_oneof![
            (0..5usize, "[A-Z]{3,6}", 1i128..100000i128, 1i128..10000i128, any::<bool>())
                .prop_map(|(trader_idx, pair, amount, price, is_buy)| TradeAction::Trade {
                    trader_idx,
                    pair: pair.to_string(),
                    amount,
                    price,
                    is_buy,
                }),
            Just(TradeAction::GetStats),
            (0..1usize).prop_map(|admin_idx| TradeAction::Pause { admin_idx }),
            (0..1usize).prop_map(|admin_idx| TradeAction::Unpause { admin_idx }),
        ]
        .boxed()
    }
}

#[derive(Debug, Clone)]
struct TestState {
    addresses: Vec<Address>,
    total_trades: u64,
    total_volume: i128,
    is_paused: bool,
}

impl TestState {
    fn new(addresses: Vec<Address>) -> Self {
        Self {
            addresses,
            total_trades: 0,
            total_volume: 0,
            is_paused: false,
        }
    }
    
    fn apply_action(&mut self, action: &TradeAction) -> Result<Option<u64>, TradeError> {
        match action {
            TradeAction::Trade { trader_idx, amount, is_buy, .. } => {
                if self.is_paused {
                    return Err(TradeError::ContractPaused);
                }
                
                if *amount <= 0 {
                    return Err(TradeError::InvalidAmount);
                }
                
                if *trader_idx >= self.addresses.len() {
                    return Err(TradeError::Unauthorized);
                }
                
                self.total_trades += 1;
                self.total_volume += *amount;
                Ok(Some(self.total_trades))
            }
            TradeAction::GetStats => {
                Ok(None)
            }
            TradeAction::Pause { admin_idx } => {
                if *admin_idx >= self.addresses.len() {
                    return Err(TradeError::Unauthorized);
                }
                self.is_paused = true;
                Ok(None)
            }
            TradeAction::Unpause { admin_idx } => {
                if *admin_idx >= self.addresses.len() {
                    return Err(TradeError::Unauthorized);
                }
                self.is_paused = false;
                Ok(None)
            }
        }
    }
}

proptest! {
    #[test]
    fn property_based_trading_invariants(
        actions in prop::collection::vec(any::<TradeAction>(), 10..50),
    ) {
        let env = Env::default();
        let admin = Address::generate(&env);
        let approvers = Vec::new(&env);
        let executor = Address::generate(&env);
        
        let client = UpgradeableTradingContractClient::new(&env, &env.register_contract(None, UpgradeableTradingContract {}));
        client.init(&admin, &approvers, &executor).unwrap();
        
        let addresses: Vec<Address> = (0..5).map(|_| Address::generate(&env)).collect();
        let mut state = TestState::new(addresses.clone());
        
        for action in actions {
            let result = state.apply_action(&action);
            
            match action {
                TradeAction::Trade { trader_idx, pair, amount, price, is_buy } => {
                    if *trader_idx < addresses.len() && !state.is_paused && *amount > 0 {
                        let trade_result = client.trade(
                            &addresses[*trader_idx],
                            &Symbol::new(&env, pair),
                            amount,
                            price,
                            is_buy,
                            &Address::generate(&env),
                            &0i128,
                            &Address::generate(&env),
                        );
                        
                        prop_assert!(trade_result.is_ok());
                        if let Ok(trade_id) = trade_result {
                            prop_assert!(trade_id > 0);
                        }
                    } else {
                        // Should fail
                        let trade_result = client.trade(
                            &addresses.get(*trader_idx).unwrap_or(&admin),
                            &Symbol::new(&env, pair),
                            amount,
                            price,
                            is_buy,
                            &Address::generate(&env),
                            &0i128,
                            &Address::generate(&env),
                        );
                        prop_assert!(trade_result.is_err());
                    }
                }
                TradeAction::GetStats => {
                    let stats = client.get_stats();
                    prop_assert!(stats.total_trades >= 0);
                    prop_assert!(stats.total_volume >= 0);
                }
                TradeAction::Pause { admin_idx } => {
                    if *admin_idx == 0 {
                        let result = client.pause(&admin);
                        prop_assert!(result.is_ok());
                    }
                }
                TradeAction::Unpause { admin_idx } => {
                    if *admin_idx == 0 {
                        let result = client.unpause(&admin);
                        prop_assert!(result.is_ok());
                    }
                }
            }
        }
        
        // Final state verification
        let final_stats = client.get_stats();
        prop_assert!(final_stats.total_trades >= 0);
        prop_assert!(final_stats.total_volume >= 0);
        prop_assert!(final_stats.last_trade_id >= 0);
    }
}

#[test]
fn test_trading_state_machine_invariants() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let approvers = Vec::new(&env);
    let executor = Address::generate(&env);
    
    let client = UpgradeableTradingContractClient::new(&env, &env.register_contract(None, UpgradeableTradingContract {}));
    client.init(&admin, &approvers, &executor).unwrap();
    
    // Test valid trade sequence
    let trader = Address::generate(&env);
    let pair = Symbol::new(&env, "XLMUSD");
    let fee_token = Address::generate(&env);
    let fee_recipient = Address::generate(&env);
    
    let trade_id = client.trade(&trader, &pair, &1000i128, &500i128, &true, &fee_token, &10i128, &fee_recipient).unwrap();
    assert!(trade_id > 0);
    
    let stats = client.get_stats();
    assert_eq!(stats.total_trades, 1);
    assert_eq!(stats.total_volume, 1000);
    assert_eq!(stats.last_trade_id, trade_id);
    
    // Test pause/unpause
    client.pause(&admin).unwrap();
    let paused_trade = client.trade(&trader, &pair, &500i128, &250i128, &false, &fee_token, &5i128, &fee_recipient);
    assert!(paused_trade.is_err());
    
    client.unpause(&admin).unwrap();
    let unpaused_trade = client.trade(&trader, &pair, &500i128, &250i128, &false, &fee_token, &5i128, &fee_recipient);
    assert!(unpaused_trade.is_ok());
}