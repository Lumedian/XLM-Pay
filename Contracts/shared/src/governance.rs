use crate::events::{
    ApprovalRevokedEvent, EventEmitter, ProposalApprovedEvent, ProposalCancelledEvent,
    ProposalCreatedEvent, ProposalExecutedEvent, ProposalHaltedEvent, ProposalRejectedEvent,
    ProposalResumedEvent,
};
use soroban_sdk::{contracttype, symbol_short, Address, Env, Symbol, Vec};

/// Upgrade proposal that must be approved via governance
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UpgradeProposal {
    pub id: u64,
    pub proposer: Address,
    pub new_contract_hash: Symbol,
    pub target_contract: Address,
    pub description: Symbol,
    pub approval_threshold: u32, // e.g., 2 of 3
    pub approvers: Vec<Address>,
    pub approvals_count: u32,
    pub status: ProposalStatus,
    pub created_at: u64,
    pub execution_time: u64, // Timelock: when it can be executed
    pub executed: bool,

    // New fields for security enhancements
    pub cooling_off_period: u64,     // Minimum time before first approval
    pub current_version: u32,        // Current contract version
    pub proposed_version: u32,       // Proposed contract version
    pub simulation_passed: bool,     // Whether simulation tests passed
    pub simulation_metadata: Symbol, // Simulation results summary
    pub breaking_change: bool,       // Whether this is a breaking change
    pub halt_reason: Symbol,         // Reason if halted (empty if not halted)
    pub halted_at: u64,              // When it was halted (0 if not halted)
}

/// Status of an upgrade proposal
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ProposalStatus {
    Pending = 0,
    Approved = 1,
    Rejected = 2,
    Executed = 3,
    Cancelled = 4,
    Halted = 5, // New status for emergency halts
}

/// Governance role
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum GovernanceRole {
    Admin = 0,    // Can propose upgrades and cancel
    Approver = 1, // Can approve/reject proposals
    Executor = 2, // Can execute approved proposals (after timelock)
}

/// Governance error codes
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum GovernanceError {
    // Existing errors
    Unauthorized = 2001,
    InvalidProposal = 2002,
    InsufficientApprovals = 2003,
    TimelockNotExpired = 2004,
    ProposalNotApproved = 2005,
    InvalidThreshold = 2006,
    DuplicateApproval = 2007,
    ProposalNotFound = 2008,

    // New validation errors
    InvalidHashFormat = 2009,
    InvalidContractAddress = 2010,
    TimelockTooShort = 2011,
    DuplicateApprover = 2012,
    InvalidVersion = 2013,
    VersionNotIncreasing = 2014,

    // New halt errors
    ProposalHalted = 2015,
    CannotHaltExecuted = 2016,
    NotHalted = 2017,

    // New approval errors
    CoolingOffNotExpired = 2018,
    ApprovalNotFound = 2019,
    CannotRevokeAfterThreshold = 2020,
}

impl From<GovernanceError> for soroban_sdk::Error {
    fn from(error: GovernanceError) -> Self {
        soroban_sdk::Error::from_contract_error(error as u32)
    }
}

impl From<soroban_sdk::Error> for GovernanceError {
    fn from(_error: soroban_sdk::Error) -> Self {
        GovernanceError::Unauthorized
    }
}

pub struct GovernanceManager;

/// Validation module for proposal parameter validation
pub struct ValidationModule;

impl ValidationModule {
    /// Validate all proposal parameters before creation
    #[allow(clippy::too_many_arguments)]
    pub fn validate_proposal_params(
        env: &Env,
        new_contract_hash: &Symbol,
        target_contract: &Address,
        approval_threshold: u32,
        approvers: &Vec<Address>,
        timelock_delay: u64,
        current_version: u32,
        proposed_version: u32,
    ) -> Result<(), GovernanceError> {
        // Validate hash format
        Self::validate_hash_format(new_contract_hash)?;

        // Validate contract address
        Self::validate_contract_address(env, target_contract)?;

        // Validate threshold
        Self::validate_threshold(approval_threshold, approvers.len())?;

        // Validate timelock
        Self::validate_timelock(timelock_delay)?;

        // Validate approvers are unique
        Self::validate_approvers_unique(approvers)?;

        // Validate version compatibility
        Self::validate_version_compatibility(current_version, proposed_version)?;

        Ok(())
    }

