use soroban_sdk::{
    contract, contractimpl, Address, Env, Error, IntoVal, String, Symbol, Val, Vec,
    token, Map, U256, u64, i128, u128
};
use shared::{admin, storage};

/// Governance token with voting power
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GovernanceToken {
    pub token: Address,              // Underlying token
    pub total_supply: i128,           // Total governance tokens
    pub voting_power_multiplier: u32,  // Multiplier for voting power
    pub min_hold_time: u64,           // Minimum time to hold for voting
    pub proposal_threshold: u32,       // Minimum tokens to propose
    pub quorum_threshold: u32,        // Percentage for quorum (basis points)
    pub voting_period: u64,           // Duration of voting period
    pub execution_delay: u64,          // Delay before execution
    pub emergency_council: Vec<Address>, // Emergency council members
}

/// Voting power calculation
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VotingPower {
    pub user: Address,
    pub token_amount: i128,
    pub hold_time: u64,
    pub voting_power: u128,
    pub multiplier: u32,
}

/// Proposal structure
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Proposal {
    pub proposal_id: u64,
    pub proposer: Address,
    pub title: String,
    pub description: String,
    pub proposal_type: ProposalType,
    pub target_contract: Option<Address>,
    pub call_data: Option<BytesN<32>>,
    pub value: Option<i128>,
    pub start_time: u64,
    pub end_time: u64,
    pub execution_time: Option<u64>,
    pub for_votes: u128,
    pub against_votes: u128,
    pub abstain_votes: u128,
    pub status: ProposalStatus,
    pub quorum_reached: bool,
}

/// Proposal types
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProposalType {
    TokenTransfer,        // Transfer tokens from treasury
    ParameterChange,      // Change governance parameters
    ContractUpgrade,     // Upgrade contract
    EmergencyAction,     // Emergency action
    Custom,              // Custom proposal
}

/// Proposal status
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProposalStatus {
    Pending,
    Active,
    Succeeded,
    Failed,
    Executed,
    Expired,
    Cancelled,
}

/// Vote record
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Vote {
    pub voter: Address,
    pub proposal_id: u64,
    pub vote_type: VoteType,
    pub voting_power: u128,
    pub timestamp: u64,
}

/// Vote types
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum VoteType {
    For,
    Against,
    Abstain,
}

/// Governance error types
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum GovernanceError {
    NotInitialized = 1,
    Unauthorized = 2,
    InsufficientBalance = 3,
    InvalidAmount = 4,
    ProposalNotFound = 5,
    AlreadyVoted = 6,
    VotingNotActive = 7,
    VotingEnded = 8,
    ExecutionFailed = 9,
    InvalidProposal = 10,
    QuorumNotReached = 11,
    EmergencyOnly = 12,
    InsufficientVotingPower = 13,
}

/// Governance events
#[contractevent]
pub struct ProposalCreatedEvent {
    pub proposal_id: u64,
    pub proposer: Address,
    pub title: String,
    pub proposal_type: ProposalType,
    pub timestamp: u64,
}

#[contractevent]
pub struct VotedEvent {
    pub voter: Address,
    pub proposal_id: u64,
    pub vote_type: VoteType,
    pub voting_power: u128,
    pub timestamp: u64,
}

#[contractevent]
pub struct ProposalExecutedEvent {
    pub proposal_id: u64,
    pub executor: Address,
    pub success: bool,
    pub timestamp: u64,
}

#[contractevent]
pub struct TokensMintedEvent {
    pub recipient: Address,
    pub amount: i128,
    pub reason: String,
    pub timestamp: u64,
}

#[contractevent]
pub struct TokensBurnedEvent {
    pub burner: Address,
    pub amount: i128,
    pub timestamp: u64,
}

#[contract]
pub struct GovernanceToken;

#[contractimpl]
impl GovernanceToken {
    /// Initialize governance token
    pub fn initialize(
        env: Env,
        admin: Address,
        token: Address,
        voting_power_multiplier: u32,
        min_hold_time: u64,
        proposal_threshold: u32,
        quorum_threshold: u32,
        voting_period: u64,
        execution_delay: u64,
    ) -> Result<(), GovernanceError> {
        if storage::has_admin(&env) {
            return Err(GovernanceError::NotInitialized);
        }

        admin.require_auth();

        // Validate parameters
        if voting_power_multiplier == 0 || quorum_threshold == 0 || quorum_threshold > 10000 {
            return Err(GovernanceError::InvalidProposal);
        }
        if voting_period == 0 || execution_delay == 0 {
            return Err(GovernanceError::InvalidProposal);
        }

        // Set admin
        storage::set_admin(&env, &admin);

        // Initialize governance token
        let governance = GovernanceToken {
            token: token.clone(),
            total_supply: 0,
            voting_power_multiplier,
            min_hold_time,
            proposal_threshold,
            quorum_threshold,
            voting_period,
            execution_delay,
            emergency_council: Vec::new(&env),
        };

        storage::set_governance_token(&env, &governance);
        storage::set_next_proposal_id(&env, 1);

        env.events().publish(
            (Symbol::new(&env, "governance_initialized"), admin),
            (token, voting_power_multiplier, quorum_threshold, env.ledger().timestamp()),
        );

        Ok(())
    }

