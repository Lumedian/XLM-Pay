use proptest::prelude::*;
use soroban_sdk::{testutils::Address as _, Address, Env, IntoVal, Symbol};
use token::{TokenContract, TokenContractClient};
use arbitrary::{Arbitrary, Unstructured};
use std::collections::HashMap;

#[derive(Debug, Clone, Arbitrary)]
enum TokenAction {
    Transfer { from: usize, to: usize, amount: i128 },
    Approve { owner: usize, spender: usize, amount: i128, expiration_ledger: u32 },
    TransferFrom { spender: usize, from: usize, to: usize, amount: i128 },
    Mint { to: usize, amount: i128 },
    Burn { from: usize, amount: i128 },
    BurnFrom { spender: usize, from: usize, amount: i128 },
    SetAuthorized { id: usize, authorize: bool },
}

#[derive(Debug, Clone)]
struct TestState {
    addresses: Vec<Address>,
    balances: HashMap<usize, i128>,
    allowances: HashMap<(usize, usize), (i128, u32)>,
    authorized: HashMap<usize, bool>,
    total_supply: i128,
    admin: usize,
}

impl TestState {
    fn new(num_addresses: usize, admin_idx: usize) -> Self {
        let env = Env::default();
        let mut addresses = Vec::new();
        for _ in 0..num_addresses {
            addresses.push(Address::generate(&env));
        }
        
        let mut authorized = HashMap::new();
        authorized.insert(admin_idx, true);
        
        Self {
            addresses,
            balances: HashMap::new(),
            allowances: HashMap::new(),
            authorized,
            total_supply: 0,
            admin: admin_idx,
        }
    }
    
    fn apply_action(&mut self, action: &TokenAction, client: &TokenContractClient, env: &Env) {
        match action {
            TokenAction::Transfer { from, to, amount } => {
                if *amount <= 0 || from == to {
                    return;
                }
                let from_balance = self.balances.get(from).unwrap_or(&0);
                if *amount > *from_balance {
                    return; // Insufficient balance
                }
                
                client.transfer(&self.addresses[*from], &self.addresses[*to], amount);
                self.balances.insert(*from, *from_balance - amount);
                let to_balance = self.balances.get(to).unwrap_or(&0);
                self.balances.insert(*to, to_balance + amount);
            }
            TokenAction::Approve { owner, spender, amount, expiration_ledger } => {
                if *amount < 0 {
                    return;
                }
                let current_ledger = env.ledger().sequence();
                if *expiration_ledger < current_ledger && *amount != 0 {
                    return; // Invalid expiration
                }
                
                client.approve(&self.addresses[*owner], &self.addresses[*spender], amount, expiration_ledger);
                self.allowances.insert((*owner, *spender), (*amount, *expiration_ledger));
            }
            TokenAction::TransferFrom { spender, from, to, amount } => {
                if *amount <= 0 || from == to {
                    return;
                }
                
                let allowance_entry = self.allowances.get(&(*from, *spender));
                if let Some((allowance_amount, expiration_ledger)) = allowance_entry {
                    let current_ledger = env.ledger().sequence();
                    let available = if expiration_ledger < current_ledger {
                        0
                    } else {
                        allowance_amount
                    };
                    
                    if *amount > available {
                        return; // Allowance exceeded
                    }
                    
                    let from_balance = self.balances.get(from).unwrap_or(&0);
                    if *amount > *from_balance {
                        return; // Insufficient balance
                    }
                    
                    client.transfer_from(&self.addresses[*spender], &self.addresses[*from], &self.addresses[*to], amount);
                    
                    // Update state
                    self.balances.insert(*from, *from_balance - amount);
                    let to_balance = self.balances.get(to).unwrap_or(&0);
                    self.balances.insert(*to, to_balance + amount);
                    
                    let remaining = available - amount;
                    self.allowances.insert((*from, *spender), (remaining, *expiration_ledger));
                }
            }
            TokenAction::Mint { to, amount } => {
                if *amount < 0 {
                    return;
                }
                
                client.mint(&self.addresses[*to], amount);
                let to_balance = self.balances.get(to).unwrap_or(&0);
                self.balances.insert(*to, to_balance + amount);
                self.total_supply += amount;
            }
            TokenAction::Burn { from, amount } => {
                if *amount < 0 {
                    return;
                }
                
                let from_balance = self.balances.get(from).unwrap_or(&0);
                if *amount > *from_balance {
                    return; // Insufficient balance
                }
                
                client.burn(&self.addresses[*from], amount);
                self.balances.insert(*from, *from_balance - amount);
                self.total_supply -= amount;
            }
            TokenAction::BurnFrom { spender, from, amount } => {
                if *amount < 0 {
                    return;
                }
                
                let allowance_entry = self.allowances.get(&(*from, *spender));
                if let Some((allowance_amount, expiration_ledger)) = allowance_entry {
                    let current_ledger = env.ledger().sequence();
                    let available = if expiration_ledger < current_ledger {
                        0
                    } else {
                        allowance_amount
                    };
                    
                    if *amount > available {
                        return; // Allowance exceeded
                    }
                    
                    let from_balance = self.balances.get(from).unwrap_or(&0);
                    if *amount > *from_balance {
                        return; // Insufficient balance
                    }
                    
                    client.burn_from(&self.addresses[*spender], &self.addresses[*from], amount);
                    
                    // Update state
                    self.balances.insert(*from, *from_balance - amount);
                    self.total_supply -= amount;
                    let remaining = available - amount;
                    self.allowances.insert((*from, *spender), (remaining, *expiration_ledger));
                }
            }
            TokenAction::SetAuthorized { id, authorize } => {
                client.set_authorized(&self.addresses[*id], authorize);
                self.authorized.insert(*id, *authorize);
            }
        }
    }
    
