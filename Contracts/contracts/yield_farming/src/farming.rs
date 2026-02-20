use soroban_sdk::{
    contract, contractimpl, Address, Env, Error, IntoVal, String, Symbol, Val, Vec,
    token, Map, U256, u64, i128, u128
};
use shared::{admin, storage};

/// Yield farming pool configuration
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FarmingPool {
    pub lp_token: Address,         // Liquidity provider token
    pub reward_token: Address,      // Token distributed as rewards
    pub total_lp_staked: i128,   // Total LP tokens staked
    pub reward_rate: i128,         // Reward rate per second
    pub bonus_rate: i128,          // Bonus rate for early stakers
    pub lock_period: u64,          // Minimum lock period
    pub max_multiplier: u32,        // Maximum bonus multiplier
    pub decay_period: u64,          // Period over which bonus decays
    pub emergency_withdrawal: bool, // Emergency withdrawal status
}

/// User's farming position
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FarmingPosition {
    pub user: Address,
    pub lp_amount: i128,
    pub stake_time: u64,
    pub last_reward_time: u64,
    pub bonus_multiplier: u32,
    pub lock_expiry: u64,
    pub reward_debt: i128,         // Accrued but unclaimed rewards
}

/// Farming reward calculation
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FarmingRewards {
    pub base_rewards: i128,
    pub bonus_rewards: i128,
    pub total_rewards: i128,
    pending_rewards: i128,
    apr: u32,                    // Annual Percentage Rate (basis points)
}

/// Liquidity pool info
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LiquidityPoolInfo {
    pub token_a: Address,
    pub token_b: Address,
    pub lp_token: Address,
    pub reserve_a: i128,
    pub reserve_b: i128,
    pub total_supply: i128,
    pub fee_rate: u32,             // Trading fee rate (basis points)
}

/// Farming error types
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum FarmingError {
    NotInitialized = 1,
    Unauthorized = 2,
    InsufficientBalance = 3,
    InvalidAmount = 4,
    PoolNotFound = 5,
    PositionNotFound = 6,
    LockPeriodNotMet = 7,
    EmergencyMode = 8,
    InvalidPoolConfig = 9,
    RewardCalculationFailed = 10,
    InsufficientLiquidity = 11,
}

/// Farming events
#[contractevent]
pub struct FarmStartedEvent {
    pub user: Address,
    pub lp_amount: i128,
    pub lock_expiry: u64,
    pub bonus_multiplier: u32,
    pub timestamp: u64,
}

#[contractevent]
pub struct FarmEndedEvent {
    pub user: Address,
    pub lp_amount: i128,
    pub rewards_claimed: i128,
    pub timestamp: u64,
}

#[contractevent]
pub struct RewardsClaimedEvent {
    pub user: Address,
    pub base_rewards: i128,
    pub bonus_rewards: i128,
    pub timestamp: u64,
}

#[contractevent]
pub struct PoolUpdatedEvent {
    pub pool_id: u32,
    pub reward_rate: i128,
    pub bonus_rate: i128,
    pub timestamp: u64,
}

#[contract]
pub struct YieldFarmingContract;

#[contractimpl]
impl YieldFarmingContract {
    /// Initialize yield farming contract
    pub fn initialize(
        env: Env,
        admin: Address,
        lp_token: Address,
        reward_token: Address,
        reward_rate: i128,
        bonus_rate: i128,
        lock_period: u64,
        max_multiplier: u32,
        decay_period: u64,
    ) -> Result<u32, FarmingError> {
        if storage::has_admin(&env) {
            return Err(FarmingError::NotInitialized);
        }

        admin.require_auth();

        // Validate parameters
        if reward_rate < 0 || bonus_rate < 0 {
            return Err(FarmingError::InvalidPoolConfig);
        }
        if lock_period == 0 || max_multiplier == 0 || decay_period == 0 {
            return Err(FarmingError::InvalidPoolConfig);
        }

        // Set admin
        storage::set_admin(&env, &admin);

        // Create farming pool
        let pool = FarmingPool {
            lp_token: lp_token.clone(),
            reward_token: reward_token.clone(),
            total_lp_staked: 0,
            reward_rate,
            bonus_rate,
            lock_period,
            max_multiplier,
            decay_period,
            emergency_withdrawal: false,
        };

        // Store pool with ID 0
        storage::set_farming_pool(&env, 0, &pool);
        storage::set_next_pool_id(&env, 1);

        env.events().publish(
            (Symbol::new(&env, "pool_initialized"), admin),
            (0, reward_rate, bonus_rate, env.ledger().timestamp()),
        );

        Ok(0)
    }