    /// Validate contract hash format (must not be empty)
    fn validate_hash_format(hash: &Symbol) -> Result<(), GovernanceError> {
        // Check if hash is empty
        let hash_str = hash.to_string();
        if hash_str.is_empty() {
            return Err(GovernanceError::InvalidHashFormat);
        }
        Ok(())
    }

    /// Validate contract address exists (basic check)
    fn validate_contract_address(_env: &Env, _address: &Address) -> Result<(), GovernanceError> {
        // In a real implementation, we would check if the address is a valid contract
        // For now, we just ensure it's not null/invalid
        // The address type itself ensures validity
        Ok(())
    }

    /// Validate approval threshold
    fn validate_threshold(threshold: u32, approver_count: u32) -> Result<(), GovernanceError> {
        if threshold == 0 || threshold > approver_count {
            return Err(GovernanceError::InvalidThreshold);
        }
        Ok(())
    }

    /// Validate timelock meets minimum (3600 seconds = 1 hour)
    fn validate_timelock(timelock: u64) -> Result<(), GovernanceError> {
        const MIN_TIMELOCK: u64 = 3600; // 1 hour minimum
        if timelock < MIN_TIMELOCK {
            return Err(GovernanceError::TimelockTooShort);
        }
        Ok(())
    }

    /// Validate approvers are unique
    fn validate_approvers_unique(approvers: &Vec<Address>) -> Result<(), GovernanceError> {
        for i in 0..approvers.len() {
            for j in (i + 1)..approvers.len() {
                if approvers.get(i).unwrap() == approvers.get(j).unwrap() {
                    return Err(GovernanceError::DuplicateApprover);
                }
            }
        }
        Ok(())
    }

    /// Validate version compatibility (proposed must be greater than current)
    fn validate_version_compatibility(current: u32, proposed: u32) -> Result<(), GovernanceError> {
        if proposed <= current {
            return Err(GovernanceError::VersionNotIncreasing);
        }
        Ok(())
    }
}

/// Halt module for emergency proposal halting
pub struct HaltModule;

impl HaltModule {
    /// Emergency halt an approved proposal
    pub fn halt_proposal(
        env: &Env,
        proposal_id: u64,
        admin: Address,
        reason: Symbol,
    ) -> Result<(), GovernanceError> {
        // Validate admin role
        GovernanceManager::require_role(env, &admin, GovernanceRole::Admin);

        let proposals_key = symbol_short!("props");
        let mut proposals: soroban_sdk::Map<u64, UpgradeProposal> = env
            .storage()
            .persistent()
            .get(&proposals_key)
            .ok_or(GovernanceError::ProposalNotFound)?;

        let mut proposal = proposals
            .get(proposal_id)
            .ok_or(GovernanceError::ProposalNotFound)?;

        // Cannot halt already executed proposals
        if proposal.executed || proposal.status == ProposalStatus::Executed {
            return Err(GovernanceError::CannotHaltExecuted);
        }

        // Update proposal to halted status
        proposal.status = ProposalStatus::Halted;
        proposal.halt_reason = reason.clone();
        proposal.halted_at = env.ledger().timestamp();

        proposals.set(proposal_id, proposal);
        env.storage().persistent().set(&proposals_key, &proposals);

        // Emit halt event
        EventEmitter::proposal_halted(
            env,
            ProposalHaltedEvent {
                proposal_id,
                halted_by: admin,
                reason,
                timestamp: env.ledger().timestamp(),
            },
        );

        Ok(())
    }

