use soroban_sdk::{testutils::Address as _, Address, Env, token};
use academy_vesting::{AcademyVestingContract, AcademyVestingContractClient, VestingError};

#[derive(Debug, Clone)]
enum FuzzOperation {
    GrantVesting { beneficiary_idx: usize, amount: i128, start_time: u64, cliff: u64, duration: u64 },
    ClaimVesting { grant_id: u64, beneficiary_idx: usize },
    RevokeVesting { grant_id: u64, admin_idx: usize, revoke_delay: u64 },
    GetVesting { grant_id: u64 },
    // Attack vectors
    OverflowAttack { amount: i128 },
    UnderflowAttack { grant_id: u64 },
    UnauthorizedGrant { beneficiary_idx: usize, amount: i128 },
    InvalidSchedule { amount: i128, cliff: u64, duration: u64 },
}

struct FuzzTestState {
    client: AcademyVestingContractClient,
    addresses: Vec<Address>,
    admin: Address,
    token_id: Address,
    grant_counter: u64,
}

impl FuzzTestState {
    fn new(num_addresses: usize) -> Self {
        let env = Env::default();
        let mut ledger_info = env.ledger().get();
        ledger_info.timestamp = 1000;
        env.ledger().set(ledger_info);
        
        let admin = Address::generate(&env);
        let issuer = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract(issuer);
        let token_admin = token::StellarAssetClient::new(&env, &token_id);
        
        let client = AcademyVestingContractClient::new(&env, &env.register_contract(None, AcademyVestingContract {}));
        client.init(&admin, &token_id, &Address::generate(&env)).unwrap();
        
        // Mint tokens to contract for testing
        token_admin.mint(&env.current_contract_address(), &1000000);
        
        let addresses: Vec<Address> = (0..num_addresses).map(|_| Address::generate(&env)).collect();
        
        Self {
            client,
            addresses,
            admin,
            token_id,
            grant_counter: 0,
        }
    }
    
    fn execute_grant_vesting(&mut self, beneficiary_idx: usize, amount: i128, start_time: u64, cliff: u64, duration: u64) -> Result<u64, VestingError> {
        if beneficiary_idx >= self.addresses.len() {
            return Err(VestingError::Unauthorized);
        }
        
        let grant_id = self.client.grant_vesting(
            &self.admin,
            &self.addresses[beneficiary_idx],
            &amount,
            &start_time,
            &cliff,
            &duration,
        )?;
        
        self.grant_counter = grant_id;
        Ok(grant_id)
    }
    
    fn execute_claim_vesting(&mut self, grant_id: u64, beneficiary_idx: usize) -> Result<i128, VestingError> {
        if beneficiary_idx >= self.addresses.len() {
            return Err(VestingError::Unauthorized);
        }
        
        self.client.claim(&grant_id, &self.addresses[beneficiary_idx])
    }
    
    fn execute_revoke_vesting(&mut self, grant_id: u64, admin_idx: usize, revoke_delay: u64) -> Result<(), VestingError> {
        if admin_idx != 0 {
            return Err(VestingError::Unauthorized);
        }
        
        self.client.revoke(&grant_id, &self.admin, &revoke_delay)
    }
}

fn test_fuzzing_properties() {
    let mut state = FuzzTestState::new(5);
    
    // Test valid operations
    let valid_ops = vec![
        FuzzOperation::GrantVesting {
            beneficiary_idx: 0,
            amount: 1000,
            start_time: 0,
            cliff: 100,
            duration: 1000,
        },
        FuzzOperation::GrantVesting {
            beneficiary_idx: 1,
            amount: 2000,
            start_time: 0,
            cliff: 200,
            duration: 2000,
        },
        FuzzOperation::ClaimVesting { grant_id: 1, beneficiary_idx: 0 },
        FuzzOperation::GetVesting { grant_id: 1 },
        FuzzOperation::RevokeVesting { grant_id: 2, admin_idx: 0, revoke_delay: 3600 },
    ];
    
    for op in valid_ops {
        match op {
            FuzzOperation::GrantVesting { beneficiary_idx, amount, start_time, cliff, duration } => {
                let result = state.execute_grant_vesting(beneficiary_idx, amount, start_time, cliff, duration);
                if beneficiary_idx < state.addresses.len() && amount > 0 && cliff <= duration {
                    assert!(result.is_ok());
                } else {
                    assert!(result.is_err());
                }
            }
            FuzzOperation::ClaimVesting { grant_id, beneficiary_idx } => {
                let result = state.execute_claim_vesting(grant_id, beneficiary_idx);
                if beneficiary_idx < state.addresses.len() {
                    // May succeed or fail depending on vesting status
                    match result {
                        Ok(_) => {} // Success
                        Err(e) => {
                            // Expected errors
                            assert!(matches!(e, VestingError::NotVested | VestingError::AlreadyClaimed | VestingError::Revoked | VestingError::GrantNotFound));
                        }
                    }
                } else {
                    assert!(result.is_err());
                }
            }
            FuzzOperation::RevokeVesting { grant_id, admin_idx, revoke_delay } => {
                let result = state.execute_revoke_vesting(grant_id, admin_idx, revoke_delay);
                if admin_idx == 0 && revoke_delay >= 3600 {
                    // May succeed or fail depending on grant state
                    match result {
                        Ok(_) => {} // Success
                        Err(e) => {
                            // Expected errors
                            assert!(matches!(e, VestingError::AlreadyClaimed | VestingError::Revoked | VestingError::NotEnoughTimeForRevoke | VestingError::GrantNotFound));
                        }
                    }
                } else {
                    assert!(result.is_err());
                }
            }
            FuzzOperation::GetVesting { grant_id } => {
                let result = state.client.try_get_vesting(&grant_id);
                // Should not panic
                match result {
                    Ok(_) => {} // Success
                    Err(_) => {} // May fail for non-existent grants
                }
            }
            _ => {}
        }
    }
}