    /// Add a new farming pool
    pub fn add_pool(
        env: Env,
        admin: Address,
        lp_token: Address,
        reward_token: Address,
        reward_rate: i128,
        bonus_rate: i128,
        lock_period: u64,
        max_multiplier: u32,
        decay_period: u64,
    ) -> Result<u32, FarmingError> {
        admin::require_admin(&env);

        // Validate parameters
        if reward_rate < 0 || bonus_rate < 0 {
            return Err(FarmingError::InvalidPoolConfig);
        }

        // Get next pool ID
        let pool_id = storage::get_next_pool_id(&env);

        // Create farming pool
        let pool = FarmingPool {
            lp_token: lp_token.clone(),
            reward_token: reward_token.clone(),
            total_lp_staked: 0,
            reward_rate,
            bonus_rate,
            lock_period,
            max_multiplier,
            decay_period,
            emergency_withdrawal: false,
        };

        // Store pool
        storage::set_farming_pool(&env, pool_id, &pool);
        storage::set_next_pool_id(&env, pool_id + 1);

        env.events().publish(
            (Symbol::new(&env, "pool_added"), admin),
            (pool_id, reward_rate, bonus_rate, env.ledger().timestamp()),
        );

        Ok(pool_id)
    }

    /// Start farming with LP tokens
    pub fn start_farming(
        env: Env,
        user: Address,
        pool_id: u32,
        lp_amount: i128,
        lock_period_override: Option<u64>,
    ) -> Result<(), FarmingError> {
        user.require_auth();

        let pool = storage::get_farming_pool(&env, pool_id)
            .ok_or(FarmingError::PoolNotFound)?;

        if pool.emergency_withdrawal {
            return Err(FarmingError::EmergencyMode);
        }

        if lp_amount <= 0 {
            return Err(FarmingError::InvalidAmount);
        }

        // Check if user already has a position
        let position_key = (pool_id, user.clone());
        if storage::has_farming_position(&env, &position_key) {
            return Err(FarmingError::PositionNotFound); // Different error for existing position
        }

        // Calculate lock period and bonus multiplier
        let lock_period = lock_period_override.unwrap_or(pool.lock_period);
        let lock_expiry = env.ledger().timestamp() + lock_period;

        // Calculate bonus multiplier based on lock period
        let bonus_multiplier = Self::calculate_bonus_multiplier(
            &pool,
            lock_period,
            env.ledger().timestamp(),
        )?;

        // Transfer LP tokens to contract
        let lp_token_client = token::Client::new(&env, &pool.lp_token);
        let user_balance = lp_token_client.balance(&user);
        if user_balance < lp_amount {
            return Err(FarmingError::InsufficientBalance);
        }

        lp_token_client.transfer(&user, &env.current_contract_address(), &lp_amount);

        // Create farming position
        let position = FarmingPosition {
            user: user.clone(),
            lp_amount,
            stake_time: env.ledger().timestamp(),
            last_reward_time: env.ledger().timestamp(),
            bonus_multiplier,
            lock_expiry,
            reward_debt: 0,
        };

        // Update pool state
        let mut updated_pool = pool;
        updated_pool.total_lp_staked = updated_pool.total_lp_staked.checked_add(lp_amount)
            .expect("Overflow in total LP staked");
        storage::set_farming_pool(&env, pool_id, &updated_pool);

        // Store position
        storage::set_farming_position(&env, &position_key, &position);

        // Emit event
        env.events().publish(
            (Symbol::new(&env, "farm_started"), user),
            (pool_id, lp_amount, lock_expiry, bonus_multiplier, env.ledger().timestamp()),
        );

        Ok(())
    }

