// Test module organization for comprehensive token contract testing

mod conformance;
mod access_control;
mod adversarial;
mod property_based;
mod fuzzing;
mod edge_cases;
mod integration;
mod comprehensive;

// Re-export all tests for easy discovery
pub use conformance::*;
pub use access_control::*;
pub use adversarial::*;
pub use property_based::*;
pub use fuzzing::*;
pub use edge_cases::*;
pub use integration::*;
pub use comprehensive::*;

// Test utilities and helpers
use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, Address, Env, IntoVal};
use token::{TokenContract, TokenContractClient};

pub fn setup_token_contract(env: &Env, name: &str, symbol: &str, decimals: u32) -> (TokenContractClient, Address) {
    let contract_id = env.register_contract(None, TokenContract);
    let client = TokenContractClient::new(env, &contract_id);
    
    let admin = Address::generate(env);
    client.initialize(
        &admin,
        &name.into_val(env),
        &symbol.into_val(env),
        &decimals,
    );
    
    (client, admin)
}

pub fn create_test_addresses(env: &Env, count: usize) -> Vec<Address> {
    (0..count).map(|_| Address::generate(env)).collect()
}

pub fn mint_tokens_to_users(client: &TokenContractClient, users: &[Address], amounts: &[i128]) {
    for (user, &amount) in users.iter().zip(amounts.iter()) {
        if amount > 0 {
            client.mint(user, &amount);
        }
    }
}

pub fn verify_total_supply_conservation(client: &TokenContractClient, users: &[Address], expected_total: i128) -> bool {
    let actual_total = client.total_supply();
    let calculated_total: i128 = users.iter().map(|user| client.balance(user)).sum();
    
    actual_total == expected_total && actual_total == calculated_total
}

pub fn setup_allowances(
    client: &TokenContractClient,
    env: &Env,
    allowances: &[(usize, usize, i128)], // (owner_idx, spender_idx, amount)
) {
    let current_ledger = env.ledger().sequence();
    let users = create_test_addresses(env, 10); // Create enough users for indexing
    
    for &(owner_idx, spender_idx, amount) in allowances {
        if owner_idx < users.len() && spender_idx < users.len() && amount >= 0 {
            client.approve(
                &users[owner_idx],
                &users[spender_idx],
                &amount,
                &(current_ledger + 1000),
            );
        }
    }
}

// Test scenarios for comprehensive coverage
pub struct TestScenario {
    pub name: String,
    pub initial_balances: Vec<i128>,
    pub operations: Vec<TestOperation>,
}

#[derive(Debug, Clone)]
pub enum TestOperation {
    Transfer { from: usize, to: usize, amount: i128 },
    Approve { owner: usize, spender: usize, amount: i128 },
    TransferFrom { spender: usize, from: usize, to: usize, amount: i128 },
    Mint { to: usize, amount: i128 },
    Burn { from: usize, amount: i128 },
    BurnFrom { spender: usize, from: usize, amount: i128 },
    SetAuthorized { id: usize, authorize: bool },
}

impl TestScenario {
    pub fn execute(&self, env: &Env, client: &TokenContractClient, users: &[Address]) -> Result<(), String> {
        // Set up initial balances
        for (i, &balance) in self.initial_balances.iter().enumerate() {
            if i < users.len() && balance > 0 {
                client.mint(&users[i], &balance);
            }
        }
        
        // Execute operations
        for operation in &self.operations {
            match operation {
                TestOperation::Transfer { from, to, amount } => {
                    if *from < users.len() && *to < users.len() && *amount >= 0 {
                        client.transfer(&users[*from], &users[*to], amount);
                    }
                }
                TestOperation::Approve { owner, spender, amount } => {
                    if *owner < users.len() && *spender < users.len() && *amount >= 0 {
                        let current_ledger = env.ledger().sequence();
                        client.approve(&users[*owner], &users[*spender], amount, &(current_ledger + 1000));
                    }
                }
                TestOperation::TransferFrom { spender, from, to, amount } => {
                    if *spender < users.len() && *from < users.len() && *to < users.len() && *amount >= 0 {
                        client.transfer_from(&users[*spender], &users[*from], &users[*to], amount);
                    }
                }
                TestOperation::Mint { to, amount } => {
                    if *to < users.len() && *amount >= 0 {
                        client.mint(&users[*to], amount);
                    }
                }
                TestOperation::Burn { from, amount } => {
                    if *from < users.len() && *amount >= 0 {
                        client.burn(&users[*from], amount);
                    }
                }
                TestOperation::BurnFrom { spender, from, amount } => {
                    if *spender < users.len() && *from < users.len() && *amount >= 0 {
                        client.burn_from(&users[*spender], &users[*from], amount);
                    }
                }
                TestOperation::SetAuthorized { id, authorize } => {
                    if *id < users.len() {
                        client.set_authorized(&users[*id], authorize);
                    }
                }
            }
        }
        
        Ok(())
    }
}

// Predefined test scenarios for comprehensive coverage
pub fn get_test_scenarios() -> Vec<TestScenario> {
    vec![
        TestScenario {
            name: "Basic Transfer Flow".to_string(),
            initial_balances: vec![1000, 500, 200],
            operations: vec![
                TestOperation::Transfer { from: 0, to: 1, amount: 300 },
                TestOperation::Transfer { from: 1, to: 2, amount: 200 },
                TestOperation::Transfer { from: 2, to: 0, amount: 100 },
            ],
        },
        TestScenario {
            name: "Allowance Flow".to_string(),
            initial_balances: vec![1000, 0, 0],
            operations: vec![
                TestOperation::Approve { owner: 0, spender: 1, amount: 500 },
                TestOperation::TransferFrom { spender: 1, from: 0, to: 2, amount: 300 },
                TestOperation::TransferFrom { spender: 1, from: 0, to: 1, amount: 100 },
            ],
        },
        TestScenario {
            name: "Mint and Burn Flow".to_string(),
            initial_balances: vec![500, 300, 200],
            operations: vec![
                TestOperation::Mint { to: 0, amount: 1000 },
                TestOperation::Burn { from: 1, amount: 100 },
                TestOperation::BurnFrom { spender: 0, from: 2, amount: 50 },
            ],
        },
        TestScenario {
            name: "Authorization Flow".to_string(),
            initial_balances: vec![1000, 500, 200],
            operations: vec![
                TestOperation::SetAuthorized { id: 0, authorize: false },
                TestOperation::SetAuthorized { id: 1, authorize: true },
                TestOperation::SetAuthorized { id: 2, authorize: true },
            ],
        },
        TestScenario {
            name: "Complex Mixed Flow".to_string(),
            initial_balances: vec![2000, 1000, 500],
            operations: vec![
                TestOperation::Approve { owner: 0, spender: 1, amount: 800 },
                TestOperation::Transfer { from: 0, to: 2, amount: 500 },
                TestOperation::TransferFrom { spender: 1, from: 0, to: 2, amount: 300 },
                TestOperation::Mint { to: 1, amount: 400 },
                TestOperation::Burn { from: 2, amount: 200 },
                TestOperation::SetAuthorized { id: 0, authorize: true },
                TestOperation::Transfer { from: 1, to: 0, amount: 200 },
            ],
        },
    ]
}
