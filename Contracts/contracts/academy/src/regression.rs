#![cfg(test)]

use crate::vesting::{AcademyVestingContract, AcademyVestingContractClient};
use soroban_sdk::token::{Client as TokenClient, StellarAssetClient};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env,
};

#[test]
fn test_batch_claim_failure_does_not_mark_any_schedule_claimed() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    let governance = Address::generate(&env);
    let reward_token = env.register_stellar_asset_contract(admin.clone());
    let reward_admin = StellarAssetClient::new(&env, &reward_token);
    let reward_client = TokenClient::new(&env, &reward_token);

    let contract_id = env.register_contract(None, AcademyVestingContract);
    let client = AcademyVestingContractClient::new(&env, &contract_id);
    client.init(&admin, &reward_token, &governance);

    let first = client.grant_vesting(&admin, &beneficiary, &500, &0, &0, &10);
    let second = client.grant_vesting(&admin, &beneficiary, &600, &100, &50, &200);

    reward_admin.mint(&contract_id, &2_000);
    env.ledger().with_mut(|li| li.timestamp = 20);

    let result = client.try_batch_claim(&soroban_sdk::vec![&env, first, second], &beneficiary);
    assert!(result.is_err());
    assert_eq!(reward_client.balance(&beneficiary), 0);
    assert!(!client.get_vesting(&first).claimed);
    assert!(!client.get_vesting(&second).claimed);
}
