#![no_std]
use shared::governance::{GovernanceRole, ProposalStatus};
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, Env, Symbol, Vec,
};

/// Contract version
const CONTRACT_VERSION: u32 = 1;

/// Seconds in one day / one week for bucket calculations
const SECS_PER_DAY: u64 = 86_400;
const SECS_PER_WEEK: u64 = 604_800;

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------
mod storage_keys {
    use soroban_sdk::{symbol_short, Symbol};

    pub const INIT: Symbol = symbol_short!("init");
    pub const ROLES: Symbol = symbol_short!("roles");
    pub const VERSION: Symbol = symbol_short!("ver");
    pub const FROZEN: Symbol = symbol_short!("frozen");
    pub const LIMITS: Symbol = symbol_short!("limits");
    pub const PROP_CNT: Symbol = symbol_short!("prop_cnt");
    pub const PROPS: Symbol = symbol_short!("props");
    pub const APPROVALS: Symbol = symbol_short!("apprv");
    pub const TX_CNT: Symbol = symbol_short!("tx_cnt");
}

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

/// Spending limits and proposal threshold
#[contracttype]
#[derive(Clone, Debug)]
pub struct SpendingLimits {
    /// Maximum tokens that can be withdrawn in one calendar day (direct withdrawal)
    pub daily_limit: i128,
    /// Maximum tokens that can be withdrawn in one calendar week (direct withdrawal)
    pub weekly_limit: i128,
    /// Amounts above this require a multi-sig spend proposal
    pub proposal_threshold: i128,
}

/// A spending proposal requiring M-of-N approval before execution
#[contracttype]
#[derive(Clone, Debug)]
pub struct SpendProposal {
    pub id: u64,
    pub proposer: Address,
    pub recipient: Address,
    pub token: Address,
    pub amount: i128,
    pub description: Symbol,
    /// Allowed approvers for this proposal
    pub approvers: Vec<Address>,
    pub approval_threshold: u32,
    pub approvals_count: u32,
    pub status: ProposalStatus,
    pub created_at: u64,
    pub executed: bool,
}

/// Kind of transaction recorded in the audit log
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum TxKind {
    Deposit = 0,
    DirectWithdrawal = 1,
    ProposalExecution = 2,
}

/// An audit-log entry
#[contracttype]
#[derive(Clone, Debug)]
pub struct TxRecord {
    pub id: u64,
    pub kind: TxKind,
    pub token: Address,
    pub amount: i128,
    pub actor: Address,
    pub recipient: Address,
    pub timestamp: u64,
}

// ---------------------------------------------------------------------------
// Error codes  (5xxx range)
// ---------------------------------------------------------------------------
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum TreasuryError {
    Unauthorized = 5001,
    AlreadyInitialized = 5002,
    InvalidAmount = 5003,
    ExceedsDailyLimit = 5004,
    ExceedsWeeklyLimit = 5005,
    ThresholdRequired = 5006,
    ContractFrozen = 5007,
    ProposalNotFound = 5008,
    ProposalNotApproved = 5009,
    DuplicateApproval = 5010,
    InvalidThreshold = 5011,
    NotInitialized = 5012,
}

impl From<TreasuryError> for soroban_sdk::Error {
    fn from(e: TreasuryError) -> Self {
        soroban_sdk::Error::from_contract_error(e as u32)
    }
}

impl From<&TreasuryError> for soroban_sdk::Error {
    fn from(e: &TreasuryError) -> Self {
        soroban_sdk::Error::from_contract_error(*e as u32)
    }
}

impl From<soroban_sdk::Error> for TreasuryError {
    fn from(_: soroban_sdk::Error) -> Self {
        TreasuryError::Unauthorized
    }
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------
#[contract]
pub struct TreasuryContract;

#[contractimpl]
impl TreasuryContract {
    // -----------------------------------------------------------------------
    // Initialisation
    // -----------------------------------------------------------------------