    /// Resume a halted proposal with new timelock
    pub fn resume_proposal(
        env: &Env,
        proposal_id: u64,
        admin: Address,
        new_timelock_delay: u64,
    ) -> Result<(), GovernanceError> {
        // Validate admin role
        GovernanceManager::require_role(env, &admin, GovernanceRole::Admin);

        let proposals_key = symbol_short!("props");
        let mut proposals: soroban_sdk::Map<u64, UpgradeProposal> = env
            .storage()
            .persistent()
            .get(&proposals_key)
            .ok_or(GovernanceError::ProposalNotFound)?;

        let mut proposal = proposals
            .get(proposal_id)
            .ok_or(GovernanceError::ProposalNotFound)?;

        // Can only resume halted proposals
        if proposal.status != ProposalStatus::Halted {
            return Err(GovernanceError::NotHalted);
        }

        // Only original proposer or admin can resume
        if proposal.proposer != admin {
            // Check if admin has admin role (already checked above)
            // This allows any admin to resume, not just the proposer
        }

        // Restore to approved status if it was approved before halt
        // Otherwise restore to pending
        if proposal.approvals_count >= proposal.approval_threshold {
            proposal.status = ProposalStatus::Approved;
        } else {
            proposal.status = ProposalStatus::Pending;
        }

        // Set new execution time
        proposal.execution_time = env.ledger().timestamp() + new_timelock_delay;
        proposal.halt_reason = symbol_short!("");
        proposal.halted_at = 0;

        let new_exec_time = proposal.execution_time;

        proposals.set(proposal_id, proposal);
        env.storage().persistent().set(&proposals_key, &proposals);

        // Emit resume event
        EventEmitter::proposal_resumed(
            env,
            ProposalResumedEvent {
                proposal_id,
                resumed_by: admin,
                new_execution_time: new_exec_time,
                timestamp: env.ledger().timestamp(),
            },
        );

        Ok(())
    }

    /// Check if proposal is halted
    pub fn is_halted(env: &Env, proposal_id: u64) -> bool {
        let proposals_key = symbol_short!("props");
        let proposals: soroban_sdk::Map<u64, UpgradeProposal> = env
            .storage()
            .persistent()
            .get(&proposals_key)
            .unwrap_or_else(|| soroban_sdk::Map::new(env));

        if let Some(proposal) = proposals.get(proposal_id) {
            proposal.status == ProposalStatus::Halted
        } else {
            false
        }
    }
}

/// Approval module for enhanced approval workflows
pub struct ApprovalModule;

impl ApprovalModule {
    /// Approve with cooling-off period check
    pub fn approve_with_cooling_off(
        env: &Env,
        proposal_id: u64,
        approver: Address,
    ) -> Result<(), GovernanceError> {
        // Validate approver has permission
        GovernanceManager::require_role(env, &approver, GovernanceRole::Approver);

        let proposals_key = symbol_short!("props");
        let mut proposals: soroban_sdk::Map<u64, UpgradeProposal> = env
            .storage()
            .persistent()
            .get(&proposals_key)
            .ok_or(GovernanceError::ProposalNotFound)?;

        let mut proposal = proposals
            .get(proposal_id)
            .ok_or(GovernanceError::ProposalNotFound)?;

        // Check cooling-off period
        Self::check_cooling_off_period(env, &proposal)?;

        // Validate proposal status
        if proposal.status != ProposalStatus::Pending {
            return Err(GovernanceError::InvalidProposal);
        }

        // Validate approver is in the list
        if !proposal.approvers.iter().any(|a| a == approver) {
            return Err(GovernanceError::Unauthorized);
        }

        // Check for duplicate approval
        let approvals_key = symbol_short!("apprv");
        let mut approvals: soroban_sdk::Map<(u64, Address), bool> = env
            .storage()
            .persistent()
            .get(&approvals_key)
            .unwrap_or_else(|| soroban_sdk::Map::new(env));

        if approvals.get((proposal_id, approver.clone())).is_some() {
            return Err(GovernanceError::DuplicateApproval);
        }

        // Record approval
        approvals.set((proposal_id, approver.clone()), true);
        env.storage().persistent().set(&approvals_key, &approvals);

        // Record approval timestamp
        Self::record_approval_timestamp(env, proposal_id, &approver, env.ledger().timestamp());

        // Increment approval count
        proposal.approvals_count += 1;

        // Check if threshold reached
        if proposal.approvals_count >= proposal.approval_threshold {
            proposal.status = ProposalStatus::Approved;
            // Update execution time from final approval timestamp
            proposal.execution_time =
                env.ledger().timestamp() + (proposal.execution_time - proposal.created_at);
        }

        let current_approvals = proposal.approvals_count;
        let threshold = proposal.approval_threshold;

        proposals.set(proposal_id, proposal);
        env.storage().persistent().set(&proposals_key, &proposals);

        // Emit proposal approved event
        EventEmitter::proposal_approved(
            env,
            ProposalApprovedEvent {
                proposal_id,
                approver,
                current_approvals,
                threshold,
                timestamp: env.ledger().timestamp(),
            },
        );

        Ok(())
    }

