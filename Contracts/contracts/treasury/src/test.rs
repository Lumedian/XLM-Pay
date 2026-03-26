#![cfg(test)]

use super::*;
use shared::governance::ProposalStatus;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    vec, Env, Vec,
};

use crate::TreasuryContractClient;

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/// Sets up a treasury with:
///   - 1 admin
///   - 2 signers (approvers), threshold = 2 (2-of-2)
///   - daily_limit = 1_000_000
///   - weekly_limit = 5_000_000
///   - proposal_threshold = 500_000  (amounts above this need a proposal)
fn setup_treasury(env: &Env) -> (TreasuryContractClient, Address, Address, Address) {
    let contract_id = env.register_contract(None, TreasuryContract);
    let client = TreasuryContractClient::new(env, &contract_id);

    let admin = Address::generate(env);
    let signer1 = Address::generate(env);
    let signer2 = Address::generate(env);

    let mut signers = Vec::new(env);
    signers.push_back(signer1.clone());
    signers.push_back(signer2.clone());

    env.mock_all_auths();
    client.init(
        &admin,
        &signers,
        &2u32,         // 2-of-2 approval threshold
        &1_000_000i128, // daily limit
        &5_000_000i128, // weekly limit
        &500_000i128,  // proposal threshold
    );

    (client, admin, signer1, signer2)
}

/// Register a Stellar asset contract and return its address + a funded test account.
fn setup_token(env: &Env, amount: i128) -> (Address, Address) {
    let holder = Address::generate(env);
    let token_id = env.register_stellar_asset_contract(holder.clone());
    // Mint `amount` to holder so it can deposit
    use soroban_sdk::token::StellarAssetClient;
    let sac = StellarAssetClient::new(env, &token_id);
    sac.mint(&holder, &amount);
    (token_id, holder)
}

// ---------------------------------------------------------------------------
// Initialisation tests
// ---------------------------------------------------------------------------

#[test]
fn test_initialization() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_000);
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TreasuryContract);
    let client = TreasuryContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let signer = Address::generate(&env);
    let mut signers = Vec::new(&env);
    signers.push_back(signer);

    client.init(&admin, &signers, &1u32, &1_000_000i128, &5_000_000i128, &500_000i128);

    assert_eq!(client.get_version(), 1);
    assert!(!client.is_frozen());
}

#[test]
fn test_double_initialization_fails() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_000);
    env.mock_all_auths();

    let (client, admin, signer1, _) = setup_treasury(&env);

    let mut signers = Vec::new(&env);
    signers.push_back(signer1);

    let result = client.try_init(&admin, &signers, &1u32, &1_000_000i128, &5_000_000i128, &500_000i128);
    assert!(result.is_err());
}

#[test]
fn test_invalid_threshold_fails() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_000);
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TreasuryContract);
    let client = TreasuryContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let signer = Address::generate(&env);
    let mut signers = Vec::new(&env);
    signers.push_back(signer);

    // threshold 3 with only 1 signer — should fail
    let result = client.try_init(&admin, &signers, &3u32, &1_000_000i128, &5_000_000i128, &500_000i128);
    assert!(result.is_err());
}

// ---------------------------------------------------------------------------
// Deposit tests
// ---------------------------------------------------------------------------

#[test]
fn test_deposit() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_000);
    env.mock_all_auths();

    let (client, _, _, _) = setup_treasury(&env);
    let (token_id, holder) = setup_token(&env, 500_000);

    client.deposit(&token_id, &holder, &500_000i128);

    // The treasury should now hold 500_000 tokens
    let bal = client.get_balance(&token_id);
    assert_eq!(bal, 500_000);

    // Audit log should have 1 entry
    let log = client.get_audit_log(&1u64, &10u32);
    assert_eq!(log.len(), 1);
    assert_eq!(log.get(0).unwrap().kind, TxKind::Deposit);
    assert_eq!(log.get(0).unwrap().amount, 500_000);
}

#[test]
fn test_deposit_blocked_when_frozen() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_000);
    env.mock_all_auths();

    let (client, admin, _, _) = setup_treasury(&env);
    let (token_id, holder) = setup_token(&env, 100_000);

    client.freeze(&admin);
    let result = client.try_deposit(&token_id, &holder, &100_000i128);
    assert!(result.is_err());
}

// ---------------------------------------------------------------------------
// Direct withdrawal tests
// ---------------------------------------------------------------------------

