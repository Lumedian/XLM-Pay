use proptest::prelude::*;
use proptest::strategy::{BoxedStrategy, Strategy};
use soroban_sdk::{testutils::Address as _, Address, Env, token};
use std::collections::HashMap;

use academy_vesting::{AcademyVestingContract, AcademyVestingContractClient, VestingError, VestingSchedule};

#[derive(Debug, Clone)]
enum VestingAction {
    GrantVesting { beneficiary_idx: usize, amount: i128, start_time: u64, cliff: u64, duration: u64 },
    ClaimVesting { grant_id: u64, beneficiary_idx: usize },
    RevokeVesting { grant_id: u64, admin_idx: usize, revoke_delay: u64 },
    GetVesting { grant_id: u64 },
    GetVestedAmount { grant_id: u64 },
}

impl Arbitrary for VestingAction {
    type Parameters = ();
    type Strategy = BoxedStrategy<Self>;

    fn arbitrary_with(_args: Self::Parameters) -> Self::Strategy {
        prop_oneof![
            (0..10usize, 1i128..100000i128, 0u64..1000000u64, 0u64..100000u64, 1000u64..1000000u64)
                .prop_map(|(beneficiary_idx, amount, start_time, cliff, duration)| VestingAction::GrantVesting {
                    beneficiary_idx,
                    amount,
                    start_time,
                    cliff,
                    duration,
                }),
            (1u64..1000u64, 0..10usize)
                .prop_map(|(grant_id, beneficiary_idx)| VestingAction::ClaimVesting { grant_id, beneficiary_idx }),
            (1u64..1000u64, 0..1usize, 3600u64..86400u64)
                .prop_map(|(grant_id, admin_idx, revoke_delay)| VestingAction::RevokeVesting { grant_id, admin_idx, revoke_delay }),
            (1u64..1000u64).prop_map(|grant_id| VestingAction::GetVesting { grant_id }),
            (1u64..1000u64).prop_map(|grant_id| VestingAction::GetVestedAmount { grant_id }),
        ]
        .boxed()
    }
}

#[derive(Debug, Clone)]
struct TestState {
    addresses: Vec<Address>,
    vesting_schedules: HashMap<u64, VestingSchedule>,
    grant_counter: u64,
    admin: Address,
    token_id: Address,
}

impl TestState {
    fn new(addresses: Vec<Address>, admin: Address, token_id: Address) -> Self {
        Self {
            addresses,
            vesting_schedules: HashMap::new(),
            grant_counter: 0,
            admin,
            token_id,
        }
    }
    
    fn apply_action(&mut self, action: &VestingAction, current_time: u64) -> Result<Option<i128>, VestingError> {
        match action {
            VestingAction::GrantVesting { beneficiary_idx, amount, start_time, cliff, duration } => {
                if *beneficiary_idx >= self.addresses.len() {
                    return Err(VestingError::Unauthorized);
                }
                
                if *amount <= 0 {
                    return Err(VestingError::InvalidSchedule);
                }
                
                if *cliff > *duration {
                    return Err(VestingError::InvalidSchedule);
                }
                
                self.grant_counter += 1;
                let grant_id = self.grant_counter;
                
                let schedule = VestingSchedule {
                    beneficiary: self.addresses[*beneficiary_idx].clone(),
                    amount: *amount,
                    start_time: *start_time,
                    cliff: *cliff,
                    duration: *duration,
                    claimed: false,
                    revoked: false,
                    revoke_time: 0,
                };
                
                self.vesting_schedules.insert(grant_id, schedule);
                Ok(None)
            }
            VestingAction::ClaimVesting { grant_id, beneficiary_idx } => {
                let schedule = self.vesting_schedules.get_mut(grant_id)
                    .ok_or(VestingError::GrantNotFound)?;
                
                if *beneficiary_idx >= self.addresses.len() || schedule.beneficiary != self.addresses[*beneficiary_idx] {
                    return Err(VestingError::Unauthorized);
                }
                
                if schedule.claimed {
                    return Err(VestingError::AlreadyClaimed);
                }
                
                if schedule.revoked {
                    return Err(VestingError::Revoked);
                }
                
                let vested_amount = Self::calculate_vested_amount(schedule, current_time)?;
                if vested_amount == 0 {
                    return Err(VestingError::NotVested);
                }
                
                schedule.claimed = true;
                Ok(Some(vested_amount))
            }
            VestingAction::RevokeVesting { grant_id, admin_idx, revoke_delay } => {
                if *admin_idx != 0 { // Only admin (index 0) can revoke
                    return Err(VestingError::Unauthorized);
                }
                
                if *revoke_delay < 3600 {
                    return Err(VestingError::InvalidTimelock);
                }
                
                let schedule = self.vesting_schedules.get_mut(grant_id)
                    .ok_or(VestingError::GrantNotFound)?;
                
                if schedule.claimed {
                    return Err(VestingError::AlreadyClaimed);
                }
                
                if schedule.revoked {
                    return Err(VestingError::Revoked);
                }
                
                if current_time < schedule.start_time + *revoke_delay {
                    return Err(VestingError::NotEnoughTimeForRevoke);
                }
                
                schedule.revoked = true;
                schedule.revoke_time = current_time;
                Ok(None)
            }
            VestingAction::GetVesting { grant_id } => {
                let _schedule = self.vesting_schedules.get(grant_id)
                    .ok_or(VestingError::GrantNotFound)?;
                Ok(None)
            }
            VestingAction::GetVestedAmount { grant_id } => {
                let schedule = self.vesting_schedules.get(grant_id)
                    .ok_or(VestingError::GrantNotFound)?;
                
                let vested_amount = Self::calculate_vested_amount(schedule, current_time)?;
                Ok(Some(vested_amount))
            }
        }
    }
    
