use super::*;
use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, token, Address, Env};

fn setup_env() -> (Env, Address, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    set_timestamp(&env, 1000);

    let contract_id = env.register_contract(None, AcademyVestingContract);
    let admin = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    let governance = Address::generate(&env);

    (env, admin, beneficiary, governance, contract_id)
}

fn setup_token(env: &Env) -> (Address, token::Client<'_>, token::StellarAssetClient<'_>) {
    let issuer = Address::generate(env);
    let token_id = env.register_stellar_asset_contract(issuer);
    let token_client = token::Client::new(env, &token_id);
    let token_admin = token::StellarAssetClient::new(env, &token_id);
    (token_id, token_client, token_admin)
}

#[test]
fn test_init_and_get_info() {
    let (env, admin, _beneficiary, governance, contract_id) = setup_env();
    let (token_id, _token_client, _token_admin) = setup_token(&env);
    let client = AcademyVestingContractClient::new(&env, &contract_id);

    client.init(&admin, &token_id, &governance);

    let (stored_admin, stored_token, stored_gov) = client.get_info();
    assert_eq!(stored_admin, admin);
    assert_eq!(stored_token, token_id);
    assert_eq!(stored_gov, governance);
}

#[test]
fn test_init_twice_fails() {
    let (env, admin, _beneficiary, governance, contract_id) = setup_env();
    let (token_id, _token_client, _token_admin) = setup_token(&env);
    let client = AcademyVestingContractClient::new(&env, &contract_id);

    client.init(&admin, &token_id, &governance);
    let result = client.try_init(&admin, &token_id, &governance);
    assert_eq!(result, Err(Ok(VestingError::Unauthorized)));
}

#[test]
fn test_get_info_before_init_fails() {
    let (env, _admin, _beneficiary, _governance, contract_id) = setup_env();
    let client = AcademyVestingContractClient::new(&env, &contract_id);
    let result = client.try_get_info();
    assert_eq!(result, Err(Ok(VestingError::Unauthorized)));
}

#[test]
fn test_grant_vesting_happy_path() {
    let (env, admin, beneficiary, governance, contract_id) = setup_env();
    let (token_id, _token_client, _token_admin) = setup_token(&env);
    let client = AcademyVestingContractClient::new(&env, &contract_id);

    client.init(&admin, &token_id, &governance);

    let grant_id = client.grant_vesting(&admin, &beneficiary, &1000, &0, &100, &1000);
    assert_eq!(grant_id, 1);

    let schedule = client.get_vesting(&grant_id);
    assert_eq!(schedule.beneficiary, beneficiary);
    assert_eq!(schedule.amount, 1000);
    assert_eq!(schedule.cliff, 100);
    assert_eq!(schedule.duration, 1000);
    assert!(!schedule.claimed);
    assert!(!schedule.revoked);
}

#[test]
fn test_grant_vesting_invalid_schedule() {
    let (env, admin, beneficiary, governance, contract_id) = setup_env();
    let (token_id, _token_client, _token_admin) = setup_token(&env);
    let client = AcademyVestingContractClient::new(&env, &contract_id);

    client.init(&admin, &token_id, &governance);

    let negative = env.as_contract(&contract_id, || {
        AcademyVestingContract::grant_vesting(
            env.clone(),
            admin.clone(),
            beneficiary.clone(),
            -1,
            0,
            10,
            100,
        )
    });
    assert_eq!(negative, Err(VestingError::InvalidSchedule));

    let bad_cliff = env.as_contract(&contract_id, || {
        AcademyVestingContract::grant_vesting(
            env.clone(),
            admin.clone(),
            beneficiary.clone(),
            1000,
            0,
            200,
            100,
        )
    });
    assert_eq!(bad_cliff, Err(VestingError::InvalidSchedule));
}

#[test]
fn test_grant_vesting_non_admin_fails() {
    let (env, admin, beneficiary, governance, contract_id) = setup_env();
    let (token_id, _token_client, _token_admin) = setup_token(&env);
    let client = AcademyVestingContractClient::new(&env, &contract_id);
    let non_admin = Address::generate(&env);

    client.init(&admin, &token_id, &governance);

    let result = client.try_grant_vesting(&non_admin, &beneficiary, &1000, &0, &10, &100);
    assert_eq!(result, Err(Ok(VestingError::Unauthorized)));
}

#[test]
fn test_claim_success_transfers_tokens() {
    let (env, admin, beneficiary, governance, contract_id) = setup_env();
    let (token_id, token_client, token_admin) = setup_token(&env);
    let client = AcademyVestingContractClient::new(&env, &contract_id);

    client.init(&admin, &token_id, &governance);

    let grant_id = env
        .as_contract(&contract_id, || {
            AcademyVestingContract::grant_vesting(
                env.clone(),
                admin.clone(),
                beneficiary.clone(),
                500,
                0,
                0,
                100,
            )
        })
        .unwrap();

    token_admin.mint(&contract_id, &500);
    set_timestamp(&env, 200);

    let claimed = client.claim(&grant_id, &beneficiary);
    assert_eq!(claimed, 500);
    assert_eq!(token_client.balance(&contract_id), 0);
    assert_eq!(token_client.balance(&beneficiary), 500);

    let schedule = client.get_vesting(&grant_id);
    assert!(schedule.claimed);
}

#[test]
fn test_claim_insufficient_balance() {
    let (env, admin, beneficiary, governance, contract_id) = setup_env();
    let (token_id, _token_client, _token_admin) = setup_token(&env);
    let client = AcademyVestingContractClient::new(&env, &contract_id);

    client.init(&admin, &token_id, &governance);
    let grant_id = client.grant_vesting(&admin, &beneficiary, &500, &0, &0, &100);
    set_timestamp(&env, 200);

    let result = env.as_contract(&contract_id, || {
        AcademyVestingContract::claim(env.clone(), grant_id, beneficiary.clone())
    });
    assert_eq!(result, Err(VestingError::InsufficientBalance));
}