#[test]
fn test_direct_withdraw_below_threshold() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 86_400); // day 1
    env.mock_all_auths();

    let (client, admin, _, _) = setup_treasury(&env);
    let (token_id, holder) = setup_token(&env, 1_000_000);
    let recipient = Address::generate(&env);

    client.deposit(&token_id, &holder, &1_000_000i128);
    client.withdraw(&admin, &token_id, &recipient, &100_000i128);

    // Treasury should have 900_000
    assert_eq!(client.get_balance(&token_id), 900_000);

    // Audit log: deposit + withdrawal = 2 entries
    let log = client.get_audit_log(&1u64, &10u32);
    assert_eq!(log.len(), 2);
    assert_eq!(log.get(1).unwrap().kind, TxKind::DirectWithdrawal);
}

#[test]
fn test_direct_withdraw_above_threshold_blocked() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_000);
    env.mock_all_auths();

    let (client, admin, _, _) = setup_treasury(&env);
    let (token_id, holder) = setup_token(&env, 2_000_000);
    let recipient = Address::generate(&env);

    client.deposit(&token_id, &holder, &2_000_000i128);

    // 600_000 > proposal_threshold of 500_000 — must use proposal
    let result = client.try_withdraw(&admin, &token_id, &recipient, &600_000i128);
    assert!(result.is_err());
}

#[test]
fn test_daily_limit_enforcement() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 86_400); // within day bucket 1
    env.mock_all_auths();

    let (client, admin, _, _) = setup_treasury(&env);
    let (token_id, holder) = setup_token(&env, 5_000_000);
    let recipient = Address::generate(&env);

    client.deposit(&token_id, &holder, &5_000_000i128);

    // Two withdrawals of 500_000 = 1_000_000 = daily limit; OK
    client.withdraw(&admin, &token_id, &recipient, &500_000i128);
    client.withdraw(&admin, &token_id, &recipient, &500_000i128);

    // Third withdrawal should exceed daily limit
    let result = client.try_withdraw(&admin, &token_id, &recipient, &1i128);
    assert!(result.is_err());
}

#[test]
fn test_weekly_limit_enforcement() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, admin, _, _) = setup_treasury(&env);
    let (token_id, holder) = setup_token(&env, 20_000_000);
    let recipient = Address::generate(&env);

    client.deposit(&token_id, &holder, &20_000_000i128);

    // Spread 10 x 500_000 across different days but same week
    for day in 0u64..10 {
        env.ledger().with_mut(|li| li.timestamp = day * 86_400 + 3_600);
        client.withdraw(&admin, &token_id, &recipient, &500_000i128);
    }

    // Now 5_000_000 spent this week — another attempt should fail
    let result = client.try_withdraw(&admin, &token_id, &recipient, &1i128);
    assert!(result.is_err());
}

// ---------------------------------------------------------------------------
// Spend proposal tests
// ---------------------------------------------------------------------------

#[test]
fn test_spend_proposal_full_flow() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_000);
    env.mock_all_auths();

    let (client, admin, signer1, signer2) = setup_treasury(&env);
    let (token_id, holder) = setup_token(&env, 2_000_000);
    let recipient = Address::generate(&env);

    client.deposit(&token_id, &holder, &2_000_000i128);

    let approvers = vec![&env, signer1.clone(), signer2.clone()];

    // Propose a large spend (above threshold)
    let proposal_id = client.propose_spend(
        &admin,
        &token_id,
        &recipient,
        &1_500_000i128,
        &symbol_short!("payout"),
        &approvers,
        &2u32,
    );
    assert_eq!(proposal_id, 1);

    let prop = client.get_proposal(&1u64).unwrap();
    assert_eq!(prop.status, ProposalStatus::Pending);
    assert_eq!(prop.approvals_count, 0);

    // First approval — still pending
    client.approve_spend(&proposal_id, &signer1);
    let prop = client.get_proposal(&1u64).unwrap();
    assert_eq!(prop.approvals_count, 1);
    assert_eq!(prop.status, ProposalStatus::Pending);

    // Second approval — now Approved
    client.approve_spend(&proposal_id, &signer2);
    let prop = client.get_proposal(&1u64).unwrap();
    assert_eq!(prop.approvals_count, 2);
    assert_eq!(prop.status, ProposalStatus::Approved);

    // Execute
    client.execute_spend(&proposal_id, &signer1);
    let prop = client.get_proposal(&1u64).unwrap();
    assert_eq!(prop.status, ProposalStatus::Executed);
    assert!(prop.executed);

    // Treasury balance reduced
    assert_eq!(client.get_balance(&token_id), 500_000);

    // Audit log: deposit + proposal execution = 2 entries
    let log = client.get_audit_log(&1u64, &10u32);
    assert_eq!(log.len(), 2);
    assert_eq!(log.get(1).unwrap().kind, TxKind::ProposalExecution);
    assert_eq!(log.get(1).unwrap().amount, 1_500_000);
}