    /// End farming and claim rewards
    pub fn end_farming(env: Env, user: Address, pool_id: u32) -> Result<i128, FarmingError> {
        user.require_auth();

        let pool = storage::get_farming_pool(&env, pool_id)
            .ok_or(FarmingError::PoolNotFound)?;

        let position_key = (pool_id, user.clone());
        let position = storage::get_farming_position(&env, &position_key)
            .ok_or(FarmingError::PositionNotFound)?;

        let current_time = env.ledger().timestamp();

        // Check if lock period has expired (unless in emergency mode)
        if current_time < position.lock_expiry && !pool.emergency_withdrawal {
            return Err(FarmingError::LockPeriodNotMet);
        }

        // Calculate rewards
        let rewards = Self::calculate_farming_rewards(&env, &position, &pool, current_time)?;

        // Transfer LP tokens back to user
        let lp_token_client = token::Client::new(&env, &pool.lp_token);
        lp_token_client.transfer(
            &env.current_contract_address(),
            &user,
            &position.lp_amount,
        );

        // Transfer reward tokens to user
        if rewards.pending_rewards > 0 {
            let reward_token_client = token::Client::new(&env, &pool.reward_token);
            reward_token_client.transfer(
                &env.current_contract_address(),
                &user,
                &rewards.pending_rewards,
            );
        }

        // Update pool state
        let mut updated_pool = pool;
        updated_pool.total_lp_staked = updated_pool.total_lp_staked.checked_sub(position.lp_amount)
            .expect("Underflow in total LP staked");
        storage::set_farming_pool(&env, pool_id, &updated_pool);

        // Remove position
        storage::remove_farming_position(&env, &position_key);

        // Emit event
        env.events().publish(
            (Symbol::new(&env, "farm_ended"), user),
            (pool_id, position.lp_amount, rewards.pending_rewards, current_time),
        );

        Ok(rewards.pending_rewards)
    }

    /// Claim rewards without ending farming
    pub fn claim_rewards(env: Env, user: Address, pool_id: u32) -> Result<i128, FarmingError> {
        user.require_auth();

        let pool = storage::get_farming_pool(&env, pool_id)
            .ok_or(FarmingError::PoolNotFound)?;

        let position_key = (pool_id, user.clone());
        let mut position = storage::get_farming_position(&env, &position_key)
            .ok_or(FarmingError::PositionNotFound)?;

        let current_time = env.ledger().timestamp();
        let rewards = Self::calculate_farming_rewards(&env, &position, &pool, current_time)?;

        if rewards.pending_rewards == 0 {
            return Ok(0);
        }

        // Transfer reward tokens to user
        let reward_token_client = token::Client::new(&env, &pool.reward_token);
        reward_token_client.transfer(
            &env.current_contract_address(),
            &user,
            &rewards.pending_rewards,
        );

        // Update position
        position.last_reward_time = current_time;
        position.reward_debt = 0; // Reset debt after claiming
        storage::set_farming_position(&env, &position_key, &position);

        // Emit event
        env.events().publish(
            (Symbol::new(&env, "rewards_claimed"), user),
            (rewards.base_rewards, rewards.bonus_rewards, current_time),
        );

        Ok(rewards.pending_rewards)
    }

    /// Get user's farming position
    pub fn get_position(env: Env, user: Address, pool_id: u32) -> Result<FarmingPosition, FarmingError> {
        let position_key = (pool_id, user);
        storage::get_farming_position(&env, &position_key)
            .ok_or(FarmingError::PositionNotFound)
    }