fn test_fuzzing_attack_vectors() {
    let mut state = FuzzTestState::new(3);
    
    // Test overflow scenarios
    let overflow_tests = vec![
        FuzzOperation::OverflowAttack { amount: i128::MAX },
        FuzzOperation::OverflowAttack { amount: i128::MAX / 2 },
    ];
    
    for test in overflow_tests {
        if let FuzzOperation::OverflowAttack { amount } = test {
            let result = state.execute_grant_vesting(0, amount, 0, 100, 1000);
            assert!(result.is_err(), "Should reject overflow amounts: {}", amount);
        }
    }
    
    // Test invalid schedules
    let invalid_schedule_tests = vec![
        FuzzOperation::InvalidSchedule { amount: -1000, cliff: 100, duration: 1000 },
        FuzzOperation::InvalidSchedule { amount: 1000, cliff: 2000, duration: 1000 }, // cliff > duration
        FuzzOperation::InvalidSchedule { amount: 0, cliff: 100, duration: 1000 },
    ];
    
    for test in invalid_schedule_tests {
        if let FuzzOperation::InvalidSchedule { amount, cliff, duration } = test {
            let result = state.execute_grant_vesting(0, amount, 0, cliff, duration);
            assert!(result.is_err(), "Should reject invalid schedule: amount={}, cliff={}, duration={}", amount, cliff, duration);
        }
    }
    
    // Test unauthorized access
    let unauthorized_tests = vec![
        FuzzOperation::UnauthorizedGrant { beneficiary_idx: 999, amount: 1000 },
        FuzzOperation::UnauthorizedGrant { beneficiary_idx: 100, amount: 1000 },
    ];
    
    for test in unauthorized_tests {
        if let FuzzOperation::UnauthorizedGrant { beneficiary_idx, amount } = test {
            let result = state.execute_grant_vesting(beneficiary_idx, amount, 0, 100, 1000);
            assert!(result.is_err(), "Should reject unauthorized beneficiary: {}", beneficiary_idx);
        }
    }
    
    // Test state consistency after errors
    test_state_consistency_after_errors();
}

fn test_state_consistency_after_errors() {
    let mut state = FuzzTestState::new(2);
    
    // Perform some valid operations first
    let _ = state.execute_grant_vesting(0, 1000, 0, 100, 1000);
    let _ = state.execute_grant_vesting(1, 2000, 0, 200, 2000);
    
    // Try some invalid operations
    let _ = state.execute_grant_vesting(0, -1000, 0, 100, 1000); // Invalid amount
    let _ = state.execute_grant_vesting(999, 1000, 0, 100, 1000); // Invalid beneficiary
    let _ = state.execute_claim_vesting(999, 0); // Invalid grant
    
    // State should still be consistent
    let (admin, token, _) = state.client.get_info();
    assert_eq!(admin, state.admin);
    assert_eq!(token, state.token_id);
    
    let valid_grant = state.client.get_vesting(&1);
    assert!(valid_grant.is_ok());
}

#[test]
fn test_basic_fuzzing_vesting() {
    test_fuzzing_properties();
}

#[test]
fn test_fuzzing_attack_vectors_vesting() {
    test_fuzzing_attack_vectors();
}