#[test]
fn test_duplicate_approval_rejected() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_000);
    env.mock_all_auths();

    let (client, admin, signer1, signer2) = setup_treasury(&env);
    let (token_id, _) = setup_token(&env, 0);

    let approvers = vec![&env, signer1.clone(), signer2.clone()];
    let proposal_id = client.propose_spend(
        &admin,
        &token_id,
        &Address::generate(&env),
        &1_000_000i128,
        &symbol_short!("payout"),
        &approvers,
        &2u32,
    );

    client.approve_spend(&proposal_id, &signer1);
    let result = client.try_approve_spend(&proposal_id, &signer1);
    assert!(result.is_err());
}

#[test]
fn test_proposal_rejection() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_000);
    env.mock_all_auths();

    let (client, admin, signer1, signer2) = setup_treasury(&env);
    let (token_id, _) = setup_token(&env, 0);

    let approvers = vec![&env, signer1.clone(), signer2.clone()];
    let proposal_id = client.propose_spend(
        &admin,
        &token_id,
        &Address::generate(&env),
        &1_000_000i128,
        &symbol_short!("payout"),
        &approvers,
        &2u32,
    );

    client.reject_spend(&proposal_id, &signer1);
    let prop = client.get_proposal(&proposal_id).unwrap();
    assert_eq!(prop.status, ProposalStatus::Rejected);
}

#[test]
fn test_proposal_cancellation() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_000);
    env.mock_all_auths();

    let (client, admin, signer1, signer2) = setup_treasury(&env);
    let (token_id, _) = setup_token(&env, 0);

    let approvers = vec![&env, signer1.clone(), signer2.clone()];
    let proposal_id = client.propose_spend(
        &admin,
        &token_id,
        &Address::generate(&env),
        &1_000_000i128,
        &symbol_short!("payout"),
        &approvers,
        &2u32,
    );

    client.cancel_spend(&proposal_id, &admin);
    let prop = client.get_proposal(&proposal_id).unwrap();
    assert_eq!(prop.status, ProposalStatus::Cancelled);
}

// ---------------------------------------------------------------------------
// Freeze tests
// ---------------------------------------------------------------------------

#[test]
fn test_freeze_blocks_all_operations() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_000);
    env.mock_all_auths();

    let (client, admin, signer1, signer2) = setup_treasury(&env);
    let (token_id, holder) = setup_token(&env, 1_000_000);
    let recipient = Address::generate(&env);

    client.deposit(&token_id, &holder, &1_000_000i128);
    client.freeze(&admin);
    assert!(client.is_frozen());

    // deposit blocked
    let (token2, holder2) = setup_token(&env, 100_000);
    let result = client.try_deposit(&token2, &holder2, &100_000i128);
    assert!(result.is_err());

    // direct withdrawal blocked
    let result = client.try_withdraw(&admin, &token_id, &recipient, &1_000i128);
    assert!(result.is_err());

    // proposal creation blocked
    let approvers = vec![&env, signer1.clone(), signer2.clone()];
    let result = client.try_propose_spend(
        &admin, &token_id, &recipient, &1_000_000i128,
        &symbol_short!("x"), &approvers, &2u32,
    );
    assert!(result.is_err());
}

#[test]
fn test_unfreeze_restores_operations() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 86_400);
    env.mock_all_auths();

    let (client, admin, _, _) = setup_treasury(&env);
    let (token_id, holder) = setup_token(&env, 1_000_000);
    let recipient = Address::generate(&env);

    client.deposit(&token_id, &holder, &1_000_000i128);
    client.freeze(&admin);
    client.unfreeze(&admin);
    assert!(!client.is_frozen());

    // Withdraw should now succeed
    client.withdraw(&admin, &token_id, &recipient, &100_000i128);
    assert_eq!(client.get_balance(&token_id), 900_000);
}

// ---------------------------------------------------------------------------
// Limit management
// ---------------------------------------------------------------------------

#[test]
fn test_set_limits() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 86_400);
    env.mock_all_auths();

    let (client, admin, _, _) = setup_treasury(&env);
    let (token_id, holder) = setup_token(&env, 5_000_000);
    let recipient = Address::generate(&env);

    client.deposit(&token_id, &holder, &5_000_000i128);

    // Lower the daily limit to 50_000
    client.set_limits(&admin, &50_000i128, &5_000_000i128, &500_000i128);

    let limits = client.get_limits();
    assert_eq!(limits.daily_limit, 50_000);

    // Withdraw 50_000 (exactly at limit) — OK
    client.withdraw(&admin, &token_id, &recipient, &50_000i128);

    // Another 1 token should fail
    let result = client.try_withdraw(&admin, &token_id, &recipient, &1i128);
    assert!(result.is_err());
}