    fn calculate_vested_amount(schedule: &VestingSchedule, current_time: u64) -> Result<i128, VestingError> {
        if current_time < schedule.start_time {
            return Ok(0);
        }
        
        if current_time < schedule.start_time + schedule.cliff {
            return Ok(0);
        }
        
        if current_time >= schedule.start_time + schedule.duration {
            return Ok(schedule.amount);
        }
        
        let vested_duration = current_time - (schedule.start_time + schedule.cliff);
        let remaining_duration = schedule.duration - schedule.cliff;
        
        if remaining_duration == 0 {
            return Ok(schedule.amount);
        }
        
        let vested_amount = (schedule.amount as u128 * vested_duration as u128) / remaining_duration as u128;
        Ok(vested_amount as i128)
    }
}

proptest! {
    #[test]
    fn property_based_vesting_invariants(
        actions in prop::collection::vec(any::<VestingAction>(), 10..50),
    ) {
        let env = Env::default();
        let admin = Address::generate(&env);
        let mut ledger_info = env.ledger().get();
        ledger_info.timestamp = 1000;
        env.ledger().set(ledger_info);
        
        let issuer = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract(issuer);
        let token_client = token::Client::new(&env, &token_id);
        let token_admin = token::StellarAssetClient::new(&env, &token_id);
        
        let client = AcademyVestingContractClient::new(&env, &env.register_contract(None, AcademyVestingContract {}));
        client.init(&admin, &token_id, &Address::generate(&env)).unwrap();
        
        let addresses: Vec<Address> = (0..10).map(|_| Address::generate(&env)).collect();
        let mut state = TestState::new(addresses.clone(), admin.clone(), token_id.clone());
        
        // Mint some tokens to the contract for testing
        token_admin.mint(&env.current_contract_address(), &1000000);
        
        for action in actions {
            let current_time = env.ledger().timestamp();
            let result = state.apply_action(&action, current_time);
            
            match action {
                VestingAction::GrantVesting { beneficiary_idx, amount, start_time, cliff, duration } => {
                    if *beneficiary_idx < addresses.len() && *amount > 0 && *cliff <= *duration {
                        let grant_result = client.try_grant_vesting(
                            &admin,
                            &addresses[*beneficiary_idx],
                            amount,
                            start_time,
                            cliff,
                            duration,
                        );
                        
                        prop_assert!(grant_result.is_ok());
                        if let Ok(grant_id) = grant_result {
                            prop_assert!(grant_id > 0);
                        }
                    } else {
                        let grant_result = client.try_grant_vesting(
                            &admin,
                            &addresses.get(*beneficiary_idx).unwrap_or(&admin),
                            amount,
                            start_time,
                            cliff,
                            duration,
                        );
                        prop_assert!(grant_result.is_err());
                    }
                }
                VestingAction::ClaimVesting { grant_id, beneficiary_idx } => {
                    if *beneficiary_idx < addresses.len() {
                        let claim_result = client.try_claim(grant_id, &addresses[*beneficiary_idx]);
                        
                        match result {
                            Ok(Some(amount)) => {
                                prop_assert!(claim_result.is_ok());
                                if let Ok(claimed_amount) = claim_result {
                                    prop_assert_eq!(claimed_amount, amount);
                                }
                            }
                            Err(_) => {
                                prop_assert!(claim_result.is_err());
                            }
                            _ => {}
                        }
                    }
                }
                VestingAction::RevokeVesting { grant_id, admin_idx, revoke_delay } => {
                    if *admin_idx == 0 && *revoke_delay >= 3600 {
                        let revoke_result = client.try_revoke(grant_id, &admin, revoke_delay);
                        match result {
                            Ok(_) => prop_assert!(revoke_result.is_ok()),
                            Err(_) => prop_assert!(revoke_result.is_err()),
                        }
                    }
                }
                VestingAction::GetVesting { grant_id } => {
                    let get_result = client.try_get_vesting(grant_id);
                    match result {
                        Ok(_) => prop_assert!(get_result.is_ok()),
                        Err(_) => prop_assert!(get_result.is_err()),
                    }
                }
                VestingAction::GetVestedAmount { grant_id } => {
                    let get_result = client.try_get_vested_amount(grant_id);
                    match result {
                        Ok(Some(expected_amount)) => {
                            if let Ok(actual_amount) = get_result {
                                prop_assert_eq!(actual_amount, expected_amount);
                            }
                        }
                        Err(_) => {
                            prop_assert!(get_result.is_err());
                        }
                        _ => {}
                    }
                }
            }
        }
        
        // Final state verification
        let (stored_admin, stored_token, _) = client.get_info();
        prop_assert_eq!(stored_admin, admin);
        prop_assert_eq!(stored_token, token_id);
    }
}