    fn verify_invariants(&self, client: &TokenContractClient) -> Result<(), String> {
        // Check total supply equals sum of all balances
        let actual_total_supply = client.total_supply();
        let calculated_total_supply: i128 = self.balances.values().sum();
        if actual_total_supply != calculated_total_supply {
            return Err(format!("Total supply mismatch: contract={}, calculated={}", actual_total_supply, calculated_total_supply));
        }
        
        // Check all balances are non-negative
        for (idx, &expected_balance) in &self.balances {
            let actual_balance = client.balance(&self.addresses[*idx]);
            if actual_balance != expected_balance {
                return Err(format!("Balance mismatch for address {}: contract={}, expected={}", idx, actual_balance, expected_balance));
            }
            if actual_balance < 0 {
                return Err(format!("Negative balance for address {}: {}", idx, actual_balance));
            }
        }
        
        // Check allowances
        for ((owner, spender), &(expected_amount, expiration_ledger)) in &self.allowances {
            let current_ledger = client.env.ledger().sequence();
            let expected_available = if *expiration_ledger < current_ledger {
                0
            } else {
                *expected_amount
            };
            
            let actual_allowance = client.allowance(&self.addresses[*owner], &self.addresses[*spender]);
            if actual_allowance != expected_available {
                return Err(format!("Allowance mismatch for {}->{}: contract={}, expected={}", owner, spender, actual_allowance, expected_available));
            }
        }
        
        Ok(())
    }
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(100))]
    
    #[test]
    fn property_based_state_machine_invariants(
        initial_supply in 1_000i128..1_000_000i128,
        actions in prop::collection::vec(any::<TokenAction>(), 10..100),
    ) {
        let env = Env::default();
        env.mock_all_auths();
        
        let contract_id = env.register_contract(None, TokenContract);
        let client = TokenContractClient::new(&env, &contract_id);
        
        let admin = Address::generate(&env);
        client.initialize(
            &admin,
            &"Stellara Token".into_val(&env),
            &"STLR".into_val(&env),
            &7,
        );
        
        let mut state = TestState::new(10, 0);
        state.addresses[0] = admin.clone();
        
        // Mint initial supply to admin
        client.mint(&admin, &initial_supply);
        state.balances.insert(0, initial_supply);
        state.total_supply = initial_supply;
        
        // Apply actions and verify invariants
        for action in actions {
            state.apply_action(&action, &client, &env);
            
            // Verify invariants after each action
            if let Err(e) = state.verify_invariants(&client) {
                prop_assert!(false, "Invariant violation after action {:?}: {}", action, e);
            }
        }
    }
    
    #[test]
    fn property_based_transfer_commutativity(
        initial_balance_a in 1_000i128..100_000i128,
        initial_balance_b in 1_000i128..100_000i128,
        transfer_amount in 1i128..50_000i128,
    ) {
        let env = Env::default();
        env.mock_all_auths();
        
        let contract_id = env.register_contract(None, TokenContract);
        let client = TokenContractClient::new(&env, &contract_id);
        
        let admin = Address::generate(&env);
        let user_a = Address::generate(&env);
        let user_b = Address::generate(&env);
        
        client.initialize(
            &admin,
            &"Stellara Token".into_val(&env),
            &"STLR".into_val(&env),
            &7,
        );
        
        client.mint(&user_a, &initial_balance_a);
        client.mint(&user_b, &initial_balance_b);
        
        let amount = transfer_amount.min(initial_balance_a);
        
        // Transfer A -> B, then B -> A with same amount
        client.transfer(&user_a, &user_b, &amount);
        client.transfer(&user_b, &user_a, &amount);
        
        // Final balances should be the same as initial
        prop_assert_eq!(client.balance(&user_a), initial_balance_a);
        prop_assert_eq!(client.balance(&user_b), initial_balance_b);
    }
    
    #[test]
    fn property_based_allowance_monotonic_decrease(
        initial_allowance in 100i128..10_000i128,
        transfer_amounts in prop::collection::vec(1i128..1_000i128, 1..10),
    ) {
        let env = Env::default();
        env.mock_all_auths();
        
        let contract_id = env.register_contract(None, TokenContract);
        let client = TokenContractClient::new(&env, &contract_id);
        
        let admin = Address::generate(&env);
        let owner = Address::generate(&env);
        let spender = Address::generate(&env);
        let recipient = Address::generate(&env);
        
        client.initialize(
            &admin,
            &"Stellara Token".into_val(&env),
            &"STLR".into_val(&env),
            &7,
        );
        
        client.mint(&owner, &(initial_allowance * 2));
        
        let current_ledger = env.ledger().sequence();
        client.approve(&owner, &spender, &initial_allowance, &(current_ledger + 1000));
        
        let mut remaining_allowance = initial_allowance;
        
        for &amount in &transfer_amounts {
            if amount <= remaining_allowance {
                client.transfer_from(&spender, &owner, &recipient, &amount);
                remaining_allowance -= amount;
                
                let current_allowance = client.allowance(&owner, &spender);
                prop_assert_eq!(current_allowance, remaining_allowance);
                prop_assert!(current_allowance <= initial_allowance);
            } else {
                // Should fail when trying to exceed allowance
                break;
            }
        }
    }
    
    #[test]
    fn property_based_burn_mint_conservation(
        initial_supply in 10_000i128..1_000_000i128,
        operations in prop::collection::vec(
            prop_oneof![
                (1i128..10_000i128).prop_map(|amount| ('m', amount)), // mint
                (1i128..10_000i128).prop_map(|amount| ('b', amount)), // burn
            ],
            10..50
        ),
    ) {
        let env = Env::default();
        env.mock_all_auths();
        
        let contract_id = env.register_contract(None, TokenContract);
        let client = TokenContractClient::new(&env, &contract_id);
        
        let admin = Address::generate(&env);
        let user = Address::generate(&env);
        
        client.initialize(
            &admin,
            &"Stellara Token".into_val(&env),
            &"STLR".into_val(&env),
            &7,
        );
        
        client.mint(&user, &initial_supply);
        let mut expected_supply = initial_supply;
        
        for (op_type, amount) in operations {
            match op_type {
                'm' => {
                    client.mint(&user, &amount);
                    expected_supply += amount;
                }
                'b' => {
                    let current_balance = client.balance(&user);
                    let burn_amount = amount.min(current_balance);
                    if burn_amount > 0 {
                        client.burn(&user, &burn_amount);
                        expected_supply -= burn_amount;
                    }
                }
                _ => unreachable!(),
            }
            
            let actual_supply = client.total_supply();
            prop_assert_eq!(actual_supply, expected_supply);
            prop_assert!(actual_supply >= 0);
        }
    }
}