    /// Mint governance tokens (admin only)
    pub fn mint(
        env: Env,
        admin: Address,
        recipient: Address,
        amount: i128,
        reason: String,
    ) -> Result<(), GovernanceError> {
        admin::require_admin(&env);

        if amount <= 0 {
            return Err(GovernanceError::InvalidAmount);
        }

        let mut governance = storage::get_governance_token(&env);
        governance.total_supply = governance.total_supply.checked_add(amount)
            .expect("Total supply overflow");

        storage::set_governance_token(&env, &governance);

        // Transfer underlying tokens to contract
        let token_client = token::Client::new(&env, &governance.token);
        token_client.transfer(&admin, &env.current_contract_address(), &amount);

        // Create voting power record
        let voting_power = Self::calculate_voting_power(&env, amount, 0, &governance);
        storage::set_voting_power(&env, &recipient, &voting_power);

        env.events().publish(
            (Symbol::new(&env, "tokens_minted"), recipient),
            (amount, reason, env.ledger().timestamp()),
        );

        Ok(())
    }

    /// Burn governance tokens
    pub fn burn(env: Env, burner: Address, amount: i128) -> Result<(), GovernanceError> {
        burner.require_auth();

        if amount <= 0 {
            return Err(GovernanceError::InvalidAmount);
        }

        let voting_power = storage::get_voting_power(&env, &burner)
            .ok_or(GovernanceError::InsufficientVotingPower)?;

        if voting_power.token_amount < amount {
            return Err(GovernanceError::InsufficientBalance);
        }

        let mut governance = storage::get_governance_token(&env);
        governance.total_supply = governance.total_supply.checked_sub(amount)
            .expect("Total supply underflow");

        storage::set_governance_token(&env, &governance);

        // Update voting power
        let new_voting_power = Self::calculate_voting_power(&env, voting_power.token_amount - amount, voting_power.hold_time, &governance);
        storage::set_voting_power(&env, &burner, &new_voting_power);

        // Transfer underlying tokens from contract
        let token_client = token::Client::new(&env, &governance.token);
        token_client.transfer(&env.current_contract_address(), &burner, &amount);

        env.events().publish(
            (Symbol::new(&env, "tokens_burned"), burner),
            (amount, env.ledger().timestamp()),
        );

        Ok(())
    }

    /// Create a new proposal
    pub fn create_proposal(
        env: Env,
        proposer: Address,
        title: String,
        description: String,
        proposal_type: ProposalType,
        target_contract: Option<Address>,
        call_data: Option<BytesN<32>>,
        value: Option<i128>,
    ) -> Result<u64, GovernanceError> {
        proposer.require_auth();

        let governance = storage::get_governance_token(&env);
        let voting_power = storage::get_voting_power(&env, &proposer)
            .ok_or(GovernanceError::InsufficientVotingPower)?;

        // Check if proposer has enough voting power
        let required_power = (governance.proposal_threshold as i128) * 10000 / governance.quorum_threshold as i128;
        if voting_power.voting_power < required_power as u128 {
            return Err(GovernanceError::InsufficientVotingPower);
        }

        let proposal_id = storage::get_next_proposal_id(&env);
        let current_time = env.ledger().timestamp();

        let proposal = Proposal {
            proposal_id,
            proposer: proposer.clone(),
            title: title.clone(),
            description: description.clone(),
            proposal_type: proposal_type.clone(),
            target_contract,
            call_data,
            value,
            start_time: current_time,
            end_time: current_time + governance.voting_period,
            execution_time: None,
            for_votes: 0,
            against_votes: 0,
            abstain_votes: 0,
            status: ProposalStatus::Pending,
            quorum_reached: false,
        };

        storage::set_proposal(&env, proposal_id, &proposal);
        storage::set_next_proposal_id(&env, proposal_id + 1);

        env.events().publish(
            (Symbol::new(&env, "proposal_created"), proposer),
            (proposal_id, title, proposal_type, current_time),
        );

        Ok(proposal_id)
    }

