#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env,
};
use stellara_shared::governance::GovernanceManager;

mod storage_keys {
    use soroban_sdk::{symbol_short, Symbol};

    pub const ADMIN: Symbol = symbol_short!("admin");
    pub const STAKE_TOKEN: Symbol = symbol_short!("s_token");
    pub const REWARD_TOKEN: Symbol = symbol_short!("r_token");
    pub const POOL_CONFIG: Symbol = symbol_short!("p_cfg");
    pub const USER_STAKE: Symbol = symbol_short!("u_stake");
    pub const SLASHING_PROPOSALS: Symbol = symbol_short!("slash_prop");
    pub const SLASHING_COUNTER: Symbol = symbol_short!("slash_cnt");
    pub const TREASURY: Symbol = symbol_short!("treasury");
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ContractError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    InvalidAmount = 4,
    InvalidPool = 5,
    InsufficientBalance = 6,
    StillLocked = 7,
    NothingToClaim = 8,
    InvalidOffense = 9,
    ProposalNotFound = 10,
    ProposalNotPending = 11,
    InsufficientEvidence = 12,
    AlreadySlashed = 13,
    AppealWindowExpired = 14,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PoolConfig {
    pub lockup_seconds: u64,
    pub apy_bps: u32, // APY in basis points (100 = 1%)
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UserStake {
    pub amount: i128,
    pub pool_id: u32,
    pub start_timestamp: u64,
    pub last_claim_timestamp: u64,
    pub slashed_amount: i128, // Track total slashed amount
}

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum SlashableOffense {
    DoubleSpending = 1,
    FraudulentActivity = 2,
    GovernanceViolation = 3,
    ContractExploitation = 4,
    IdentityTheft = 5,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SlashingProposal {
    pub id: u64,
    pub offender: Address,
    pub reporter: Address,
    pub offense: SlashableOffense,
    pub evidence_hash: Symbol, // Hash of evidence document
    pub slash_percentage: u32, // Basis points (100 = 1%)
    pub victim_address: Option<Address>, // For victim compensation
    pub status: SlashingStatus,
    pub created_at: u64,
    pub appeal_deadline: u64,
    pub executed_at: Option<u64>,
}

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum SlashingStatus {
    Pending = 0,
    Approved = 1,
    Rejected = 2,
    Executed = 3,
    Appealed = 4,
}

#[contract]
pub struct StakingRewardsContract;

#[contractimpl]
impl StakingRewardsContract {
    /// Initialize the contract with admin and token details
    pub fn initialize(
        env: Env,
        admin: Address,
        staking_token: Address,
        reward_token: Address,
    ) -> Result<(), ContractError> {
        if env.storage().instance().has(&storage_keys::ADMIN) {
            return Err(ContractError::AlreadyInitialized);
        }

        env.storage().instance().set(&storage_keys::ADMIN, &admin);
        env.storage()
            .instance()
            .set(&storage_keys::STAKE_TOKEN, &staking_token);
        env.storage()
            .instance()
            .set(&storage_keys::REWARD_TOKEN, &reward_token);

        // Define default pools: 30, 60, 90 days
        let pools = soroban_sdk::vec![
            &env,
            PoolConfig {
                lockup_seconds: 30 * 24 * 60 * 60,
                apy_bps: 500, // 5%
            },
            PoolConfig {
                lockup_seconds: 60 * 24 * 60 * 60,
                apy_bps: 1000, // 10%
            },
            PoolConfig {
                lockup_seconds: 90 * 24 * 60 * 60,
                apy_bps: 1500, // 15%
            },
        ];
        env.storage()
            .instance()
            .set(&storage_keys::POOL_CONFIG, &pools);

        Ok(())
    }

    /// Stake tokens in a specific pool
    pub fn stake(env: Env, user: Address, amount: i128, pool_id: u32) -> Result<(), ContractError> {
        user.require_auth();

        if amount <= 0 {
            return Err(ContractError::InvalidAmount);
        }

        let pools: soroban_sdk::Vec<PoolConfig> = env
            .storage()
            .instance()
            .get(&storage_keys::POOL_CONFIG)
            .ok_or(ContractError::NotInitialized)?;

        if pool_id >= pools.len() {
            return Err(ContractError::InvalidPool);
        }

        let staking_token: Address = env
            .storage()
            .instance()
            .get(&storage_keys::STAKE_TOKEN)
            .unwrap();

        // Transfer tokens to contract
        let client = soroban_sdk::token::Client::new(&env, &staking_token);
        client.transfer(&user, &env.current_contract_address(), &amount);

        let key = (storage_keys::USER_STAKE, user.clone());
        let mut user_stake = env
            .storage()
            .persistent()
            .get::<_, UserStake>(&key)
            .unwrap_or(UserStake {
                amount: 0,
                pool_id,
                start_timestamp: env.ledger().timestamp(),
                last_claim_timestamp: env.ledger().timestamp(),
                slashed_amount: 0,
            });

        // For simplicity, if they already have a stake, they must unstake first or we just update
        // In this implementation, we allow adding to stake but reset the timer for the whole amount
        user_stake.amount += amount;
        user_stake.pool_id = pool_id;
        user_stake.start_timestamp = env.ledger().timestamp();
        user_stake.last_claim_timestamp = env.ledger().timestamp();

        env.storage().persistent().set(&key, &user_stake);

        env.events().publish(
            (symbol_short!("stake"), user),
            (amount, pool_id, env.ledger().timestamp()),
        );

        Ok(())
    }

    /// Claim rewards for the user
    pub fn claim(env: Env, user: Address) -> Result<i128, ContractError> {
        user.require_auth();

        let key = (storage_keys::USER_STAKE, user.clone());
        let mut user_stake: UserStake = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(ContractError::NothingToClaim)?;

        let reward_amount = calculate_rewards(&env, &user_stake)?;
        if reward_amount <= 0 {
            return Err(ContractError::NothingToClaim);
        }

        let reward_token: Address = env
            .storage()
            .instance()
            .get(&storage_keys::REWARD_TOKEN)
            .unwrap();

        let client = soroban_sdk::token::Client::new(&env, &reward_token);
        client.transfer(&env.current_contract_address(), &user, &reward_amount);

        user_stake.last_claim_timestamp = env.ledger().timestamp();
        env.storage().persistent().set(&key, &user_stake);

        env.events().publish(
            (symbol_short!("claim"), user),
            (reward_amount, env.ledger().timestamp()),
        );

        Ok(reward_amount)
    }

    /// Unstake principal and any pending rewards
    pub fn unstake(env: Env, user: Address) -> Result<i128, ContractError> {
        user.require_auth();

        let key = (storage_keys::USER_STAKE, user.clone());
        let user_stake: UserStake = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(ContractError::NothingToClaim)?;

        let pools: soroban_sdk::Vec<PoolConfig> = env
            .storage()
            .instance()
            .get(&storage_keys::POOL_CONFIG)
            .unwrap();

        let pool = pools.get_unchecked(user_stake.pool_id);
        let now = env.ledger().timestamp();
        let elapsed = now - user_stake.start_timestamp;

        let effective_stake = user_stake.amount - user_stake.slashed_amount;
        let mut principal_to_return = effective_stake;

        // Apply early withdrawal penalty if lockup hasn't expired
        if elapsed < pool.lockup_seconds {
            let penalty_bps = 1000; // 10% penalty
            let penalty_amount = (principal_to_return * penalty_bps as i128) / 10000;
            principal_to_return -= penalty_amount;

            // Penalty stays in the contract (could be sent to a treasury)
        }

        let staking_token: Address = env
            .storage()
            .instance()
            .get(&storage_keys::STAKE_TOKEN)
            .unwrap();

        let client = soroban_sdk::token::Client::new(&env, &staking_token);
        client.transfer(&env.current_contract_address(), &user, &principal_to_return);

        // Remove stake
        env.storage().persistent().remove(&key);

        env.events().publish(
            (symbol_short!("unstake"), user),
            (principal_to_return, env.ledger().timestamp()),
        );

        Ok(principal_to_return)
    }

    /// Re-stake pending rewards (Auto-compounding)
    pub fn compound(env: Env, user: Address) -> Result<(), ContractError> {
        user.require_auth();

        let key = (storage_keys::USER_STAKE, user.clone());
        let mut user_stake: UserStake = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(ContractError::NothingToClaim)?;

        let reward_amount = calculate_rewards(&env, &user_stake)?;
        if reward_amount <= 0 {
            return Err(ContractError::NothingToClaim);
        }

        // Logic check: reward token must be the same as staking token for auto-compound
        let staking_token: Address = env
            .storage()
            .instance()
            .get(&storage_keys::STAKE_TOKEN)
            .unwrap();
        let reward_token: Address = env
            .storage()
            .instance()
            .get(&storage_keys::REWARD_TOKEN)
            .unwrap();

        if staking_token != reward_token {
            return Err(ContractError::Unauthorized); // Or a more specific error
        }

        user_stake.amount += reward_amount;
        user_stake.last_claim_timestamp = env.ledger().timestamp();
        env.storage().persistent().set(&key, &user_stake);

        env.events().publish(
            (symbol_short!("compound"), user),
            (reward_amount, env.ledger().timestamp()),
        );

        Ok(())
    }

    /// Get user's current stake info
    pub fn get_stake(env: Env, user: Address) -> Option<UserStake> {
        let key = (storage_keys::USER_STAKE, user);
        env.storage().persistent().get(&key)
    }

    /// Get pending rewards for a user
    pub fn get_pending_rewards(env: Env, user: Address) -> i128 {
        let key = (storage_keys::USER_STAKE, user);
        if let Some(user_stake) = env.storage().persistent().get::<_, UserStake>(&key) {
            return calculate_rewards(&env, &user_stake).unwrap_or(0);
        }
        0
    }

    /// Report misconduct for slashing (anyone can report)
    pub fn report_misconduct(
        env: Env,
        offender: Address,
        offense: SlashableOffense,
        evidence_hash: Symbol,
        slash_percentage: u32,
        victim_address: Option<Address>,
    ) -> Result<u64, ContractError> {
        if slash_percentage == 0 || slash_percentage > 10000 {
            return Err(ContractError::InvalidAmount); // Max 100%
        }

        // Get next proposal ID
        let counter_key = storage_keys::SLASHING_COUNTER;
        let proposal_id: u64 = env
            .storage()
            .persistent()
            .get(&counter_key)
            .unwrap_or(0u64);

        let next_id = proposal_id + 1;

        let proposal = SlashingProposal {
            id: next_id,
            offender,
            reporter: env.invoker(), // The caller is the reporter
            offense,
            evidence_hash,
            slash_percentage,
            victim_address,
            status: SlashingStatus::Pending,
            created_at: env.ledger().timestamp(),
            appeal_deadline: env.ledger().timestamp() + (7 * 24 * 60 * 60), // 7 days appeal window
            executed_at: None,
        };

        // Store proposal
        let proposals_key = storage_keys::SLASHING_PROPOSALS;
        let mut proposals: soroban_sdk::Map<u64, SlashingProposal> = env
            .storage()
            .persistent()
            .get(&proposals_key)
            .unwrap_or_else(|| soroban_sdk::Map::new(&env));

        proposals.set(next_id, proposal);
        env.storage().persistent().set(&proposals_key, &proposals);

        // Update counter
        env.storage().persistent().set(&counter_key, &next_id);

        env.events().publish(
            (symbol_short!("report"), env.invoker()),
            (next_id, offender, offense as u32),
        );

        Ok(next_id)
    }

    /// Execute slashing (admin only, after review)
    pub fn execute_slashing(env: Env, proposal_id: u64) -> Result<(), ContractError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&storage_keys::ADMIN)
            .ok_or(ContractError::NotInitialized)?;

        admin.require_auth();

        let proposals_key = storage_keys::SLASHING_PROPOSALS;
        let mut proposals: soroban_sdk::Map<u64, SlashingProposal> = env
            .storage()
            .persistent()
            .get(&proposals_key)
            .ok_or(ContractError::ProposalNotFound)?;

        let mut proposal = proposals
            .get(proposal_id)
            .ok_or(ContractError::ProposalNotFound)?;

        if proposal.status != SlashingStatus::Pending && proposal.status != SlashingStatus::Approved {
            return Err(ContractError::ProposalNotPending);
        }

        // Check if appeal window has expired (only for pending proposals)
        if proposal.status == SlashingStatus::Pending && env.ledger().timestamp() < proposal.appeal_deadline {
            return Err(ContractError::AppealWindowExpired);
        }

        // Get user's stake
        let stake_key = (storage_keys::USER_STAKE, proposal.offender.clone());
        let mut user_stake: UserStake = env
            .storage()
            .persistent()
            .get(&stake_key)
            .ok_or(ContractError::NothingToClaim)?;

        let effective_stake = user_stake.amount - user_stake.slashed_amount;
        let slash_amount = (effective_stake * proposal.slash_percentage as i128) / 10000;

        if slash_amount <= 0 {
            return Err(ContractError::InvalidAmount);
        }

        // Update slashed amount
        user_stake.slashed_amount += slash_amount;
        env.storage().persistent().set(&stake_key, &user_stake);

        // Distribute slashed tokens
        let staking_token: Address = env
            .storage()
            .instance()
            .get(&storage_keys::STAKE_TOKEN)
            .unwrap();

        let client = soroban_sdk::token::Client::new(&env, &staking_token);

        // Send to victim if specified, otherwise to treasury
        let recipient = if let Some(victim) = &proposal.victim_address {
            victim.clone()
        } else {
            // Get treasury address, fallback to admin
            env.storage()
                .instance()
                .get(&storage_keys::TREASURY)
                .unwrap_or(admin)
        };

        client.transfer(&env.current_contract_address(), &recipient, &slash_amount);

        // Update proposal status
        proposal.status = SlashingStatus::Executed;
        proposal.executed_at = Some(env.ledger().timestamp());
        proposals.set(proposal_id, proposal);
        env.storage().persistent().set(&proposals_key, &proposals);

        env.events().publish(
            (symbol_short!("slash"), proposal.offender),
            (slash_amount, recipient, proposal.slash_percentage),
        );

        Ok(())
    }

    /// Appeal a slashing proposal (offender only) - creates governance proposal
    pub fn appeal_slashing(env: Env, proposal_id: u64, appeal_evidence_hash: Symbol) -> Result<u64, ContractError> {
        let proposals_key = storage_keys::SLASHING_PROPOSALS;
        let mut proposals: soroban_sdk::Map<u64, SlashingProposal> = env
            .storage()
            .persistent()
            .get(&proposals_key)
            .ok_or(ContractError::ProposalNotFound)?;

        let mut proposal = proposals
            .get(proposal_id)
            .ok_or(ContractError::ProposalNotFound)?;

        if proposal.status != SlashingStatus::Pending {
            return Err(ContractError::ProposalNotPending);
        }

        // Only the offender can appeal
        if env.invoker() != proposal.offender {
            return Err(ContractError::Unauthorized);
        }

        // Check if still within appeal window
        if env.ledger().timestamp() >= proposal.appeal_deadline {
            return Err(ContractError::AppealWindowExpired);
        }

        proposal.status = SlashingStatus::Appealed;
        proposal.evidence_hash = appeal_evidence_hash;

        proposals.set(proposal_id, proposal);
        env.storage().persistent().set(&proposals_key, &proposals);

        // Create governance proposal for appeal resolution
        let governance_proposal_id = GovernanceManager::propose_upgrade(
            &env,
            env.invoker(), // offender as proposer
            soroban_sdk::symbol_short!("appeal"), // description
            env.current_contract_address(), // target contract
            soroban_sdk::symbol_short!("slash_appeal"), // description
            2, // approval threshold (2 of 3)
            soroban_sdk::vec![&env, 
                env.storage().instance().get(&storage_keys::ADMIN).unwrap(), // admin
                proposal.reporter.clone(), // reporter
                proposal.offender.clone(), // offender
            ],
            24 * 60 * 60, // 24 hour timelock
        ).map_err(|_| ContractError::Unauthorized)?;

        env.events().publish(
            (symbol_short!("appeal"), env.invoker()),
            (proposal_id, appeal_evidence_hash, governance_proposal_id),
        );

        Ok(governance_proposal_id)
    }

    /// Reject slashing proposal (admin only)
    pub fn reject_slashing(env: Env, proposal_id: u64) -> Result<(), ContractError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&storage_keys::ADMIN)
            .ok_or(ContractError::NotInitialized)?;