#[test]
fn test_claim_wrong_beneficiary_fails() {
    let (env, admin, beneficiary, governance, contract_id) = setup_env();
    let (token_id, _token_client, _token_admin) = setup_token(&env);
    let client = AcademyVestingContractClient::new(&env, &contract_id);
    let other = Address::generate(&env);

    client.init(&admin, &token_id, &governance);
    let grant_id = env
        .as_contract(&contract_id, || {
            AcademyVestingContract::grant_vesting(
                env.clone(),
                admin.clone(),
                beneficiary.clone(),
                500,
                0,
                0,
                100,
            )
        })
        .unwrap();
    set_timestamp(&env, 200);

    let result = client.try_claim(&grant_id, &other);
    assert_eq!(result, Err(Ok(VestingError::Unauthorized)));
}

#[test]
fn test_claim_already_claimed_fails() {
    let (env, admin, beneficiary, governance, contract_id) = setup_env();
    let (token_id, _token_client, token_admin) = setup_token(&env);
    let client = AcademyVestingContractClient::new(&env, &contract_id);

    client.init(&admin, &token_id, &governance);
    let grant_id = client.grant_vesting(&admin, &beneficiary, &500, &0, &0, &100);
    token_admin.mint(&contract_id, &500);
    set_timestamp(&env, 200);

    let _ = env.as_contract(&contract_id, || {
        AcademyVestingContract::claim(env.clone(), grant_id, beneficiary.clone())
    });
    let result = env.as_contract(&contract_id, || {
        AcademyVestingContract::claim(env.clone(), grant_id, beneficiary.clone())
    });
    assert_eq!(result, Err(VestingError::AlreadyClaimed));
}

#[test]
fn test_claim_not_vested_fails() {
    let (env, admin, beneficiary, governance, contract_id) = setup_env();
    let (token_id, _token_client, token_admin) = setup_token(&env);
    let client = AcademyVestingContractClient::new(&env, &contract_id);

    client.init(&admin, &token_id, &governance);
    let grant_id = env
        .as_contract(&contract_id, || {
            AcademyVestingContract::grant_vesting(
                env.clone(),
                admin.clone(),
                beneficiary.clone(),
                500,
                1000,
                500,
                2000,
            )
        })
        .unwrap();
    token_admin.mint(&contract_id, &500);
    set_timestamp(&env, 1200);

    let result = env.as_contract(&contract_id, || {
        AcademyVestingContract::claim(env.clone(), grant_id, beneficiary.clone())
    });
    assert_eq!(result, Err(VestingError::NotVested));
}

#[test]
fn test_revoke_success_and_failure_paths() {
    let (env, admin, beneficiary, governance, contract_id) = setup_env();
    let (token_id, _token_client, _token_admin) = setup_token(&env);
    let client = AcademyVestingContractClient::new(&env, &contract_id);
    let non_admin = Address::generate(&env);

    client.init(&admin, &token_id, &governance);
    let grant_id = env
        .as_contract(&contract_id, || {
            AcademyVestingContract::grant_vesting(
                env.clone(),
                admin.clone(),
                beneficiary.clone(),
                500,
                0,
                0,
                100,
            )
        })
        .unwrap();

    let invalid_timelock = env.as_contract(&contract_id, || {
        AcademyVestingContract::revoke(env.clone(), grant_id, admin.clone(), 100)
    });
    assert_eq!(invalid_timelock, Err(VestingError::InvalidTimelock));

    set_timestamp(&env, 100);
    let too_early = env.as_contract(&contract_id, || {
        AcademyVestingContract::revoke(env.clone(), grant_id, admin.clone(), 3600)
    });
    assert_eq!(too_early, Err(VestingError::NotEnoughTimeForRevoke));

    let unauthorized = env.as_contract(&contract_id, || {
        AcademyVestingContract::revoke(env.clone(), grant_id, non_admin.clone(), 3600)
    });
    assert_eq!(unauthorized, Err(VestingError::Unauthorized));

    set_timestamp(&env, 4000);
    let _ = env.as_contract(&contract_id, || {
        AcademyVestingContract::revoke(env.clone(), grant_id, admin.clone(), 3600)
    });

    let revoked_again = env.as_contract(&contract_id, || {
        AcademyVestingContract::revoke(env.clone(), grant_id, admin.clone(), 3600)
    });
    assert_eq!(revoked_again, Err(VestingError::Revoked));
}

#[test]
fn test_get_vesting_and_vested_amount_errors() {
    let (env, admin, _beneficiary, governance, contract_id) = setup_env();
    let (token_id, _token_client, _token_admin) = setup_token(&env);
    let client = AcademyVestingContractClient::new(&env, &contract_id);

    client.init(&admin, &token_id, &governance);

    let missing_vesting = env.as_contract(&contract_id, || {
        AcademyVestingContract::get_vesting(env.clone(), 999)
    });
    assert!(matches!(missing_vesting, Err(VestingError::GrantNotFound)));

    let missing_amount = env.as_contract(&contract_id, || {
        AcademyVestingContract::get_vested_amount(env.clone(), 999)
    });
    assert!(matches!(missing_amount, Err(VestingError::GrantNotFound)));
}

fn set_timestamp(env: &Env, timestamp: u64) {
    let mut ledger_info = env.ledger().get();
    ledger_info.timestamp = timestamp;
    env.ledger().set(ledger_info);
}