    /// Vote on a proposal
    pub fn vote(
        env: Env,
        voter: Address,
        proposal_id: u64,
        vote_type: VoteType,
    ) -> Result<(), GovernanceError> {
        voter.require_auth();

        let mut proposal = storage::get_proposal(&env, proposal_id)
            .ok_or(GovernanceError::ProposalNotFound)?;

        // Check if voting is active
        let current_time = env.ledger().timestamp();
        if current_time < proposal.start_time || current_time > proposal.end_time {
            return Err(GovernanceError::VotingNotActive);
        }

        // Check if already voted
        if storage::has_vote(&env, &(voter, proposal_id)) {
            return Err(GovernanceError::AlreadyVoted);
        }

        let voting_power = storage::get_voting_power(&env, &voter)
            .ok_or(GovernanceError::InsufficientVotingPower)?;

        // Record vote
        let vote = Vote {
            voter: voter.clone(),
            proposal_id,
            vote_type: vote_type.clone(),
            voting_power: voting_power.voting_power,
            timestamp: current_time,
        };

        storage::set_vote(&env, &(voter, proposal_id), &vote);

        // Update proposal vote counts
        match vote_type {
            VoteType::For => {
                proposal.for_votes = proposal.for_votes.checked_add(voting_power.voting_power)
                    .expect("For votes overflow");
            }
            VoteType::Against => {
                proposal.against_votes = proposal.against_votes.checked_add(voting_power.voting_power)
                    .expect("Against votes overflow");
            }
            VoteType::Abstain => {
                proposal.abstain_votes = proposal.abstain_votes.checked_add(voting_power.voting_power)
                    .expect("Abstain votes overflow");
            }
        }

        // Check if quorum is reached
        let total_votes = proposal.for_votes + proposal.against_votes + proposal.abstain_votes;
        let governance = storage::get_governance_token(&env);
        let total_supply = governance.total_supply;
        
        if total_votes >= (total_supply * governance.quorum_threshold as i128) / 10000 {
            proposal.quorum_reached = true;
        }

        storage::set_proposal(&env, proposal_id, &proposal);

        env.events().publish(
            (Symbol::new(&env, "voted"), voter),
            (proposal_id, vote_type, voting_power.voting_power, current_time),
        );

        Ok(())
    }

    /// Execute a successful proposal
    pub fn execute_proposal(
        env: Env,
        executor: Address,
        proposal_id: u64,
    ) -> Result<(), GovernanceError> {
        executor.require_auth();

        let mut proposal = storage::get_proposal(&env, proposal_id)
            .ok_or(GovernanceError::ProposalNotFound)?;

        let current_time = env.ledger().timestamp();

        // Check if proposal can be executed
        if proposal.status != ProposalStatus::Succeeded {
            return Err(GovernanceError::ExecutionFailed);
        }

        if current_time < proposal.end_time + storage::get_governance_token(&env).execution_delay {
            return Err(GovernanceError::ExecutionFailed);
        }

        // Execute proposal based on type
        let success = match proposal.proposal_type {
            ProposalType::TokenTransfer => {
                if let (Some(target), Some(amount)) = (proposal.target_contract, proposal.value) {
                    // Execute token transfer
                    let token_client = token::Client::new(&env, &storage::get_governance_token(&env).token);
                    let contract_balance = token_client.balance(&env.current_contract_address());
                    
                    if contract_balance >= amount {
                        token_client.transfer(&env.current_contract_address(), &target, &amount);
                        true
                    } else {
                        false
                    }
                } else {
                    false
                }
            }
            ProposalType::ParameterChange => {
                // This would require specific parameter change logic
                // For now, return false as not implemented
                false
            }
            ProposalType::ContractUpgrade => {
                // This would require contract upgrade logic
                // For now, return false as not implemented
                false
            }
            ProposalType::EmergencyAction => {
                // Check if executor is in emergency council
                let governance = storage::get_governance_token(&env);
                if governance.emergency_council.iter().any(|member| member == &executor) {
                    // Execute emergency action
                    true
                } else {
                    false
                }
            }
            ProposalType::Custom => {
                // Execute custom call
                if let (Some(target), Some(call_data)) = (proposal.target_contract, proposal.call_data) {
                    let result = env.try_invoke_contract::<Val, Error>(
                        &target,
                        &Symbol::new(&env, "execute"),
                        Vec::from_array(&env, [
                            env.current_contract_address().into_val(&env),
                            call_data.into_val(&env)
                        ]),
                    );
                    
                    result.is_ok()
                } else {
                    false
                }
            }
        };

        // Update proposal status
        proposal.status = if success { ProposalStatus::Executed } else { ProposalStatus::Failed };
        proposal.execution_time = Some(current_time);
        storage::set_proposal(&env, proposal_id, &proposal);

        env.events().publish(
            (Symbol::new(&env, "proposal_executed"), executor),
            (proposal_id, success, current_time),
        );

        Ok(())
    }

    /// Get user's voting power
    pub fn get_voting_power(env: Env, user: Address) -> Result<VotingPower, GovernanceError> {
        storage::get_voting_power(&env, &user)
            .ok_or(GovernanceError::InsufficientVotingPower)
    }