        admin.require_auth();

        let proposals_key = storage_keys::SLASHING_PROPOSALS;
        let mut proposals: soroban_sdk::Map<u64, SlashingProposal> = env
            .storage()
            .persistent()
            .get(&proposals_key)
            .ok_or(ContractError::ProposalNotFound)?;

        let mut proposal = proposals
            .get(proposal_id)
            .ok_or(ContractError::ProposalNotFound)?;

        if proposal.status != SlashingStatus::Pending && proposal.status != SlashingStatus::Appealed {
            return Err(ContractError::ProposalNotPending);
        }

        proposal.status = SlashingStatus::Rejected;
        proposals.set(proposal_id, proposal);
        env.storage().persistent().set(&proposals_key, &proposals);

        env.events().publish(
            (symbol_short!("reject"), admin),
            proposal_id,
        );

        Ok(())
    }

    /// Set treasury address (admin only)
    pub fn set_treasury(env: Env, treasury: Address) -> Result<(), ContractError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&storage_keys::ADMIN)
            .ok_or(ContractError::NotInitialized)?;

        admin.require_auth();

        env.storage().instance().set(&storage_keys::TREASURY, &treasury);

        Ok(())
    }

    /// Get slashing proposal by ID
    pub fn get_slashing_proposal(env: Env, proposal_id: u64) -> Option<SlashingProposal> {
        let proposals_key = storage_keys::SLASHING_PROPOSALS;
        if let Some(proposals) = env.storage().persistent().get::<_, soroban_sdk::Map<u64, SlashingProposal>>(&proposals_key) {
            proposals.get(proposal_id)
        } else {
            None
        }
    }

    /// Batch execute slashing for proposals that have passed appeal window (admin only)
    pub fn batch_execute_slashing(env: Env) -> Result<u32, ContractError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&storage_keys::ADMIN)
            .ok_or(ContractError::NotInitialized)?;

        admin.require_auth();

        let proposals_key = storage_keys::SLASHING_PROPOSALS;
        let mut proposals: soroban_sdk::Map<u64, SlashingProposal> = env
            .storage()
            .persistent()
            .get(&proposals_key)
            .ok_or(ContractError::NotInitialized)?;

        let mut executed_count = 0u32;
        let current_time = env.ledger().timestamp();

        // Iterate through all proposals (in a real implementation, this would be paginated)
        let proposal_ids: soroban_sdk::Vec<u64> = proposals.keys();
        
        for proposal_id in proposal_ids {
            if let Some(mut proposal) = proposals.get(proposal_id.clone()) {
                if proposal.status == SlashingStatus::Pending && current_time >= proposal.appeal_deadline {
                    // Execute slashing automatically
                    if let Ok(()) = Self::execute_slashing_internal(&env, &mut proposal) {
                        proposal.status = SlashingStatus::Executed;
                        proposal.executed_at = Some(current_time);
                        proposals.set(proposal_id, proposal);
                        executed_count += 1;
                    }
                }
            }
        }

        env.storage().persistent().set(&proposals_key, &proposals);

        env.events().publish(
            (symbol_short!("batch_exec"), admin),
            executed_count,
        );

        Ok(executed_count)
    }

    /// Internal function to execute slashing logic
    fn execute_slashing_internal(env: &Env, proposal: &mut SlashingProposal) -> Result<(), ContractError> {
        // Get user's stake
        let stake_key = (storage_keys::USER_STAKE, proposal.offender.clone());
        let mut user_stake: UserStake = env
            .storage()
            .persistent()
            .get(&stake_key)
            .ok_or(ContractError::NothingToClaim)?;

        let effective_stake = user_stake.amount - user_stake.slashed_amount;
        let slash_amount = (effective_stake * proposal.slash_percentage as i128) / 10000;

        if slash_amount <= 0 {
            return Err(ContractError::InvalidAmount);
        }

        // Update slashed amount
        user_stake.slashed_amount += slash_amount;
        env.storage().persistent().set(&stake_key, &user_stake);

        // Distribute slashed tokens
        let staking_token: Address = env
            .storage()
            .instance()
            .get(&storage_keys::STAKE_TOKEN)
            .unwrap();

        let client = soroban_sdk::token::Client::new(&env, &staking_token);

        // Send to victim if specified, otherwise to treasury
        let recipient = if let Some(victim) = &proposal.victim_address {
            victim.clone()
        } else {
            // Get treasury address, fallback to admin
            env.storage()
                .instance()
                .get(&storage_keys::TREASURY)
                .unwrap_or_else(|| env.storage().instance().get(&storage_keys::ADMIN).unwrap())
        };

        client.transfer(&env.current_contract_address(), &recipient, &slash_amount);

        Ok(())
    }

    /// Resolve appealed slashing via governance (admin only after governance approval)
    pub fn resolve_appealed_slashing(env: Env, proposal_id: u64, approved: bool) -> Result<(), ContractError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&storage_keys::ADMIN)
            .ok_or(ContractError::NotInitialized)?;

        admin.require_auth();

        let proposals_key = storage_keys::SLASHING_PROPOSALS;
        let mut proposals: soroban_sdk::Map<u64, SlashingProposal> = env
            .storage()
            .persistent()
            .get(&proposals_key)
            .ok_or(ContractError::ProposalNotFound)?;

        let mut proposal = proposals
            .get(proposal_id)
            .ok_or(ContractError::ProposalNotFound)?;

        if proposal.status != SlashingStatus::Appealed {
            return Err(ContractError::ProposalNotPending);
        }

        if approved {
            // Appeal successful - reject the slashing
            proposal.status = SlashingStatus::Rejected;
        } else {
            // Appeal denied - proceed with slashing
            proposal.status = SlashingStatus::Approved;
        }

        proposals.set(proposal_id, proposal);
        env.storage().persistent().set(&proposals_key, &proposals);

        env.events().publish(
            (symbol_short!("resolve"), admin),
            (proposal_id, approved),
        );

        Ok(())
    }
}

fn calculate_rewards(env: &Env, user_stake: &UserStake) -> Result<i128, ContractError> {
    let pools: soroban_sdk::Vec<PoolConfig> = env
        .storage()
        .instance()
        .get(&storage_keys::POOL_CONFIG)
        .ok_or(ContractError::NotInitialized)?;

    if user_stake.pool_id >= pools.len() {
        return Err(ContractError::InvalidPool);
    }

    let pool = pools.get(user_stake.pool_id).unwrap();
    let now = env.ledger().timestamp();
    let elapsed_seconds = now - user_stake.last_claim_timestamp;

    if elapsed_seconds == 0 {
        return Ok(0);
    }

    // Reward = Principal * APY * (elapsed / seconds_in_year)
    // APY is in basis points
    let seconds_in_year: u64 = 365 * 24 * 60 * 60;

    // Scale precision for calculation: (amount * apy * seconds) / (10000 * seconds_in_year)
    // Using i128 to prevent overflow in Intermediate calculation
    let effective_stake = user_stake.amount - user_stake.slashed_amount;
    let reward = (effective_stake * pool.apy_bps as i128 * elapsed_seconds as i128)
        / (10000i128 * seconds_in_year as i128);

    Ok(reward)
}

#[cfg(test)]
mod test;