    /// Revoke an approval before execution
    pub fn revoke_approval(
        env: &Env,
        proposal_id: u64,
        approver: Address,
    ) -> Result<(), GovernanceError> {
        // Validate approver has permission
        GovernanceManager::require_role(env, &approver, GovernanceRole::Approver);

        let proposals_key = symbol_short!("props");
        let mut proposals: soroban_sdk::Map<u64, UpgradeProposal> = env
            .storage()
            .persistent()
            .get(&proposals_key)
            .ok_or(GovernanceError::ProposalNotFound)?;

        let mut proposal = proposals
            .get(proposal_id)
            .ok_or(GovernanceError::ProposalNotFound)?;

        // Cannot revoke if already executed
        if proposal.executed {
            return Err(GovernanceError::InvalidProposal);
        }

        // Check if approval exists
        let approvals_key = symbol_short!("apprv");
        let mut approvals: soroban_sdk::Map<(u64, Address), bool> = env
            .storage()
            .persistent()
            .get(&approvals_key)
            .unwrap_or_else(|| soroban_sdk::Map::new(env));

        if approvals.get((proposal_id, approver.clone())).is_none() {
            return Err(GovernanceError::ApprovalNotFound);
        }

        // Cannot revoke if threshold already reached and approved
        if proposal.status == ProposalStatus::Approved {
            return Err(GovernanceError::CannotRevokeAfterThreshold);
        }

        // Remove approval
        approvals.remove((proposal_id, approver.clone()));
        env.storage().persistent().set(&approvals_key, &approvals);

        // Decrement approval count
        if proposal.approvals_count > 0 {
            proposal.approvals_count -= 1;
        }

        proposals.set(proposal_id, proposal);
        env.storage().persistent().set(&proposals_key, &proposals);

        // Emit approval revoked event
        EventEmitter::approval_revoked(
            env,
            ApprovalRevokedEvent {
                proposal_id,
                approver,
                timestamp: env.ledger().timestamp(),
            },
        );

        Ok(())
    }

    /// Get time remaining until execution possible
    pub fn get_time_to_execution(env: &Env, proposal_id: u64) -> Result<u64, GovernanceError> {
        let proposals_key = symbol_short!("props");
        let proposals: soroban_sdk::Map<u64, UpgradeProposal> = env
            .storage()
            .persistent()
            .get(&proposals_key)
            .ok_or(GovernanceError::ProposalNotFound)?;

        let proposal = proposals
            .get(proposal_id)
            .ok_or(GovernanceError::ProposalNotFound)?;

        let current_time = env.ledger().timestamp();
        if current_time >= proposal.execution_time {
            Ok(0) // Can execute now
        } else {
            Ok(proposal.execution_time - current_time)
        }
    }

    /// Record approval timestamp
    fn record_approval_timestamp(env: &Env, proposal_id: u64, approver: &Address, timestamp: u64) {
        let timestamp_key = symbol_short!("appr_ts");
        let mut timestamps: soroban_sdk::Map<(u64, Address), u64> = env
            .storage()
            .persistent()
            .get(&timestamp_key)
            .unwrap_or_else(|| soroban_sdk::Map::new(env));

        timestamps.set((proposal_id, approver.clone()), timestamp);
        env.storage().persistent().set(&timestamp_key, &timestamps);
    }

    /// Check if cooling-off period has passed
    fn check_cooling_off_period(
        env: &Env,
        proposal: &UpgradeProposal,
    ) -> Result<(), GovernanceError> {
        let current_time = env.ledger().timestamp();
        let cooling_off_end = proposal.created_at + proposal.cooling_off_period;

        if current_time < cooling_off_end {
            return Err(GovernanceError::CoolingOffNotExpired);
        }

        Ok(())
    }
}

impl GovernanceManager {
    /// Validate that an address has a specific role
    pub fn require_role(env: &Env, address: &Address, required_role: GovernanceRole) {
        let roles_key = symbol_short!("roles");
        let role_map: soroban_sdk::Map<Address, GovernanceRole> = env
            .storage()
            .persistent()
            .get(&roles_key)
            .unwrap_or_else(|| soroban_sdk::Map::new(env));

        let user_role = role_map
            .get(address.clone())
            .unwrap_or(GovernanceRole::Executor);

        if user_role > required_role {
            panic!("UNAUTH");
        }
    }