    /// Get proposal information
    pub fn get_proposal(env: Env, proposal_id: u64) -> Result<Proposal, GovernanceError> {
        storage::get_proposal(&env, proposal_id)
            .ok_or(GovernanceError::ProposalNotFound)
    }

    /// Get governance token information
    pub fn get_governance_info(env: Env) -> GovernanceToken {
        storage::get_governance_token(&env)
    }

    /// Calculate voting power based on token amount and hold time
    fn calculate_voting_power(
        env: &Env,
        token_amount: i128,
        hold_time: u64,
        governance: &GovernanceToken,
    ) -> VotingPower {
        let current_time = env.ledger().timestamp();
        let time_held = current_time.saturating_sub(hold_time);

        // Base voting power is token amount
        let base_power = token_amount as u128;

        // Apply multiplier based on hold time
        let time_multiplier = if time_held >= governance.min_hold_time {
            governance.voting_power_multiplier as u128
        } else {
            1000 // Reduced multiplier for new holders
        };

        let voting_power = base_power.checked_mul(time_multiplier)
            .expect("Voting power calculation overflow") / 1000;

        VotingPower {
            user: Address::generate(env), // Placeholder
            token_amount,
            hold_time,
            voting_power,
            multiplier: time_multiplier as u32,
        }
    }
}

// Storage module for governance token
pub mod storage {
    use super::*;
    use soroban_sdk::{Env, Address, Map, Vec, BytesN};

    const ADMIN_KEY: &str = "admin";
    const GOVERNANCE_KEY: &str = "governance";
    const NEXT_PROPOSAL_ID_KEY: &str = "next_proposal_id";
    const PROPOSAL_PREFIX: &str = "proposal";
    const VOTING_POWER_PREFIX: &str = "voting_power";
    const VOTE_PREFIX: &str = "vote";

    pub fn has_admin(env: &Env) -> bool {
        env.storage()
            .persistent()
            .has(&Symbol::new(env, ADMIN_KEY))
    }

    pub fn set_admin(env: &Env, admin: &Address) {
        env.storage()
            .persistent()
            .set(&Symbol::new(env, ADMIN_KEY), admin);
    }

    pub fn get_admin(env: &Env) -> Address {
        env.storage()
            .persistent()
            .get(&Symbol::new(env, ADMIN_KEY))
            .unwrap()
    }

    pub fn set_governance_token(env: &Env, governance: &GovernanceToken) {
        env.storage()
            .persistent()
            .set(&Symbol::new(env, GOVERNANCE_KEY), governance);
    }

    pub fn get_governance_token(env: &Env) -> GovernanceToken {
        env.storage()
            .persistent()
            .get(&Symbol::new(env, GOVERNANCE_KEY))
            .unwrap()
    }

    pub fn set_next_proposal_id(env: &Env, proposal_id: u64) {
        env.storage()
            .persistent()
            .set(&Symbol::new(env, NEXT_PROPOSAL_ID_KEY), &proposal_id);
    }

    pub fn get_next_proposal_id(env: &Env) -> u64 {
        env.storage()
            .persistent()
            .get(&Symbol::new(env, NEXT_PROPOSAL_ID_KEY))
            .unwrap_or(0)
    }

    pub fn set_proposal(env: &Env, proposal_id: u64, proposal: &Proposal) {
        env.storage()
            .persistent()
            .set(&(Symbol::new(env, PROPOSAL_PREFIX), proposal_id), proposal);
    }

    pub fn get_proposal(env: &Env, proposal_id: u64) -> Option<Proposal> {
        env.storage()
            .persistent()
            .get(&(Symbol::new(env, PROPOSAL_PREFIX), proposal_id))
    }

    pub fn set_voting_power(env: &Env, user: &Address, voting_power: &VotingPower) {
        env.storage()
            .persistent()
            .set(&(Symbol::new(env, VOTING_POWER_PREFIX), user), voting_power);
    }

    pub fn get_voting_power(env: &Env, user: &Address) -> Option<VotingPower> {
        env.storage()
            .persistent()
            .get(&(Symbol::new(env, VOTING_POWER_PREFIX), user))
    }

    pub fn set_vote(env: &Env, key: (Address, u64), vote: &Vote) {
        env.storage()
            .persistent()
            .set(&(Symbol::new(env, VOTE_PREFIX), key), vote);
    }

    pub fn has_vote(env: &Env, key: (Address, u64)) -> bool {
        env.storage()
            .persistent()
            .has(&(Symbol::new(env, VOTE_PREFIX), key))
    }

    pub fn get_vote(env: &Env, key: (Address, u64)) -> Option<Vote> {
        env.storage()
            .persistent()
            .get(&(Symbol::new(env, VOTE_PREFIX), key))
    }
}
