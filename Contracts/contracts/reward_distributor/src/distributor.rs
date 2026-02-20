use soroban_sdk::{
    contract, contractimpl, Address, Env, Error, IntoVal, String, Symbol, Val, Vec,
    token, Map, U256, u64, i128, u128
};

// Admin module for reward distributor
pub mod admin {
    use super::*;
    
    pub fn require_admin(env: &Env) {
        let admin_key = Symbol::new(env, "admin");
        let admin: Address = env.storage()
            .persistent()
            .get(&admin_key)
            .unwrap_or_else(|| panic!("Not initialized"));
        admin.require_auth();
    }
}

/// Reward distribution rule
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DistributionRule {
    pub rule_id: u32,
    pub name: Symbol,
    pub condition_type: ConditionType,
    pub reward_token: Address,
    pub reward_amount: i128,
    pub max_distributions: u32,
    pub current_distributions: u32,
    pub start_time: u64,
    pub end_time: Option<u64>,
    pub is_active: bool,
}

/// Condition types for reward distribution
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ConditionType {
    TimeBased,           // Distribute at specific time intervals
    BalanceBased,         // Distribute based on user balance
    ActivityBased,        // Distribute based on user activity
    TierBased,           // Distribute based on user tier
    Custom,               // Custom condition with external verification
}

/// User's reward eligibility
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UserEligibility {
    pub user: Address,
    pub rule_id: u32,
    pub is_eligible: bool,
    pub last_check_time: u64,
    pub custom_data: Map<Symbol, Val>, // Additional data for custom conditions
    pub multiplier: u32, // Reward multiplier (basis points)
}

/// Distribution record
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DistributionRecord {
    pub distribution_id: u64,
    pub rule_id: u32,
    pub recipient: Address,
    pub amount: i128,
    pub timestamp: u64,
    pub transaction_hash: Option<Vec<u8>>,
}

/// Automated distribution batch
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DistributionBatch {
    pub batch_id: u64,
    pub rule_id: u32,
    pub total_recipients: u32,
    pub total_amount: i128,
    pub start_time: u64,
    pub end_time: u64,
    pub status: BatchStatus,
}

/// Batch distribution status
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum BatchStatus {
    Pending,
    Processing,
    Completed,
    Failed,
}

/// Distribution error types
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum DistributionError {
    NotInitialized = 1,
    Unauthorized = 2,
    InsufficientBalance = 3,
    InvalidAmount = 4,
    RuleNotFound = 5,
    RuleNotActive = 6,
    UserNotEligible = 7,
    DistributionFailed = 8,
    BatchNotFound = 9,
    InvalidCondition = 10,
    MaxDistributionsReached = 11,
}

/// Distribution events
#[contractevent]
pub struct RuleCreatedEvent {
    pub rule_id: u32,
    pub name: Symbol,
    pub condition_type: ConditionType,
    pub reward_token: Address,
    pub reward_amount: i128,
    pub created_by: Address,
    pub timestamp: u64,
}

#[contractevent]
pub struct DistributionEvent {
    pub distribution_id: u64,
    pub rule_id: u32,
    pub recipient: Address,
    pub amount: i128,
    pub timestamp: u64,
}

#[contractevent]
pub struct BatchProcessedEvent {
    pub batch_id: u64,
    pub rule_id: u32,
    pub total_recipients: u32,
    pub total_amount: i128,
    pub status: BatchStatus,
    pub timestamp: u64,
}

#[contract]
pub struct RewardDistributor;

#[contractimpl]
impl RewardDistributor {
    /// Initialize the reward distributor
    pub fn initialize(env: Env, admin: Address) -> Result<(), DistributionError> {
        if storage::has_admin(&env) {
            return Err(DistributionError::NotInitialized);
        }

        admin.require_auth();
        storage::set_admin(&env, &admin);
        storage::set_next_rule_id(&env, 1);
        storage::set_next_distribution_id(&env, 1);
        storage::set_next_batch_id(&env, 1);

        Ok(())
    }