#[test]
fn test_vesting_state_machine_invariants() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let mut ledger_info = env.ledger().get();
    ledger_info.timestamp = 1000;
    env.ledger().set(ledger_info);
    
    let issuer = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract(issuer);
    let token_client = token::Client::new(&env, &token_id);
    let token_admin = token::StellarAssetClient::new(&env, &token_id);
    
    let client = AcademyVestingContractClient::new(&env, &env.register_contract(None, AcademyVestingContract {}));
    client.init(&admin, &token_id, &Address::generate(&env)).unwrap();
    
    let beneficiary = Address::generate(&env);
    
    // Mint tokens to contract
    token_admin.mint(&env.current_contract_address(), &10000);
    
    // Test grant vesting
    let grant_id = client.grant_vesting(&admin, &beneficiary, &1000, &0, &100, &1000).unwrap();
    assert_eq!(grant_id, 1);
    
    // Test get vesting info
    let schedule = client.get_vesting(&grant_id).unwrap();
    assert_eq!(schedule.amount, 1000);
    assert_eq!(schedule.beneficiary, beneficiary);
    assert!(!schedule.claimed);
    assert!(!schedule.revoked);
    
    // Test vested amount calculation
    ledger_info.timestamp = 200; // After cliff
    env.ledger().set(ledger_info);
    
    let vested_amount = client.get_vested_amount(&grant_id).unwrap();
    assert!(vested_amount > 0);
    assert!(vested_amount <= 1000);
    
    // Test claim
    let claimed_amount = client.claim(&grant_id, &beneficiary).unwrap();
    assert_eq!(claimed_amount, vested_amount);
    assert_eq!(token_client.balance(&beneficiary), vested_amount);
    
    // Verify schedule is marked as claimed
    let updated_schedule = client.get_vesting(&grant_id).unwrap();
    assert!(updated_schedule.claimed);
    
    // Test revoke (should fail as already claimed)
    ledger_info.timestamp = 5000;
    env.ledger().set(ledger_info);
    
    let revoke_result = client.try_revoke(&grant_id, &admin, &3600);
    assert!(revoke_result.is_err());
}