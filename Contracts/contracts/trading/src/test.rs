#![cfg(test)]

extern crate std;

use super::*;
use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, token, Address, Env, Symbol, Vec};
use shared::governance::ProposalStatus;
use shared::fees::FeeError;
use std::sync::Mutex;

static TEST_LOCK: Mutex<()> = Mutex::new(());

fn serial_lock() -> std::sync::MutexGuard<'static, ()> {
    TEST_LOCK.lock().expect("test lock poisoned")
}

fn setup_env() -> (Env, Address, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    set_timestamp(&env, 1000);

    let contract_id = env.register_contract(None, UpgradeableTradingContract);

    let admin = Address::generate(&env);
    let approver = Address::generate(&env);
    let executor = Address::generate(&env);

    (env, admin, approver, executor, contract_id)
}

fn init_contract(client: &UpgradeableTradingContractClient, admin: &Address, approvers: Vec<Address>, executor: &Address) {
    client.init(admin, &approvers, executor);
}

fn setup_fee_token(env: &Env) -> (Address, token::Client<'_>, token::StellarAssetClient<'_>) {
    let issuer = Address::generate(env);
    let token_id = env.register_stellar_asset_contract(issuer);
    let token_client = token::Client::new(env, &token_id);
    let token_admin = token::StellarAssetClient::new(env, &token_id);
    (token_id, token_client, token_admin)
}

fn set_timestamp(env: &Env, timestamp: u64) {
    let mut ledger_info = env.ledger().get();
    ledger_info.timestamp = timestamp;
    env.ledger().set(ledger_info);
}

#[contract]
struct TestOracle;

#[contractimpl]
impl TestOracle {
    pub fn get_price(_env: Env, _pair: Symbol) -> (i128, u64) {
        (100, 1000)
    }
}

#[test]
fn test_init_and_getters() {
    let _guard = serial_lock();
    let (env, admin, approver, executor, contract_id) = setup_env();
    let client = UpgradeableTradingContractClient::new(&env, &contract_id);
    let mut approvers = Vec::new(&env);
    approvers.push_back(approver);

    init_contract(&client, &admin, approvers, &executor);

    let version = client.get_version();
    let stats = client.get_stats();

    assert_eq!(version, 1);
    assert_eq!(stats.total_trades, 0);
    assert_eq!(stats.total_volume, 0);
    assert_eq!(stats.last_trade_id, 0);
}

#[test]
fn test_init_twice_fails() {
    let _guard = serial_lock();
    let (env, admin, approver, executor, contract_id) = setup_env();
    let client = UpgradeableTradingContractClient::new(&env, &contract_id);
    let mut approvers = Vec::new(&env);
    approvers.push_back(approver);

    init_contract(&client, &admin, approvers.clone(), &executor);

    let result = client.try_init(&admin, &approvers, &executor);
    assert_eq!(result, Err(Ok(TradeError::Unauthorized)));
}

#[test]
fn test_trade_happy_path_updates_stats_and_transfers_fee() {
    let _guard = serial_lock();
    let (env, admin, approver, executor, contract_id) = setup_env();
    let client = UpgradeableTradingContractClient::new(&env, &contract_id);
    let mut approvers = Vec::new(&env);
    approvers.push_back(approver);
    init_contract(&client, &admin, approvers, &executor);

    let (token_id, token_client, token_admin) = setup_fee_token(&env);
    let trader = Address::generate(&env);
    let fee_recipient = Address::generate(&env);

    token_admin.mint(&trader, &1000);

    let trade_id = client.trade(
        &trader,
        &Symbol::new(&env, "XLMUSDC"),
        &250,
        &10,
        &true,
        &token_id,
        &100,
        &fee_recipient,
    );

    assert_eq!(trade_id, 1);
    assert_eq!(token_client.balance(&trader), 900);
    assert_eq!(token_client.balance(&fee_recipient), 100);

    let stats = client.get_stats();
    assert_eq!(stats.total_trades, 1);
    assert_eq!(stats.total_volume, 250);
    assert_eq!(stats.last_trade_id, 1);
}