    /// Create a new distribution rule
    pub fn create_rule(
        env: Env,
        admin: Address,
        name: Symbol,
        condition_type: ConditionType,
        reward_token: Address,
        reward_amount: i128,
        max_distributions: u32,
        start_time: u64,
        end_time: Option<u64>,
    ) -> Result<u32, DistributionError> {
        admin::require_admin(&env);

        if reward_amount <= 0 || max_distributions == 0 {
            return Err(DistributionError::InvalidAmount);
        }

        let rule_id = storage::get_next_rule_id(&env);

        let rule = DistributionRule {
            rule_id,
            name: name.clone(),
            condition_type: condition_type.clone(),
            reward_token: reward_token.clone(),
            reward_amount,
            max_distributions,
            current_distributions: 0,
            start_time,
            end_time,
            is_active: true,
        };

        storage::set_distribution_rule(&env, rule_id, &rule);
        storage::set_next_rule_id(&env, rule_id + 1);

        env.events().publish(
            (Symbol::new(&env, "rule_created"), admin),
            (rule_id, name, condition_type, reward_token, reward_amount, env.ledger().timestamp()),
        );

        Ok(rule_id)
    }

    /// Update user eligibility for a rule
    pub fn update_eligibility(
        env: Env,
        admin: Address,
        user: Address,
        rule_id: u32,
        is_eligible: bool,
        custom_data: Option<Map<Symbol, Val>>,
        multiplier: Option<u32>,
    ) -> Result<(), DistributionError> {
        admin::require_admin(&env);

        let rule = storage::get_distribution_rule(&env, rule_id)
            .ok_or(DistributionError::RuleNotFound)?;

        if !rule.is_active {
            return Err(DistributionError::RuleNotActive);
        }

        let eligibility = UserEligibility {
            user: user.clone(),
            rule_id,
            is_eligible,
            last_check_time: env.ledger().timestamp(),
            custom_data: custom_data.unwrap_or_else(|| Map::new(&env)),
            multiplier: multiplier.unwrap_or(10000), // 1x default
        };

        storage::set_user_eligibility(&env, &(rule_id, user), &eligibility);

        Ok(())
    }

    /// Create automated distribution batch
    pub fn create_batch(
        env: Env,
        admin: Address,
        rule_id: u32,
        recipients: Vec<Address>,
    ) -> Result<u64, DistributionError> {
        admin::require_admin(&env);

        let rule = storage::get_distribution_rule(&env, rule_id)
            .ok_or(DistributionError::RuleNotFound)?;

        if !rule.is_active {
            return Err(DistributionError::RuleNotActive);
        }

        let current_time = env.ledger().timestamp();
        if current_time < rule.start_time {
            return Err(DistributionError::RuleNotActive);
        }

        if let Some(end_time) = rule.end_time {
            if current_time > end_time {
                return Err(DistributionError::RuleNotActive);
            }
        }

        if rule.current_distributions + recipients.len() > rule.max_distributions {
            return Err(DistributionError::MaxDistributionsReached);
        }

        let batch_id = storage::get_next_batch_id(&env);
        let total_amount = rule.reward_amount.checked_mul(recipients.len() as i128)
            .expect("Total amount overflow");

        let batch = DistributionBatch {
            batch_id,
            rule_id,
            total_recipients: recipients.len() as u32,
            total_amount,
            start_time: current_time,
            end_time: 0, // Will be set when processing completes
            status: BatchStatus::Pending,
        };

        storage::set_distribution_batch(&env, batch_id, &batch);
        storage::set_next_batch_id(&env, batch_id + 1);

        Ok(batch_id)
    }