    /// Initialise the treasury.
    ///
    /// * `admin`               – admin address (Admin role)
    /// * `signers`             – multi-sig signers (Approver role)
    /// * `approval_threshold`  – minimum approvals needed for spend proposals
    /// * `daily_limit`         – max direct-withdrawal per day
    /// * `weekly_limit`        – max direct-withdrawal per week
    /// * `proposal_threshold`  – amounts above this require a proposal
    pub fn init(
        env: Env,
        admin: Address,
        signers: Vec<Address>,
        approval_threshold: u32,
        daily_limit: i128,
        weekly_limit: i128,
        proposal_threshold: i128,
    ) -> Result<(), TreasuryError> {
        if env.storage().persistent().has(&storage_keys::INIT) {
            return Err(TreasuryError::AlreadyInitialized);
        }

        if approval_threshold == 0 || approval_threshold > signers.len() as u32 {
            return Err(TreasuryError::InvalidThreshold);
        }

        // Build role map
        let mut roles = soroban_sdk::Map::new(&env);
        roles.set(admin.clone(), GovernanceRole::Admin);
        for signer in signers.iter() {
            roles.set(signer, GovernanceRole::Approver);
        }

        let limits = SpendingLimits {
            daily_limit,
            weekly_limit,
            proposal_threshold,
        };

        let storage = env.storage().persistent();
        storage.set(&storage_keys::INIT, &true);
        storage.set(&storage_keys::ROLES, &roles);
        storage.set(&storage_keys::VERSION, &CONTRACT_VERSION);
        storage.set(&storage_keys::FROZEN, &false);
        storage.set(&storage_keys::LIMITS, &limits);
        storage.set(&storage_keys::PROP_CNT, &0u64);
        storage.set(&storage_keys::TX_CNT, &0u64);

        // Store approval_threshold alongside signers list for proposals
        storage.set(&symbol_short!("sig_thr"), &approval_threshold);
        storage.set(&symbol_short!("signers"), &signers);

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Deposits
    // -----------------------------------------------------------------------

    /// Deposit `amount` of `token` from `depositor` into the treasury.
    pub fn deposit(
        env: Env,
        token: Address,
        depositor: Address,
        amount: i128,
    ) -> Result<(), TreasuryError> {
        depositor.require_auth();
        Self::require_not_frozen(&env)?;
        Self::require_initialized(&env)?;

        if amount <= 0 {
            return Err(TreasuryError::InvalidAmount);
        }

        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&depositor, &env.current_contract_address(), &amount);

        Self::append_tx_record(
            &env,
            TxKind::Deposit,
            token,
            amount,
            depositor.clone(),
            depositor,
        );

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Direct withdrawal (admin, below proposal threshold, within limits)
    // -----------------------------------------------------------------------

    /// Withdraw funds directly (no proposal required) if amount ≤ proposal_threshold.
    /// Only the admin may call this; daily and weekly limits are enforced.
    pub fn withdraw(
        env: Env,
        admin: Address,
        token: Address,
        recipient: Address,
        amount: i128,
    ) -> Result<(), TreasuryError> {
        admin.require_auth();
        Self::require_not_frozen(&env)?;
        Self::require_initialized(&env)?;
        Self::require_role(&env, &admin, GovernanceRole::Admin)?;

        if amount <= 0 {
            return Err(TreasuryError::InvalidAmount);
        }

        let limits: SpendingLimits = env
            .storage()
            .persistent()
            .get(&storage_keys::LIMITS)
            .ok_or(TreasuryError::NotInitialized)?;

        // Large amounts must go through proposal
        if amount > limits.proposal_threshold {
            return Err(TreasuryError::ThresholdRequired);
        }

        let now = env.ledger().timestamp();
        Self::check_and_update_limits(&env, amount, &limits, now)?;

        // Execute transfer
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&env.current_contract_address(), &recipient, &amount);

        Self::append_tx_record(&env, TxKind::DirectWithdrawal, token, amount, admin, recipient);

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Spend proposals (M-of-N, for large amounts)
    // -----------------------------------------------------------------------

    /// Propose a spend requiring multi-sig approval.
    pub fn propose_spend(
        env: Env,
        proposer: Address,
        token: Address,
        recipient: Address,
        amount: i128,
        description: Symbol,
        approvers: Vec<Address>,
        approval_threshold: u32,
    ) -> Result<u64, TreasuryError> {
        proposer.require_auth();
        Self::require_not_frozen(&env)?;
        Self::require_initialized(&env)?;
        Self::require_role(&env, &proposer, GovernanceRole::Admin)?;

        if amount <= 0 {
            return Err(TreasuryError::InvalidAmount);
        }
        if approval_threshold == 0 || approval_threshold > approvers.len() as u32 {
            return Err(TreasuryError::InvalidThreshold);
        }

        let prop_cnt_key = storage_keys::PROP_CNT;
        let next_id: u64 = env
            .storage()
            .persistent()
            .get(&prop_cnt_key)
            .unwrap_or(0u64)
            + 1;

        let proposal = SpendProposal {
            id: next_id,
            proposer,
            recipient,
            token,
            amount,
            description,
            approvers,
            approval_threshold,
            approvals_count: 0,
            status: ProposalStatus::Pending,
            created_at: env.ledger().timestamp(),
            executed: false,
        };

        let mut proposals: soroban_sdk::Map<u64, SpendProposal> = env
            .storage()
            .persistent()
            .get(&storage_keys::PROPS)
            .unwrap_or_else(|| soroban_sdk::Map::new(&env));

        proposals.set(next_id, proposal);
        env.storage()
            .persistent()
            .set(&storage_keys::PROPS, &proposals);
        env.storage()
            .persistent()
            .set(&prop_cnt_key, &next_id);

        Ok(next_id)
    }

    /// Approve a spend proposal. An approver may only approve once.
    pub fn approve_spend(
        env: Env,
        proposal_id: u64,
        approver: Address,
    ) -> Result<(), TreasuryError> {
        approver.require_auth();
        Self::require_not_frozen(&env)?;
        Self::require_initialized(&env)?;
        Self::require_role(&env, &approver, GovernanceRole::Approver)?;

        let mut proposals: soroban_sdk::Map<u64, SpendProposal> = env
            .storage()
            .persistent()
            .get(&storage_keys::PROPS)
            .ok_or(TreasuryError::ProposalNotFound)?;

        let mut proposal = proposals
            .get(proposal_id)
            .ok_or(TreasuryError::ProposalNotFound)?;

        if proposal.status != ProposalStatus::Pending {
            return Err(TreasuryError::Unauthorized);
        }

        // Must be in the proposal's approver list
        if !proposal.approvers.iter().any(|a| a == approver) {
            return Err(TreasuryError::Unauthorized);
        }

        // Prevent duplicate approvals
        let mut approvals: soroban_sdk::Map<(u64, Address), bool> = env
            .storage()
            .persistent()
            .get(&storage_keys::APPROVALS)
            .unwrap_or_else(|| soroban_sdk::Map::new(&env));

        if approvals.get((proposal_id, approver.clone())).is_some() {
            return Err(TreasuryError::DuplicateApproval);
        }

        approvals.set((proposal_id, approver), true);
        env.storage()
            .persistent()
            .set(&storage_keys::APPROVALS, &approvals);

        proposal.approvals_count += 1;
        if proposal.approvals_count >= proposal.approval_threshold {
            proposal.status = ProposalStatus::Approved;
        }

        proposals.set(proposal_id, proposal);
        env.storage()
            .persistent()
            .set(&storage_keys::PROPS, &proposals);

        Ok(())
    }

    /// Execute an approved spend proposal. Token transfer is performed here.
    pub fn execute_spend(
        env: Env,
        proposal_id: u64,
        executor: Address,
    ) -> Result<(), TreasuryError> {
        executor.require_auth();
        Self::require_not_frozen(&env)?;
        Self::require_initialized(&env)?;
        // Either admin or approver may execute
        Self::require_any_governance_role(&env, &executor)?;

        let mut proposals: soroban_sdk::Map<u64, SpendProposal> = env
            .storage()
            .persistent()
            .get(&storage_keys::PROPS)
            .ok_or(TreasuryError::ProposalNotFound)?;

        let mut proposal = proposals
            .get(proposal_id)
            .ok_or(TreasuryError::ProposalNotFound)?;

        if proposal.status != ProposalStatus::Approved {
            return Err(TreasuryError::ProposalNotApproved);
        }

        let limits: SpendingLimits = env
            .storage()
            .persistent()
            .get(&storage_keys::LIMITS)
            .ok_or(TreasuryError::NotInitialized)?;

        let now = env.ledger().timestamp();
        Self::check_and_update_limits(&env, proposal.amount, &limits, now)?;

        // Perform token transfer
        let token_client = token::Client::new(&env, &proposal.token);
        token_client.transfer(
            &env.current_contract_address(),
            &proposal.recipient,
            &proposal.amount,
        );

        proposal.executed = true;
        proposal.status = ProposalStatus::Executed;

        let recipient = proposal.recipient.clone();
        let token = proposal.token.clone();
        let amount = proposal.amount;

        proposals.set(proposal_id, proposal);
        env.storage()
            .persistent()
            .set(&storage_keys::PROPS, &proposals);

        Self::append_tx_record(&env, TxKind::ProposalExecution, token, amount, executor, recipient);

        Ok(())
    }

    /// Reject a pending spend proposal.
    pub fn reject_spend(
        env: Env,
        proposal_id: u64,
        rejector: Address,
    ) -> Result<(), TreasuryError> {
        rejector.require_auth();
        Self::require_initialized(&env)?;
        Self::require_role(&env, &rejector, GovernanceRole::Approver)?;

        let mut proposals: soroban_sdk::Map<u64, SpendProposal> = env
            .storage()
            .persistent()
            .get(&storage_keys::PROPS)
            .ok_or(TreasuryError::ProposalNotFound)?;

        let mut proposal = proposals
            .get(proposal_id)
            .ok_or(TreasuryError::ProposalNotFound)?;

        if proposal.status != ProposalStatus::Pending {
            return Err(TreasuryError::Unauthorized);
        }

        proposal.status = ProposalStatus::Rejected;
        proposals.set(proposal_id, proposal);
        env.storage()
            .persistent()
            .set(&storage_keys::PROPS, &proposals);

        Ok(())
    }

    /// Cancel a pending spend proposal (admin only).
    pub fn cancel_spend(
        env: Env,
        proposal_id: u64,
        admin: Address,
    ) -> Result<(), TreasuryError> {
        admin.require_auth();
        Self::require_initialized(&env)?;
        Self::require_role(&env, &admin, GovernanceRole::Admin)?;

        let mut proposals: soroban_sdk::Map<u64, SpendProposal> = env
            .storage()
            .persistent()
            .get(&storage_keys::PROPS)
            .ok_or(TreasuryError::ProposalNotFound)?;

        let mut proposal = proposals
            .get(proposal_id)
            .ok_or(TreasuryError::ProposalNotFound)?;

        if proposal.executed {
            return Err(TreasuryError::Unauthorized);
        }

        proposal.status = ProposalStatus::Cancelled;
        proposals.set(proposal_id, proposal);
        env.storage()
            .persistent()
            .set(&storage_keys::PROPS, &proposals);

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Emergency freeze
    // -----------------------------------------------------------------------

    /// Freeze the treasury — blocks deposits, withdrawals, and executions.
    pub fn freeze(env: Env, admin: Address) -> Result<(), TreasuryError> {
        admin.require_auth();
        Self::require_initialized(&env)?;
        Self::require_role(&env, &admin, GovernanceRole::Admin)?;
        env.storage().persistent().set(&storage_keys::FROZEN, &true);
        Ok(())
    }

    /// Unfreeze the treasury.
    pub fn unfreeze(env: Env, admin: Address) -> Result<(), TreasuryError> {
        admin.require_auth();
        Self::require_initialized(&env)?;
        Self::require_role(&env, &admin, GovernanceRole::Admin)?;
        env.storage()
            .persistent()
            .set(&storage_keys::FROZEN, &false);
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Limit management
    // -----------------------------------------------------------------------

    /// Update spending limits (admin only).
    pub fn set_limits(
        env: Env,
        admin: Address,
        daily_limit: i128,
        weekly_limit: i128,
        proposal_threshold: i128,
    ) -> Result<(), TreasuryError> {
        admin.require_auth();
        Self::require_initialized(&env)?;
        Self::require_role(&env, &admin, GovernanceRole::Admin)?;

        let limits = SpendingLimits {
            daily_limit,
            weekly_limit,
            proposal_threshold,
        };
        env.storage()
            .persistent()
            .set(&storage_keys::LIMITS, &limits);
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Queries
    // -----------------------------------------------------------------------

    /// Get a spend proposal by ID.
    pub fn get_proposal(env: Env, proposal_id: u64) -> Result<SpendProposal, TreasuryError> {
        let proposals: soroban_sdk::Map<u64, SpendProposal> = env
            .storage()
            .persistent()
            .get(&storage_keys::PROPS)
            .ok_or(TreasuryError::ProposalNotFound)?;

        proposals
            .get(proposal_id)
            .ok_or(TreasuryError::ProposalNotFound)
    }

    /// Get a paginated slice of the audit log.
    /// `start` is 1-indexed (first record = 1). Returns up to `count` records.
    pub fn get_audit_log(env: Env, start: u64, count: u32) -> Vec<TxRecord> {
        let mut records = Vec::new(&env);
        let total: u64 = env
            .storage()
            .persistent()
            .get(&storage_keys::TX_CNT)
            .unwrap_or(0);

        let end = (start + count as u64 - 1).min(total);
        for id in start..=end {
            let key = (symbol_short!("tx"), id);
            if let Some(record) = env.storage().persistent().get::<_, TxRecord>(&key) {
                records.push_back(record);
            }
        }
        records
    }

    /// Query the treasury balance for a specific token.
    pub fn get_balance(env: Env, token: Address) -> i128 {
        let token_client = token::Client::new(&env, &token);
        token_client.balance(&env.current_contract_address())
    }

    /// Whether the treasury is currently frozen.
    pub fn is_frozen(env: Env) -> bool {
        env.storage()
            .persistent()
            .get(&storage_keys::FROZEN)
            .unwrap_or(false)
    }

    /// Get the current contract version.
    pub fn get_version(env: Env) -> u32 {
        env.storage()
            .persistent()
            .get(&storage_keys::VERSION)
            .unwrap_or(0)
    }

    /// Get current spending limits.
    pub fn get_limits(env: Env) -> Result<SpendingLimits, TreasuryError> {
        env.storage()
            .persistent()
            .get(&storage_keys::LIMITS)
            .ok_or(TreasuryError::NotInitialized)
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    fn require_initialized(env: &Env) -> Result<(), TreasuryError> {
        if !env.storage().persistent().has(&storage_keys::INIT) {
            return Err(TreasuryError::NotInitialized);
        }
        Ok(())
    }

    fn require_not_frozen(env: &Env) -> Result<(), TreasuryError> {
        if env
            .storage()
            .persistent()
            .get(&storage_keys::FROZEN)
            .unwrap_or(false)
        {
            return Err(TreasuryError::ContractFrozen);
        }
        Ok(())
    }

    fn require_role(
        env: &Env,
        address: &Address,
        required: GovernanceRole,
    ) -> Result<(), TreasuryError> {
        let roles: soroban_sdk::Map<Address, GovernanceRole> = env
            .storage()
            .persistent()
            .get(&storage_keys::ROLES)
            .ok_or(TreasuryError::Unauthorized)?;

        let role = roles
            .get(address.clone())
            .ok_or(TreasuryError::Unauthorized)?;

        if role != required {
            return Err(TreasuryError::Unauthorized);
        }
        Ok(())
    }

    /// Accepts Admin or Approver (used for execute_spend).
    fn require_any_governance_role(env: &Env, address: &Address) -> Result<(), TreasuryError> {
        let roles: soroban_sdk::Map<Address, GovernanceRole> = env
            .storage()
            .persistent()
            .get(&storage_keys::ROLES)
            .ok_or(TreasuryError::Unauthorized)?;

        let role = roles
            .get(address.clone())
            .ok_or(TreasuryError::Unauthorized)?;

        if role != GovernanceRole::Admin && role != GovernanceRole::Approver {
            return Err(TreasuryError::Unauthorized);
        }
        Ok(())
    }

    /// Check daily/weekly limits and update the running spend totals atomically.
    fn check_and_update_limits(
        env: &Env,
        amount: i128,
        limits: &SpendingLimits,
        now: u64,
    ) -> Result<(), TreasuryError> {
        let day_bucket = now / SECS_PER_DAY;
        let week_bucket = now / SECS_PER_WEEK;

        let day_key = (symbol_short!("day_sp"), day_bucket);
        let week_key = (symbol_short!("wk_sp"), week_bucket);

        let day_spent: i128 = env
            .storage()
            .persistent()
            .get(&day_key)
            .unwrap_or(0i128);
        let week_spent: i128 = env
            .storage()
            .persistent()
            .get(&week_key)
            .unwrap_or(0i128);

        if limits.daily_limit > 0 && day_spent + amount > limits.daily_limit {
            return Err(TreasuryError::ExceedsDailyLimit);
        }
        if limits.weekly_limit > 0 && week_spent + amount > limits.weekly_limit {
            return Err(TreasuryError::ExceedsWeeklyLimit);
        }

        env.storage()
            .persistent()
            .set(&day_key, &(day_spent + amount));
        env.storage()
            .persistent()
            .set(&week_key, &(week_spent + amount));

        Ok(())
    }

    /// Append a record to the append-only audit log.
    fn append_tx_record(
        env: &Env,
        kind: TxKind,
        token: Address,
        amount: i128,
        actor: Address,
        recipient: Address,
    ) {
        let cnt_key = storage_keys::TX_CNT;
        let next_id: u64 = env
            .storage()
            .persistent()
            .get(&cnt_key)
            .unwrap_or(0u64)
            + 1;

        let record = TxRecord {
            id: next_id,
            kind,
            token,
            amount,
            actor,
            recipient,
            timestamp: env.ledger().timestamp(),
        };

        let key = (symbol_short!("tx"), next_id);
        env.storage().persistent().set(&key, &record);
        env.storage().persistent().set(&cnt_key, &next_id);
    }
}

#[cfg(test)]
mod test;