#[test]
fn test_trade_invalid_fee_amount_fails() {
    let _guard = serial_lock();
    let (env, admin, approver, executor, contract_id) = setup_env();
    let client = UpgradeableTradingContractClient::new(&env, &contract_id);
    let mut approvers = Vec::new(&env);
    approvers.push_back(approver);
    init_contract(&client, &admin, approvers, &executor);

    let (token_id, _token_client, token_admin) = setup_fee_token(&env);
    let trader = Address::generate(&env);
    let fee_recipient = Address::generate(&env);
    token_admin.mint(&trader, &1000);

    let result = client.try_trade(
        &trader,
        &Symbol::new(&env, "XLMUSDC"),
        &100,
        &10,
        &true,
        &token_id,
        &-1,
        &fee_recipient,
    );

    assert_eq!(result, Err(Ok(FeeError::InvalidAmount)));
}

#[test]
fn test_trade_insufficient_balance_fails() {
    let _guard = serial_lock();
    let (env, admin, approver, executor, contract_id) = setup_env();
    let client = UpgradeableTradingContractClient::new(&env, &contract_id);
    let mut approvers = Vec::new(&env);
    approvers.push_back(approver);
    init_contract(&client, &admin, approvers, &executor);

    let (token_id, _token_client, token_admin) = setup_fee_token(&env);
    let trader = Address::generate(&env);
    let fee_recipient = Address::generate(&env);
    token_admin.mint(&trader, &50);

    let result = client.try_trade(
        &trader,
        &Symbol::new(&env, "XLMUSDC"),
        &100,
        &10,
        &true,
        &token_id,
        &100,
        &fee_recipient,
    );

    assert_eq!(result, Err(Ok(FeeError::InsufficientBalance)));
}

#[test]
fn test_pause_sets_flag() {
    let _guard = serial_lock();
    let (env, admin, approver, executor, contract_id) = setup_env();
    let client = UpgradeableTradingContractClient::new(&env, &contract_id);
    let mut approvers = Vec::new(&env);
    approvers.push_back(approver);
    init_contract(&client, &admin, approvers, &executor);

    client.pause(&admin);
    let paused = env.as_contract(&contract_id, || {
        env.storage().persistent().get(&symbol_short!("pause")).unwrap_or(false)
    });
    assert!(paused);

    client.unpause(&admin);
    let paused = env.as_contract(&contract_id, || {
        env.storage().persistent().get(&symbol_short!("pause")).unwrap_or(false)
    });
    assert!(!paused);
}

#[test]
fn test_pause_unpause_authorization() {
    let _guard = serial_lock();
    let (env, admin, approver, executor, contract_id) = setup_env();
    let client = UpgradeableTradingContractClient::new(&env, &contract_id);
    let mut approvers = Vec::new(&env);
    approvers.push_back(approver);
    init_contract(&client, &admin, approvers, &executor);

    let non_admin = Address::generate(&env);
    let result = client.try_pause(&non_admin);
    assert_eq!(result, Err(Ok(TradeError::Unauthorized)));

    client.pause(&admin);
    let result = client.try_unpause(&non_admin);
    assert_eq!(result, Err(Ok(TradeError::Unauthorized)));

    client.unpause(&admin);
}

