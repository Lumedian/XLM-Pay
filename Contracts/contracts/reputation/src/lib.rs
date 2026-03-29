#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol, log};
use shared::acl::ACL;

mod test;

#[contract]
pub struct ReputationContract;

#[contracttype]
#[derive(Clone, Debug)]
pub enum DataKey {
    Admin,
    Score(Address),
    LastActivity(Address),
    DailyPoints(Address),
    LastDailyReset(Address),
    Config,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct ReputationConfig {
    pub decay_rate: i32, // Points per day
    pub daily_cap: i32,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct ReputationInfo {
    pub score: i32,
    pub tier: Symbol,
    pub last_activity: u64,
}

const DAY_IN_SECONDS: u64 = 86400;

#[contractimpl]
impl ReputationContract {
    pub fn init(env: Env, admin: Address) {
        if env.storage().persistent().has(&DataKey::Admin) {
            panic!("Already initialized");
        }
        env.storage().persistent().set(&DataKey::Admin, &admin);
        
        // Setup initial config
        let config = ReputationConfig {
            decay_rate: 1,
            daily_cap: 100,
        };
        env.storage().persistent().set(&DataKey::Config, &config);

        // Assign ADMIN role to the admin address
        let admin_role = symbol_short!("ADMIN");
        ACL::assign_role(&env, &admin, &admin_role);
    }

    pub fn add_authorized_contract(env: Env, admin: Address, contract: Address) {
        admin.require_auth();
        Self::require_admin(&env, &admin);

        let contributor_role = symbol_short!("REPORTER");
        ACL::assign_role(&env, &contract, &contributor_role);
    }

    pub fn update_config(env: Env, admin: Address, config: ReputationConfig) {
        admin.require_auth();
        Self::require_admin(&env, &admin);
        env.storage().persistent().set(&DataKey::Config, &config);
    }

    pub fn add_score(env: Env, reporter: Address, user: Address, amount: i32) {
        reporter.require_auth();
        Self::require_authorized_reporter(&env, &reporter);

        let config: ReputationConfig = env.storage().persistent().get(&DataKey::Config).unwrap();
        let current_time = env.ledger().timestamp();

        // 1. Reset daily cap if needed
        let mut daily_points = env.storage().persistent().get(&DataKey::DailyPoints(user.clone())).unwrap_or(0);
        let last_reset = env.storage().persistent().get(&DataKey::LastDailyReset(user.clone())).unwrap_or(0);
        
        if current_time >= last_reset + DAY_IN_SECONDS {
            daily_points = 0;
            env.storage().persistent().set(&DataKey::LastDailyReset(user.clone()), &current_time);
        }

        // 2. Check daily cap
        if daily_points + amount > config.daily_cap {
            log!(&env, "Daily cap reached for user", user);
            return;
        }

        // 3. Update score with decay
        let mut score = Self::get_current_score(&env, &user);
        score += amount;

        // 4. Update storage
        env.storage().persistent().set(&DataKey::Score(user.clone()), &score);
        env.storage().persistent().set(&DataKey::LastActivity(user.clone()), &current_time);
        env.storage().persistent().set(&DataKey::DailyPoints(user.clone()), &(daily_points + amount));
    }

    pub fn deduct_score(env: Env, admin_or_reporter: Address, user: Address, amount: i32) {
        admin_or_reporter.require_auth();
        // Either admin or authorized reporter can deduct score (e.g. for violations)
        if !Self::is_admin(&env, &admin_or_reporter) && !Self::is_authorized_reporter(&env, &admin_or_reporter) {
            panic!("Unauthorized");
        }

        let mut score = Self::get_current_score(&env, &user);
        score -= amount;
        if score < 0 { score = 0; }

        env.storage().persistent().set(&DataKey::Score(user.clone()), &score);
        env.storage().persistent().set(&DataKey::LastActivity(user.clone()), &env.ledger().timestamp());
    }

    pub fn get_reputation(env: Env, user: Address) -> ReputationInfo {
        let score = Self::get_current_score(&env, &user);
        let tier = Self::get_tier_from_score(score);
        let last_activity = env.storage().persistent().get(&DataKey::LastActivity(user.clone())).unwrap_or(0);

        ReputationInfo {
            score,
            tier,
            last_activity,
        }
    }

    pub fn get_fee_discount(env: Env, user: Address) -> u32 {
        let info = Self::get_reputation(env, user);
        if info.tier == symbol_short!("PLATINUM") {
            5000 // 50% in bps
        } else if info.tier == symbol_short!("GOLD") {
            2500 // 25% in bps
        } else if info.tier == symbol_short!("SILVER") {
            1000 // 10% in bps
        } else {
            0
        }
    }

    pub fn get_trading_limit_multiplier(env: Env, user: Address) -> u32 {
        let info = Self::get_reputation(env, user);
        if info.tier == symbol_short!("PLATINUM") {
            10
        } else if info.tier == symbol_short!("GOLD") {
            5
        } else if info.tier == symbol_short!("SILVER") {
            2
        } else {
            1
        }
    }

    // Internal helpers
    fn get_current_score(env: &Env, user: &Address) -> i32 {
        let last_score: i32 = env.storage().persistent().get(&DataKey::Score(user.clone())).unwrap_or(0);
        let last_activity: u64 = env.storage().persistent().get(&DataKey::LastActivity(user.clone())).unwrap_or(0);
        
        if last_activity == 0 {
            return last_score;
        }

        let config: ReputationConfig = env.storage().persistent().get(&DataKey::Config).unwrap();
        let current_time = env.ledger().timestamp();
        let days_passed = (current_time - last_activity) / DAY_IN_SECONDS;

        if days_passed > 0 {
            let decay = (days_passed as i32) * config.decay_rate;
            let new_score = last_score - decay;
            if new_score < 0 { 0 } else { new_score }
        } else {
            last_score
        }
    }

    fn get_tier_from_score(score: i32) -> Symbol {
        if score >= 2000 {
            symbol_short!("PLATINUM")
        } else if score >= 500 {
            symbol_short!("GOLD")
        } else if score >= 100 {
            symbol_short!("SILVER")
        } else {
            symbol_short!("BRONZE")
        }
    }

    fn require_admin(env: &Env, user: &Address) {
        if !Self::is_admin(env, user) {
            panic!("Admin role required");
        }
    }

    fn is_admin(env: &Env, user: &Address) -> bool {
        let admin_role = symbol_short!("ADMIN");
        let roles = ACL::get_user_roles(env, user);
        for role in roles.iter() {
            if role == admin_role {
                return true;
            }
        }
        false
    }

    fn require_authorized_reporter(env: &Env, user: &Address) {
        if !Self::is_authorized_reporter(env, user) {
            panic!("Authorized reporter role required");
        }
    }

    fn is_authorized_reporter(env: &Env, user: &Address) -> bool {
        let reporter_role = symbol_short!("REPORTER");
        let roles = ACL::get_user_roles(env, user);
        for role in roles.iter() {
            if role == reporter_role {
                return true;
            }
        }
        false
    }
}