    /// Get farming pool information
    pub fn get_pool_info(env: Env, pool_id: u32) -> Result<FarmingPool, FarmingError> {
        storage::get_farming_pool(&env, pool_id)
            .ok_or(FarmingError::PoolNotFound)
    }

    /// Calculate pending rewards for a user
    pub fn get_pending_rewards(env: Env, user: Address, pool_id: u32) -> Result<FarmingRewards, FarmingError> {
        let pool = storage::get_farming_pool(&env, pool_id)
            .ok_or(FarmingError::PoolNotFound)?;

        let position_key = (pool_id, user);
        let position = storage::get_farming_position(&env, &position_key)
            .ok_or(FarmingError::PositionNotFound)?;

        let current_time = env.ledger().timestamp();
        Self::calculate_farming_rewards(&env, &position, &pool, current_time)
    }

    /// Admin: Update pool configuration
    pub fn update_pool(
        env: Env,
        admin: Address,
        pool_id: u32,
        reward_rate: Option<i128>,
        bonus_rate: Option<i128>,
    ) -> Result<(), FarmingError> {
        admin::require_admin(&env);

        let mut pool = storage::get_farming_pool(&env, pool_id)
            .ok_or(FarmingError::PoolNotFound)?;

        if let Some(new_rate) = reward_rate {
            if new_rate < 0 {
                return Err(FarmingError::InvalidPoolConfig);
            }
            pool.reward_rate = new_rate;
        }

        if let Some(new_bonus) = bonus_rate {
            if new_bonus < 0 {
                return Err(FarmingError::InvalidPoolConfig);
            }
            pool.bonus_rate = new_bonus;
        }

        storage::set_farming_pool(&env, pool_id, &pool);

        env.events().publish(
            (Symbol::new(&env, "pool_updated"), admin),
            (pool_id, pool.reward_rate, pool.bonus_rate, env.ledger().timestamp()),
        );

        Ok(())
    }

    /// Admin: Enable/disable emergency withdrawal
    pub fn set_emergency_withdrawal(env: Env, admin: Address, pool_id: u32, enabled: bool) -> Result<(), FarmingError> {
        admin::require_admin(&env);

        let mut pool = storage::get_farming_pool(&env, pool_id)
            .ok_or(FarmingError::PoolNotFound)?;

        pool.emergency_withdrawal = enabled;
        storage::set_farming_pool(&env, pool_id, &pool);

        Ok(())
    }

    /// Calculate bonus multiplier based on lock period and decay
    fn calculate_bonus_multiplier(
        pool: &FarmingPool,
        lock_period: u64,
        current_time: u64,
    ) -> Result<u32, FarmingError> {
        // Calculate decay factor based on time since pool creation
        let decay_factor = if pool.decay_period > 0 {
            let periods_passed = current_time / pool.decay_period;
            let decay = u128::from(periods_passed) * 1000; // 0.1% per period
            if decay >= 10000 {
                0 // Minimum multiplier
            } else {
                (10000 - decay) as u32
            }
        } else {
            10000 // No decay
        };

        // Calculate base multiplier based on lock period
        let base_multiplier = if lock_period >= 365 * 24 * 60 * 60 {
            30000 // 3x for 1 year
        } else if lock_period >= 180 * 24 * 60 * 60 {
            20000 // 2x for 6 months
        } else if lock_period >= 90 * 24 * 60 * 60 {
            15000 // 1.5x for 3 months
        } else if lock_period >= 30 * 24 * 60 * 60 {
            12000 // 1.2x for 1 month
        } else {
            10000 // 1x base
        };

        // Apply decay and cap at max multiplier
        let final_multiplier = (base_multiplier * decay_factor) / 10000;
        Ok(u32::min(final_multiplier, pool.max_multiplier * 100))
    }