    /// Process a distribution batch
    pub fn process_batch(
        env: Env,
        admin: Address,
        batch_id: u64,
    ) -> Result<(), DistributionError> {
        admin::require_admin(&env);

        let mut batch = storage::get_distribution_batch(&env, batch_id)
            .ok_or(DistributionError::BatchNotFound)?;

        if batch.status != BatchStatus::Pending {
            return Err(DistributionError::DistributionFailed);
        }

        let rule = storage::get_distribution_rule(&env, batch.rule_id)
            .ok_or(DistributionError::RuleNotFound)?;

        // Get all eligible users for this rule
        let eligible_users = Self::get_eligible_users(&env, batch.rule_id);

        // Process distributions
        let mut distributed_amount = 0i128;
        let mut distribution_count = 0u32;

        for user in eligible_users.iter() {
            if let Some(eligibility) = storage::get_user_eligibility(&env, &(batch.rule_id, user)) {
                if eligibility.is_eligible {
                    let amount = rule.reward_amount
                        .checked_mul(eligibility.multiplier as i128)
                        .expect("Amount calculation overflow") / 10000;

                    // Transfer tokens
                    let token_client = token::Client::new(&env, &rule.reward_token);
                    let contract_balance = token_client.balance(&env.current_contract_address());
                    
                    if contract_balance >= amount {
                        token_client.transfer(
                            &env.current_contract_address(),
                            &user,
                            &amount,
                        );

                        // Create distribution record
                        let distribution_id = storage::get_next_distribution_id(&env);
                        let record = DistributionRecord {
                            distribution_id,
                            rule_id: batch.rule_id,
                            recipient: user.clone(),
                            amount,
                            timestamp: env.ledger().timestamp(),
                            transaction_hash: None,
                        };

                        storage::set_distribution_record(&env, distribution_id, &record);
                        storage::set_next_distribution_id(&env, distribution_id + 1);

                        distributed_amount = distributed_amount.checked_add(amount)
                            .expect("Distributed amount overflow");
                        distribution_count += 1;
                    }
                }
            }
        }

        // Update rule
        let mut updated_rule = rule;
        updated_rule.current_distributions += distribution_count;
        storage::set_distribution_rule(&env, batch.rule_id, &updated_rule);

        // Update batch
        batch.status = BatchStatus::Completed;
        batch.end_time = env.ledger().timestamp();
        storage::set_distribution_batch(&env, batch_id, &batch);

        env.events().publish(
            (Symbol::new(&env, "batch_processed"), admin),
            (batch_id, batch.rule_id, distribution_count, distributed_amount, batch.status, env.ledger().timestamp()),
        );

        Ok(())
    }

    /// Manual distribution to specific users
    pub fn manual_distribute(
        env: Env,
        admin: Address,
        rule_id: u32,
        recipients: Vec<Address>,
        amounts: Vec<i128>,
    ) -> Result<(), DistributionError> {
        admin::require_admin(&env);

        if recipients.len() != amounts.len() {
            return Err(DistributionError::InvalidAmount);
        }

        let rule = storage::get_distribution_rule(&env, rule_id)
            .ok_or(DistributionError::RuleNotFound)?;

        if !rule.is_active {
            return Err(DistributionError::RuleNotActive);
        }

        // Process manual distributions
        for (i, user) in recipients.iter().enumerate() {
            if let Some(amount) = amounts.get(i as u32) {
                if amount > 0 {
                    let token_client = token::Client::new(&env, &rule.reward_token);
                    let contract_balance = token_client.balance(&env.current_contract_address());
                    
                    if contract_balance >= amount {
                        token_client.transfer(
                            &env.current_contract_address(),
                            &user,
                            &amount,
                        );

                        // Create distribution record
                        let distribution_id = storage::get_next_distribution_id(&env);
                        let record = DistributionRecord {
                            distribution_id,
                            rule_id,
                            recipient: user.clone(),
                            amount,
                            timestamp: env.ledger().timestamp(),
                            transaction_hash: None,
                        };

                        storage::set_distribution_record(&env, distribution_id, &record);
                        storage::set_next_distribution_id(&env, distribution_id + 1);

                        // Emit distribution event
                        env.events().publish(
                            (Symbol::new(&env, "distribution"), distribution_id),
                            (rule_id, user, amount, env.ledger().timestamp()),
                        );
                    }
                }
            }
        }

        Ok(())
    }

    /// Get distribution rule information
    pub fn get_rule(env: Env, rule_id: u32) -> Result<DistributionRule, DistributionError> {
        storage::get_distribution_rule(&env, rule_id)
            .ok_or(DistributionError::RuleNotFound)
    }

    /// Get user eligibility
    pub fn get_eligibility(env: Env, user: Address, rule_id: u32) -> Result<UserEligibility, DistributionError> {
        storage::get_user_eligibility(&env, &(rule_id, user))
            .ok_or(DistributionError::UserNotEligible)
    }

    /// Get distribution batch information
    pub fn get_batch(env: Env, batch_id: u64) -> Result<DistributionBatch, DistributionError> {
        storage::get_distribution_batch(&env, batch_id)
            .ok_or(DistributionError::BatchNotFound)
    }

    /// Get distribution record
    pub fn get_distribution(env: Env, distribution_id: u64) -> Result<DistributionRecord, DistributionError> {
        storage::get_distribution_record(&env, distribution_id)
            .ok_or(DistributionError::DistributionFailed)
    }