    /// Create a new upgrade proposal
    #[allow(clippy::too_many_arguments)]
    pub fn propose_upgrade(
        env: &Env,
        proposer: Address,
        new_contract_hash: Symbol,
        target_contract: Address,
        description: Symbol,
        approval_threshold: u32,
        approvers: Vec<Address>,
        timelock_delay: u64,
    ) -> Result<u64, GovernanceError> {
        // Validate proposer is admin
        Self::require_role(env, &proposer, GovernanceRole::Admin);

        // Validate proposal parameters
        ValidationModule::validate_proposal_params(
            env,
            &new_contract_hash,
            &target_contract,
            approval_threshold,
            &approvers,
            timelock_delay,
            1, // current_version - default
            2, // proposed_version - default
        )?;

        // Get next proposal ID
        let proposal_counter_key = symbol_short!("prop_cnt");
        let proposal_id: u64 = env
            .storage()
            .persistent()
            .get(&proposal_counter_key)
            .unwrap_or(0u64);

        let next_id = proposal_id + 1;

        // Clone values for event emission before moving into proposal
        let event_proposer = proposer.clone();
        let event_new_contract_hash = new_contract_hash.clone();
        let event_target_contract = target_contract.clone();
        let event_description = description.clone();

        let proposal = UpgradeProposal {
            id: next_id,
            proposer,
            new_contract_hash,
            target_contract,
            description,
            approval_threshold,
            approvers,
            approvals_count: 0,
            status: ProposalStatus::Pending,
            created_at: env.ledger().timestamp(),
            execution_time: env.ledger().timestamp() + timelock_delay,
            executed: false,

            // New fields with default values
            cooling_off_period: 3600, // 1 hour default cooling-off
            current_version: 1,       // Default to version 1
            proposed_version: 2,      // Default to version 2
            simulation_passed: true,  // Default to passed
            simulation_metadata: symbol_short!("none"), // No simulation by default
            breaking_change: false,   // Default to non-breaking
            halt_reason: symbol_short!(""), // Empty halt reason
            halted_at: 0,             // Not halted
        };

        // Store proposal
        let proposals_key = symbol_short!("props");
        let mut proposals: soroban_sdk::Map<u64, UpgradeProposal> = env
            .storage()
            .persistent()
            .get(&proposals_key)
            .unwrap_or_else(|| soroban_sdk::Map::new(env));

        proposals.set(next_id, proposal);
        env.storage().persistent().set(&proposals_key, &proposals);

        // Update counter
        env.storage()
            .persistent()
            .set(&proposal_counter_key, &next_id);

        // Emit proposal created event
        EventEmitter::proposal_created(
            env,
            ProposalCreatedEvent {
                proposal_id: next_id,
                proposer: event_proposer,
                new_contract_hash: event_new_contract_hash,
                target_contract: event_target_contract,
                description: event_description,
                approval_threshold,
                timelock_delay,
                timestamp: env.ledger().timestamp(),
            },
        );

        Ok(next_id)
    }

    /// Approve a proposal
    pub fn approve_proposal(
        env: &Env,
        proposal_id: u64,
        approver: Address,
    ) -> Result<(), GovernanceError> {
        // Use the enhanced approval module
        ApprovalModule::approve_with_cooling_off(env, proposal_id, approver)
    }

    /// Execute an approved proposal (only after timelock expires)
    pub fn execute_proposal(
        env: &Env,
        proposal_id: u64,
        executor: Address,
    ) -> Result<(), GovernanceError> {
        // Validate executor has permission
        Self::require_role(env, &executor, GovernanceRole::Executor);

        let proposals_key = symbol_short!("props");
        let mut proposals: soroban_sdk::Map<u64, UpgradeProposal> = env
            .storage()
            .persistent()
            .get(&proposals_key)
            .ok_or(GovernanceError::ProposalNotFound)?;

        let mut proposal = proposals
            .get(proposal_id)
            .ok_or(GovernanceError::ProposalNotFound)?;

        // Check if proposal is halted
        if proposal.status == ProposalStatus::Halted {
            return Err(GovernanceError::ProposalHalted);
        }

        // Validate proposal is approved
        if proposal.status != ProposalStatus::Approved {
            return Err(GovernanceError::ProposalNotApproved);
        }

        // Check timelock expiration
        if env.ledger().timestamp() < proposal.execution_time {
            return Err(GovernanceError::TimelockNotExpired);
        }

        // Mark as executed
        proposal.executed = true;
        proposal.status = ProposalStatus::Executed;

        let new_contract_hash = proposal.new_contract_hash.clone();

        proposals.set(proposal_id, proposal);
        env.storage().persistent().set(&proposals_key, &proposals);

        // Emit proposal executed event
        EventEmitter::proposal_executed(
            env,
            ProposalExecutedEvent {
                proposal_id,
                executor,
                new_contract_hash,
                timestamp: env.ledger().timestamp(),
            },
        );

        Ok(())
    }