#[test]
fn test_upgrade_proposal_flow_and_errors() {
    let _guard = serial_lock();
    let (env, admin, approver, executor, contract_id) = setup_env();
    let client = UpgradeableTradingContractClient::new(&env, &contract_id);
    let mut approvers = Vec::new(&env);
    approvers.push_back(approver.clone());
    init_contract(&client, &admin, approvers.clone(), &executor);

    // Invalid threshold -> mapped to Unauthorized
    let invalid = client.try_propose_upgrade(
        &admin,
        &symbol_short!("v2hash"),
        &symbol_short!("Upgrade"),
        &approvers,
        &0,
        &3600,
    );
    assert_eq!(invalid, Err(Ok(TradeError::Unauthorized)));

    // Valid proposal
    let proposal_id = client.propose_upgrade(
        &admin,
        &symbol_short!("v2hash"),
        &symbol_short!("Upgrade"),
        &approvers,
        &1,
        &3600,
    );

    let proposal = client.get_upgrade_proposal(&proposal_id);
    assert_eq!(proposal.status, ProposalStatus::Pending);

    client.approve_upgrade(&proposal_id, &approver);
    let duplicate = client.try_approve_upgrade(&proposal_id, &approver);
    assert_eq!(duplicate, Err(Ok(TradeError::Unauthorized)));
    let proposal = client.get_upgrade_proposal(&proposal_id);
    assert_eq!(proposal.status, ProposalStatus::Approved);

    // Execute too early
    let execute_err = client.try_execute_upgrade(&proposal_id, &executor);
    assert_eq!(execute_err, Err(Ok(TradeError::Unauthorized)));

    set_timestamp(&env, 1000 + 3601);
    client.execute_upgrade(&proposal_id, &executor);

    let proposal = client.get_upgrade_proposal(&proposal_id);
    assert_eq!(proposal.status, ProposalStatus::Executed);

    // Cancelling executed proposal should fail
    let cancel_err = client.try_cancel_upgrade(&proposal_id, &admin);
    assert_eq!(cancel_err, Err(Ok(TradeError::Unauthorized)));
}

#[test]
fn test_reject_and_get_proposal_errors() {
    let _guard = serial_lock();
    let (env, admin, approver, executor, contract_id) = setup_env();
    let client = UpgradeableTradingContractClient::new(&env, &contract_id);
    let mut approvers = Vec::new(&env);
    approvers.push_back(approver.clone());
    init_contract(&client, &admin, approvers.clone(), &executor);

    let proposal_id = client.propose_upgrade(
        &admin,
        &symbol_short!("v2hash"),
        &symbol_short!("Upgrade"),
        &approvers,
        &1,
        &3600,
    );

    client.reject_upgrade(&proposal_id, &approver);
    let proposal = client.get_upgrade_proposal(&proposal_id);
    assert_eq!(proposal.status, ProposalStatus::Rejected);

    let missing = client.try_get_upgrade_proposal(&999);
    assert_eq!(missing, Err(Ok(TradeError::Unauthorized)));
}

#[test]
fn test_oracle_refresh_updates_status() {
    let _guard = serial_lock();
    let (env, admin, approver, executor, contract_id) = setup_env();
    let client = UpgradeableTradingContractClient::new(&env, &contract_id);
    let mut approvers = Vec::new(&env);
    approvers.push_back(approver);
    init_contract(&client, &admin, approvers, &executor);

    let oracle_id = env.register_contract(None, TestOracle);
    let mut oracles = Vec::new(&env);
    oracles.push_back(oracle_id);

    client.set_oracle_config(&admin, &oracles, &100, &1);

    let pair = Symbol::new(&env, "XLMUSDC");
    let aggregate = client.refresh_oracle_price(&pair);

    assert_eq!(aggregate.median_price, 100);
    assert_eq!(aggregate.source_count, 1);

    let status = client.get_oracle_status();
    assert_eq!(status.last_price, 100);
    assert_eq!(status.last_source_count, 1);
    assert_eq!(status.consecutive_failures, 0);
}

#[test]
fn bench_many_trades() {
    let _guard = serial_lock();
    let (env, admin, approver, executor, contract_id) = setup_env();
    let client = UpgradeableTradingContractClient::new(&env, &contract_id);
    let mut approvers = Vec::new(&env);
    approvers.push_back(approver);
    init_contract(&client, &admin, approvers, &executor);

    let (token_id, _token_client, token_admin) = setup_fee_token(&env);
    let trader = Address::generate(&env);
    let fee_recipient = Address::generate(&env);
    token_admin.mint(&trader, &1_000_000);

    for _ in 0..100 {
        let _ = client.trade(
            &trader,
            &Symbol::new(&env, "XLMUSDC"),
            &250,
            &10,
            &true,
            &token_id,
            &100,
            &fee_recipient,
        );
    }
}