    /// Get eligible users for a rule
    fn get_eligible_users(env: &Env, rule_id: u32) -> Vec<Address> {
        let mut eligible_users = Vec::new(env);
        
        // This is a simplified implementation
        // In a real contract, you would query based on the condition type
        let prefix = Symbol::new(env, "eligibility");
        let all_keys = env.storage()
            .persistent()
            .keys(&prefix);

        for key in all_keys.iter() {
            if let Some((stored_rule_id, user)) = key.try_into_val::<(u32, Address)>(env) {
                if stored_rule_id == rule_id {
                    if let Some(eligibility) = storage::get_user_eligibility(env, &(rule_id, user)) {
                        if eligibility.is_eligible {
                            eligible_users.push_back(user);
                        }
                    }
                }
            }
        }

        eligible_users
    }
}

// Storage module for reward distributor
pub mod storage {
    use super::*;
    use soroban_sdk::{Env, Address, Map, Vec};

    const ADMIN_KEY: &str = "admin";
    const NEXT_RULE_ID_KEY: &str = "next_rule_id";
    const NEXT_DISTRIBUTION_ID_KEY: &str = "next_distribution_id";
    const NEXT_BATCH_ID_KEY: &str = "next_batch_id";
    const RULE_PREFIX: &str = "rule";
    const ELIGIBILITY_PREFIX: &str = "eligibility";
    const BATCH_PREFIX: &str = "batch";
    const RECORD_PREFIX: &str = "record";

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

    pub fn set_next_rule_id(env: &Env, rule_id: u32) {
        env.storage()
            .persistent()
            .set(&Symbol::new(env, NEXT_RULE_ID_KEY), &rule_id);
    }

    pub fn get_next_rule_id(env: &Env) -> u32 {
        env.storage()
            .persistent()
            .get(&Symbol::new(env, NEXT_RULE_ID_KEY))
            .unwrap_or(0)
    }

    pub fn set_next_distribution_id(env: &Env, distribution_id: u64) {
        env.storage()
            .persistent()
            .set(&Symbol::new(env, NEXT_DISTRIBUTION_ID_KEY), &distribution_id);
    }

    pub fn get_next_distribution_id(env: &Env) -> u64 {
        env.storage()
            .persistent()
            .get(&Symbol::new(env, NEXT_DISTRIBUTION_ID_KEY))
            .unwrap_or(0)
    }

    pub fn set_next_batch_id(env: &Env, batch_id: u64) {
        env.storage()
            .persistent()
            .set(&Symbol::new(env, NEXT_BATCH_ID_KEY), &batch_id);
    }

    pub fn get_next_batch_id(env: &Env) -> u64 {
        env.storage()
            .persistent()
            .get(&Symbol::new(env, NEXT_BATCH_ID_KEY))
            .unwrap_or(0)
    }

    pub fn set_distribution_rule(env: &Env, rule_id: u32, rule: &DistributionRule) {
        env.storage()
            .persistent()
            .set(&(Symbol::new(env, RULE_PREFIX), rule_id), rule);
    }

    pub fn get_distribution_rule(env: &Env, rule_id: u32) -> Option<DistributionRule> {
        env.storage()
            .persistent()
            .get(&(Symbol::new(env, RULE_PREFIX), rule_id))
    }

    pub fn set_user_eligibility(env: &Env, key: (u32, Address), eligibility: &UserEligibility) {
        env.storage()
            .persistent()
            .set(&(Symbol::new(env, ELIGIBILITY_PREFIX), key), eligibility);
    }

    pub fn get_user_eligibility(env: &Env, key: (u32, Address)) -> Option<UserEligibility> {
        env.storage()
            .persistent()
            .get(&(Symbol::new(env, ELIGIBILITY_PREFIX), key))
    }

    pub fn set_distribution_batch(env: &Env, batch_id: u64, batch: &DistributionBatch) {
        env.storage()
            .persistent()
            .set(&(Symbol::new(env, BATCH_PREFIX), batch_id), batch);
    }

    pub fn get_distribution_batch(env: &Env, batch_id: u64) -> Option<DistributionBatch> {
        env.storage()
            .persistent()
            .get(&(Symbol::new(env, BATCH_PREFIX), batch_id))
    }

    pub fn set_distribution_record(env: &Env, distribution_id: u64, record: &DistributionRecord) {
        env.storage()
            .persistent()
            .set(&(Symbol::new(env, RECORD_PREFIX), distribution_id), record);
    }

    pub fn get_distribution_record(env: &Env, distribution_id: u64) -> Option<DistributionRecord> {
        env.storage()
            .persistent()
            .get(&(Symbol::new(env, RECORD_PREFIX), distribution_id))
    }
}