    /// Reject a proposal
    pub fn reject_proposal(
        env: &Env,
        proposal_id: u64,
        rejector: Address,
    ) -> Result<(), GovernanceError> {
        Self::require_role(env, &rejector, GovernanceRole::Approver);

        let proposals_key = symbol_short!("props");
        let mut proposals: soroban_sdk::Map<u64, UpgradeProposal> = env
            .storage()
            .persistent()
            .get(&proposals_key)
            .ok_or(GovernanceError::ProposalNotFound)?;

        let mut proposal = proposals
            .get(proposal_id)
            .ok_or(GovernanceError::ProposalNotFound)?;

        if proposal.status != ProposalStatus::Pending {
            return Err(GovernanceError::InvalidProposal);
        }

        proposal.status = ProposalStatus::Rejected;
        proposals.set(proposal_id, proposal);
        env.storage().persistent().set(&proposals_key, &proposals);

        // Emit proposal rejected event
        EventEmitter::proposal_rejected(
            env,
            ProposalRejectedEvent {
                proposal_id,
                rejector,
                timestamp: env.ledger().timestamp(),
            },
        );

        Ok(())
    }

    /// Cancel a proposal (admin only)
    pub fn cancel_proposal(
        env: &Env,
        proposal_id: u64,
        admin: Address,
    ) -> Result<(), GovernanceError> {
        Self::require_role(env, &admin, GovernanceRole::Admin);

        let proposals_key = symbol_short!("props");
        let mut proposals: soroban_sdk::Map<u64, UpgradeProposal> = env
            .storage()
            .persistent()
            .get(&proposals_key)
            .ok_or(GovernanceError::ProposalNotFound)?;

        let mut proposal = proposals
            .get(proposal_id)
            .ok_or(GovernanceError::ProposalNotFound)?;

        if proposal.executed {
            return Err(GovernanceError::InvalidProposal);
        }

        proposal.status = ProposalStatus::Cancelled;
        proposals.set(proposal_id, proposal);
        env.storage().persistent().set(&proposals_key, &proposals);

        // Emit proposal cancelled event
        EventEmitter::proposal_cancelled(
            env,
            ProposalCancelledEvent {
                proposal_id,
                cancelled_by: admin,
                timestamp: env.ledger().timestamp(),
            },
        );

        Ok(())
    }

    /// Get a proposal by ID
    pub fn get_proposal(env: &Env, proposal_id: u64) -> Result<UpgradeProposal, GovernanceError> {
        let proposals_key = symbol_short!("props");
        let proposals: soroban_sdk::Map<u64, UpgradeProposal> = env
            .storage()
            .persistent()
            .get(&proposals_key)
            .ok_or(GovernanceError::ProposalNotFound)?;

        proposals
            .get(proposal_id)
            .ok_or(GovernanceError::ProposalNotFound)
    }

    /// Halt a proposal (wrapper for HaltModule)
    pub fn halt_proposal(
        env: &Env,
        proposal_id: u64,
        admin: Address,
        reason: Symbol,
    ) -> Result<(), GovernanceError> {
        HaltModule::halt_proposal(env, proposal_id, admin, reason)
    }

    /// Resume a halted proposal (wrapper for HaltModule)
    pub fn resume_proposal(
        env: &Env,
        proposal_id: u64,
        admin: Address,
        new_timelock_delay: u64,
    ) -> Result<(), GovernanceError> {
        HaltModule::resume_proposal(env, proposal_id, admin, new_timelock_delay)
    }

    /// Revoke an approval (wrapper for ApprovalModule)
    pub fn revoke_approval(
        env: &Env,
        proposal_id: u64,
        approver: Address,
    ) -> Result<(), GovernanceError> {
        ApprovalModule::revoke_approval(env, proposal_id, approver)
    }

    /// Get time to execution (wrapper for ApprovalModule)
    pub fn get_time_to_execution(env: &Env, proposal_id: u64) -> Result<u64, GovernanceError> {
        ApprovalModule::get_time_to_execution(env, proposal_id)
    }
}