    /// Calculate farming rewards
    fn calculate_farming_rewards(
        env: &Env,
        position: &FarmingPosition,
        pool: &FarmingPool,
        current_time: u64,
    ) -> Result<FarmingRewards, FarmingError> {
        let time_since_last_reward = current_time.saturating_sub(position.last_reward_time);
        let total_time_staked = current_time.saturating_sub(position.stake_time);

        // Calculate base rewards
        let base_rewards = pool.reward_rate
            .checked_mul(position.lp_amount as i128)
            .expect("Base reward calculation overflow")
            .checked_mul(time_since_last_reward as i128)
            .expect("Base reward time overflow") / 1_000_000_000; // Convert from per-second rate

        // Calculate bonus rewards
        let bonus_rewards = pool.bonus_rate
            .checked_mul(position.lp_amount as i128)
            .expect("Bonus reward calculation overflow")
            .checked_mul(time_since_last_reward as i128)
            .expect("Bonus reward time overflow")
            .checked_mul(position.bonus_multiplier as i128)
            .expect("Bonus multiplier overflow") / 10000 / 1_000_000_000;

        let total_rewards = base_rewards.checked_add(bonus_rewards)
            .expect("Total reward calculation overflow");

        // Calculate pending rewards (total accrued minus already claimed)
        let pending_rewards = total_rewards.checked_sub(position.reward_debt)
            .expect("Pending reward calculation underflow");

        // Calculate APR
        let seconds_in_year = 365 * 24 * 60 * 60;
        let apr = if total_time_staked > 0 {
            let yearly_rewards = total_rewards.checked_mul(seconds_in_year as i128)
                .expect("APR calculation overflow") / total_time_staked as i128;
            ((yearly_rewards * 10000) / position.lp_amount) as u32
        } else {
            0
        };

        Ok(FarmingRewards {
            base_rewards,
            bonus_rewards,
            total_rewards,
            pending_rewards,
            apr,
        })
    }
}

// Storage module for yield farming contract
pub mod storage {
    use super::*;
    use soroban_sdk::{Env, Address, Map, Vec};

    const ADMIN_KEY: &str = "admin";
    const NEXT_POOL_ID_KEY: &str = "next_pool_id";
    const POOL_PREFIX: &str = "pool";
    const POSITION_PREFIX: &str = "position";

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

    pub fn set_next_pool_id(env: &Env, pool_id: u32) {
        env.storage()
            .persistent()
            .set(&Symbol::new(env, NEXT_POOL_ID_KEY), &pool_id);
    }

    pub fn get_next_pool_id(env: &Env) -> u32 {
        env.storage()
            .persistent()
            .get(&Symbol::new(env, NEXT_POOL_ID_KEY))
            .unwrap_or(0)
    }

    pub fn set_farming_pool(env: &Env, pool_id: u32, pool: &FarmingPool) {
        env.storage()
            .persistent()
            .set(&(Symbol::new(env, POOL_PREFIX), pool_id), pool);
    }

    pub fn get_farming_pool(env: &Env, pool_id: u32) -> Option<FarmingPool> {
        env.storage()
            .persistent()
            .get(&(Symbol::new(env, POOL_PREFIX), pool_id))
    }

    pub fn set_farming_position(env: &Env, position_key: (u32, Address), position: &FarmingPosition) {
        env.storage()
            .persistent()
            .set(&(Symbol::new(env, POSITION_PREFIX), position_key), position);
    }

    pub fn get_farming_position(env: &Env, position_key: (u32, Address)) -> Option<FarmingPosition> {
        env.storage()
            .persistent()
            .get(&(Symbol::new(env, POSITION_PREFIX), position_key))
    }

    pub fn has_farming_position(env: &Env, position_key: (u32, Address)) -> bool {
        env.storage()
            .persistent()
            .has(&(Symbol::new(env, POSITION_PREFIX), position_key))
    }

    pub fn remove_farming_position(env: &Env, position_key: (u32, Address)) {
        env.storage()
            .persistent()
            .remove(&(Symbol::new(env, POSITION_PREFIX), position_key));
    }
}
