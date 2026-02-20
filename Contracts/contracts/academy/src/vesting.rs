use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, symbol_short};

#[contracttype]
#[derive(Clone, Debug)]
pub struct VestingSchedule {
    pub beneficiary: Address,
    pub amount: i128,
    pub start_time: u64,
    pub cliff: u64,
    pub duration: u64,
    pub claimed: bool,
    pub revoked: bool,
    pub revoke_time: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct BatchVestingRequest {
    pub beneficiary: Address,
    pub amount: i128,
    pub start_time: u64,
    pub cliff: u64,
    pub duration: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct BatchVestingResult {
    pub grant_id: Option<u64>,
    pub success: bool,
    pub error_code: Option<u32>,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct BatchClaimRequest {
    pub grant_id: u64,
    pub beneficiary: Address,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct BatchClaimResult {
    pub grant_id: u64,
    pub amount_claimed: Option<i128>,
    pub success: bool,
    pub error_code: Option<u32>,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BatchVestingOperation {
    pub successful_grants: soroban_sdk::Vec<u64>,
    pub failed_grants: soroban_sdk::Vec<BatchVestingResult>,
    pub total_amount_granted: i128,
    pub gas_saved: i128,
}

/// Vesting grant event for off-chain indexing
#[contracttype]
#[derive(Clone, Debug)]
pub struct GrantEvent {
    pub grant_id: u64,
    pub beneficiary: Address,
    pub amount: i128,
    pub start_time: u64,
    pub cliff: u64,
    pub duration: u64,
    pub granted_at: u64,
    pub granted_by: Address,
}

/// Claim event for off-chain indexing
#[contracttype]
#[derive(Clone, Debug)]
pub struct ClaimEvent {
    pub grant_id: u64,
    pub beneficiary: Address,
    pub amount: i128,
    pub claimed_at: u64,
}

/// Revoke event for off-chain indexing
#[contracttype]
#[derive(Clone, Debug)]
pub struct RevokeEvent {
    pub grant_id: u64,
    pub beneficiary: Address,
    pub revoked_at: u64,
    pub revoked_by: Address,
}

/// Vesting error codes
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum VestingError {
    Unauthorized = 4001,
    NotVested = 4002,
    AlreadyClaimed = 4003,
    InvalidSchedule = 4004,
    InsufficientBalance = 4005,
    GrantNotFound = 4006,
    Revoked = 4007,
    InvalidTimelock = 4008,
    NotEnoughTimeForRevoke = 4009,
}

impl From<VestingError> for soroban_sdk::Error {
    fn from(error: VestingError) -> Self {
        soroban_sdk::Error::from_contract_error(error as u32)
    }
}

impl From<&VestingError> for soroban_sdk::Error {
    fn from(error: &VestingError) -> Self {
        soroban_sdk::Error::from_contract_error(*error as u32)
    }
}

impl From<soroban_sdk::Error> for VestingError {
    fn from(_error: soroban_sdk::Error) -> Self {
        VestingError::Unauthorized
    }
}

#[contract]
pub struct AcademyVestingContract;

#[contractimpl]
impl AcademyVestingContract {
    /// Initialize the vesting contract with admin and governance roles
    pub fn init(
        env: Env,
        admin: Address,
        reward_token: Address,
        governance: Address,
    ) -> Result<(), VestingError> {
        // Check if already initialized
        let init_key = symbol_short!("init");
        if env.storage().persistent().has(&init_key) {
            return Err(VestingError::Unauthorized);
        }

        // Set initialization flag
        env.storage().persistent().set(&init_key, &true);

        // Store admin
        let admin_key = symbol_short!("admin");
        env.storage().persistent().set(&admin_key, &admin);

        // Store reward token
        let token_key = symbol_short!("token");
        env.storage().persistent().set(&token_key, &reward_token);

        // Store governance address
        let gov_key = symbol_short!("gov");
        env.storage().persistent().set(&gov_key, &governance);

        // Initialize grant counter
        let counter_key = symbol_short!("cnt");
        env.storage().persistent().set(&counter_key, &0u64);

        Ok(())
    }

    /// Grant a vesting schedule to a beneficiary
    pub fn grant_vesting(
        env: Env,
        admin: Address,
        beneficiary: Address,
        amount: i128,
        start_time: u64,
        cliff: u64,
        duration: u64,
    ) -> Result<u64, VestingError> {
        admin.require_auth();

        // Verify caller is admin
        let admin_key = symbol_short!("admin");
        let stored_admin: Address = env
            .storage()
            .persistent()
            .get(&admin_key)
            .ok_or(VestingError::Unauthorized)?;

        if admin != stored_admin {
            return Err(VestingError::Unauthorized);
        }

        // Validate schedule
        if amount <= 0 {
            return Err(VestingError::InvalidSchedule);
        }
        if cliff > duration {
            return Err(VestingError::InvalidSchedule);
        }

        // Get next grant ID
        let counter_key = symbol_short!("cnt");
        let grant_id: u64 = env
            .storage()
            .persistent()
            .get(&counter_key)
            .unwrap_or(0u64);

        let next_id = grant_id + 1;

        // Create vesting schedule
        let schedule = VestingSchedule {
            beneficiary: beneficiary.clone(),
            amount,
            start_time,
            cliff,
            duration,
            claimed: false,
            revoked: false,
            revoke_time: 0,
        };

        // Store schedule
        let schedules_key = symbol_short!("sched");
        let mut schedules: soroban_sdk::Map<u64, VestingSchedule> = env
            .storage()
            .persistent()
            .get(&schedules_key)
            .unwrap_or_else(|| soroban_sdk::Map::new(&env));

        schedules.set(next_id, schedule);
        env.storage().persistent().set(&schedules_key, &schedules);

        // Update counter
        env.storage()
            .persistent()
            .set(&counter_key, &next_id);

        // Emit grant event
        let grant_event = GrantEvent {
            grant_id: next_id,
            beneficiary,
            amount,
            start_time,
            cliff,
            duration,
            granted_at: env.ledger().timestamp(),
            granted_by: admin,
        };

        env.events().publish((symbol_short!("grant"),), grant_event);

        Ok(next_id)
    }

    pub fn batch_grant_vesting(
        env: Env,
        admin: Address,
        requests: soroban_sdk::Vec<BatchVestingRequest>,
    ) -> Result<BatchVestingOperation, VestingError> {
        const MAX_BATCH_SIZE: u32 = 25;

        if requests.len() > MAX_BATCH_SIZE {
            return Err(VestingError::InvalidSchedule);
        }

        let mut successful_grants = soroban_sdk::Vec::new(&env);
        let mut failed_grants = soroban_sdk::Vec::new(&env);
        let mut total_amount_granted = 0i128;
        let mut total_gas_saved = 0i128;

        for request in requests.iter() {
            let result = match Self::grant_vesting(
                env.clone(),
                admin.clone(),
                request.beneficiary.clone(),
                request.amount,
                request.start_time,
                request.cliff,
                request.duration,
            ) {
                Ok(grant_id) => {
                    successful_grants.push_back(grant_id);
                    total_amount_granted += request.amount;
                    total_gas_saved += 500i128;
                    BatchVestingResult {
                        grant_id: Some(grant_id),
                        success: true,
                        error_code: None,
                    }
                }
                Err(error) => BatchVestingResult {
                    grant_id: None,
                    success: false,
                    error_code: Some(error as u32),
                },
            };

            failed_grants.push_back(result);
        }

        Ok(BatchVestingOperation {
            successful_grants,
            failed_grants,
            total_amount_granted,
            gas_saved: total_gas_saved,
        })
    }

    /// Claim vested tokens (atomic operation, single-claim semantics)
    pub fn claim(env: Env, grant_id: u64, beneficiary: Address) -> Result<i128, VestingError> {
        beneficiary.require_auth();

        // Get vesting schedule
        let schedules_key = symbol_short!("sched");
        let mut schedules: soroban_sdk::Map<u64, VestingSchedule> = env
            .storage()
            .persistent()
            .get(&schedules_key)
            .ok_or(VestingError::GrantNotFound)?;

        let mut schedule = schedules
            .get(grant_id)
            .ok_or(VestingError::GrantNotFound)?;

        // Verify beneficiary matches
        if schedule.beneficiary != beneficiary {
            return Err(VestingError::Unauthorized);
        }

        // Check if already claimed
        if schedule.claimed {
            return Err(VestingError::AlreadyClaimed);
        }

        // Check if revoked
        if schedule.revoked {
            return Err(VestingError::Revoked);
        }

        // Calculate vested amount
        let current_time = env.ledger().timestamp();
        let vested_amount = Self::calculate_vested_amount(
            &schedule,
            current_time,
        )?;

        if vested_amount == 0 {
            return Err(VestingError::NotVested);
        }

        // Verify contract has sufficient balance
        let token_key = symbol_short!("token");
        let token: Address = env
            .storage()
            .persistent()
            .get(&token_key)
            .ok_or(VestingError::Unauthorized)?;

        let token_client = soroban_sdk::token::Client::new(&env, &token);
        let balance = token_client.balance(&env.current_contract_address());

        if balance < vested_amount {
            return Err(VestingError::InsufficientBalance);
        }

        // Mark as claimed (atomic operation)
        schedule.claimed = true;
        schedules.set(grant_id, schedule.clone());
        env.storage().persistent().set(&schedules_key, &schedules);

        // Transfer tokens
        token_client.transfer(
            &env.current_contract_address(),
            &beneficiary,
            &vested_amount,
        );

        // Emit claim event
        let claim_event = ClaimEvent {
            grant_id,
            beneficiary,
            amount: vested_amount,
            claimed_at: env.ledger().timestamp(),
        };

        env.events().publish((symbol_short!("claim"),), claim_event);

        Ok(vested_amount)
    }

    pub fn batch_claim(
        env: Env,
        requests: soroban_sdk::Vec<BatchClaimRequest>,
    ) -> Result<soroban_sdk::Vec<BatchClaimResult>, VestingError> {
        const MAX_BATCH_SIZE: u32 = 20;

        if requests.len() > MAX_BATCH_SIZE {
            return Err(VestingError::InvalidSchedule);
        }

        let mut results = soroban_sdk::Vec::new(&env);

        for request in requests.iter() {
            let result = match Self::claim(
                env.clone(),
                request.grant_id,
                request.beneficiary.clone(),
            ) {
                Ok(amount) => BatchClaimResult {
                    grant_id: request.grant_id,
                    amount_claimed: Some(amount),
                    success: true,
                    error_code: None,
                },
                Err(error) => BatchClaimResult {
                    grant_id: request.grant_id,
                    amount_claimed: None,
                    success: false,
                    error_code: Some(error as u32),
                },
            };

            results.push_back(result);
        }

        Ok(results)
    }

    /// Revoke a vesting schedule (governance/admin only, with timelock)
    pub fn revoke(
        env: Env,
        grant_id: u64,
        admin: Address,
        revoke_delay: u64,
    ) -> Result<(), VestingError> {
        admin.require_auth();

        // Verify caller is admin
        let admin_key = symbol_short!("admin");
        let stored_admin: Address = env
            .storage()
            .persistent()
            .get(&admin_key)
            .ok_or(VestingError::Unauthorized)?;

        if admin != stored_admin {
            return Err(VestingError::Unauthorized);
        }

        // Get vesting schedule
        let schedules_key = symbol_short!("sched");
        let mut schedules: soroban_sdk::Map<u64, VestingSchedule> = env
            .storage()
            .persistent()
            .get(&schedules_key)
            .ok_or(VestingError::GrantNotFound)?;

        let mut schedule = schedules
            .get(grant_id)
            .ok_or(VestingError::GrantNotFound)?;

        // Cannot revoke already claimed
        if schedule.claimed {
            return Err(VestingError::AlreadyClaimed);
        }

        // Cannot revoke already revoked
        if schedule.revoked {
            return Err(VestingError::Revoked);
        }

        // Enforce timelock for revocation (minimum 1 hour)
        if revoke_delay < 3600 {
            return Err(VestingError::InvalidTimelock);
        }

        // Check if enough time has passed since grant to allow revocation
        let current_time = env.ledger().timestamp();
        if current_time < schedule.start_time + revoke_delay {
            return Err(VestingError::NotEnoughTimeForRevoke);
        }

        // Mark as revoked
        schedule.revoked = true;
        schedule.revoke_time = current_time;
        schedules.set(grant_id, schedule.clone());
        env.storage().persistent().set(&schedules_key, &schedules);

        // Emit revoke event
        let revoke_event = RevokeEvent {
            grant_id,
            beneficiary: schedule.beneficiary,
            revoked_at: current_time,
            revoked_by: admin,
        };

        env.events().publish((symbol_short!("revoke"),), revoke_event);

        Ok(())
    }

    /// Query vesting schedule details
    pub fn get_vesting(env: Env, grant_id: u64) -> Result<VestingSchedule, VestingError> {
        let schedules_key = symbol_short!("sched");
        let schedules: soroban_sdk::Map<u64, VestingSchedule> = env
            .storage()
            .persistent()
            .get(&schedules_key)
            .ok_or(VestingError::GrantNotFound)?;

        schedules
            .get(grant_id)
            .ok_or(VestingError::GrantNotFound)
    }

    /// Calculate vested amount at current time
    pub fn get_vested_amount(env: Env, grant_id: u64) -> Result<i128, VestingError> {
        let schedules_key = symbol_short!("sched");
        let schedules: soroban_sdk::Map<u64, VestingSchedule> = env
            .storage()
            .persistent()
            .get(&schedules_key)
            .ok_or(VestingError::GrantNotFound)?;

        let schedule = schedules
            .get(grant_id)
            .ok_or(VestingError::GrantNotFound)?;

        let current_time = env.ledger().timestamp();
        Self::calculate_vested_amount(&schedule, current_time)
    }

    /// Internal helper: calculate vested amount based on schedule and current time
    fn calculate_vested_amount(
        schedule: &VestingSchedule,
        current_time: u64,
    ) -> Result<i128, VestingError> {
        // If not started yet
        if current_time < schedule.start_time {
            return Ok(0);
        }

        // If cliff hasn't passed
        if current_time < schedule.start_time + schedule.cliff {
            return Ok(0);
        }

        // If fully vested
        if current_time >= schedule.start_time + schedule.duration {
            return Ok(schedule.amount);
        }

        // Partial vesting (linear vesting after cliff)
        let vested_duration = current_time - (schedule.start_time + schedule.cliff);
        let remaining_duration = schedule.duration - schedule.cliff;

        if remaining_duration == 0 {
            return Ok(schedule.amount);
        }

        // Use fixed-point arithmetic to avoid floating point
        let vested_amount = (schedule.amount as u128 * vested_duration as u128)
            / remaining_duration as u128;

        Ok(vested_amount as i128)
    }

    /// Get contract information
    pub fn get_info(env: Env) -> Result<(Address, Address, Address), VestingError> {
        let admin_key = symbol_short!("admin");
        let token_key = symbol_short!("token");
        let gov_key = symbol_short!("gov");

        let admin = env
            .storage()
            .persistent()
            .get(&admin_key)
            .ok_or(VestingError::Unauthorized)?;

        let token = env
            .storage()
            .persistent()
            .get(&token_key)
            .ok_or(VestingError::Unauthorized)?;

        let governance = env
            .storage()
            .persistent()
            .get(&gov_key)
            .ok_or(VestingError::Unauthorized)?;

        Ok((admin, token, governance))
    }
}

#[cfg(test)]
mod tests;
