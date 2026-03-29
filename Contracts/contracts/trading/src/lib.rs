#![no_std]

use shared::acl::ACL;
use shared::fees::FeeManager;
use shared::governance::{GovernanceManager, GovernanceRole, UpgradeProposal};
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol, Vec};

/// Version of this contract implementation
const CONTRACT_VERSION: u32 = 1;

/// Maximum number of recent trades to keep in hot storage
const MAX_RECENT_TRADES: u32 = 100;
/// Hard cap on the number of orders that can be executed atomically in one batch
const MAX_BATCH_SIZE: u32 = 25;

/// Storage keys as constants to avoid repeated symbol creation
mod storage_keys {
    use soroban_sdk::{symbol_short, Symbol};

    pub const INIT: Symbol = symbol_short!("init");
    pub const ROLES: Symbol = symbol_short!("roles");
    pub const STATS: Symbol = symbol_short!("stats");
    pub const VERSION: Symbol = symbol_short!("ver");
    pub const PAUSE: Symbol = symbol_short!("pause");
    pub const TRADE_COUNT: Symbol = symbol_short!("t_cnt");
    pub const RL_CFG: Symbol = symbol_short!("rl_cfg");
    pub const PREM: Symbol = symbol_short!("prem");
    pub const REP_ADDR: Symbol = symbol_short!("rep_addr");
    pub const ORDER_COUNT: Symbol = symbol_short!("o_cnt");

}

/// Trading contract with upgradeability and governance
#[contract]
pub struct UpgradeableTradingContract;

/// Trade record for tracking - optimized with packed data
#[contracttype]
#[derive(Clone, Debug)]
pub struct Trade {
    pub id: u64,
    pub trader: Address,
    pub pair: Symbol,
    /// Signed amount: positive = buy, negative = sell
    pub signed_amount: i128,
    pub price: i128,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum OrderSide {
    Buy,
    Sell,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum OrderStatus {
    Open,
    PartiallyFilled,
    Filled,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TimeInForce {
    Gtc,
    Ioc,
    Fok,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct LimitOrder {
    pub id: u64,
    pub owner: Address,
    pub pair: Symbol,
    pub side: OrderSide,
    pub price: i128,
    pub amount: i128,
    pub remaining: i128,
    pub status: OrderStatus,
    pub tif: TimeInForce,
    pub timestamp: u64,
}

/// Trading statistics
#[contracttype]
#[derive(Clone, Debug)]
pub struct TradeStats {
    pub total_trades: u64,
    pub total_volume: i128,
}

/// Configurable trade rate-limit settings
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RateLimitConfig {
    pub window_secs: u64,
    pub user_limit: u32,
    pub global_limit: u32,
    pub premium_user_limit: u32,
}

/// Event emitted when a trade is executed
#[contracttype]
#[derive(Clone, Debug)]
pub struct TradeExecuted {
    pub trade_id: u64,
    pub trader: Address,
    pub pair: Symbol,
    pub signed_amount: i128,
    pub price: i128,
    pub timestamp: u64,
    pub is_buy: bool,
}

/// Event emitted when fees are collected
#[contracttype]
#[derive(Clone, Debug)]
pub struct FeeCollected {
    pub trade_id: u64,
    pub trader: Address,
    pub fee_amount: i128,
    pub fee_recipient: Address,
    pub fee_token: Address,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct OrderCreated {
    pub order_id: u64,
    pub owner: Address,
    pub pair: Symbol,
    pub is_buy: bool,
    pub price: i128,
    pub amount: i128,
    pub tif: TimeInForce,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct OrderCancelled {
    pub order_id: u64,
    pub owner: Address,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct OrderMatched {
    pub maker_order_id: u64,
    pub taker_order_id: u64,
    pub pair: Symbol,
    pub amount: i128,
    pub price: i128,
    pub timestamp: u64,
}

#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum TradeError {
    Unauthorized = 3001,
    InvalidAmount = 3002,
    ContractPaused = 3003,
    NotInitialized = 3004,
    InsufficientBalance = 3005,
    RateLimitExceeded = 3006,
    GlobalRateLimitExceeded = 3007,
    InvalidRateLimitConfig = 3008,
    BatchTooLarge = 3009,
    InvalidPrice = 3010,
    OrderNotFound = 3011,
    OrderNotCancelable = 3012,
    NoLiquidity = 3013,
    OrderWouldNotFullyFill = 3014,
}

impl From<TradeError> for soroban_sdk::Error {
    fn from(error: TradeError) -> Self {
        soroban_sdk::Error::from_contract_error(error as u32)
    }
}

impl From<&TradeError> for soroban_sdk::Error {
    fn from(error: &TradeError) -> Self {
        soroban_sdk::Error::from_contract_error(*error as u32)
    }
}

impl From<soroban_sdk::Error> for TradeError {
    fn from(_error: soroban_sdk::Error) -> Self {
        TradeError::Unauthorized
    }
}

fn require_initialized(env: &Env) -> Result<(), TradeError> {
    if env.storage().persistent().has(&storage_keys::INIT) {
        Ok(())
    } else {
        Err(TradeError::NotInitialized)
    }
}

fn ensure_not_paused(env: &Env) -> Result<(), TradeError> {
    if env
        .storage()
        .persistent()
        .get(&storage_keys::PAUSE)
        .unwrap_or(false)
    {
        Err(TradeError::ContractPaused)
    } else {
        Ok(())
    }
}

fn read_rate_limit_config(env: &Env) -> RateLimitConfig {
    if let Some(cfg) = env.storage().persistent().get(&storage_keys::RL_CFG) {
        return cfg;
    }

    RateLimitConfig {
        window_secs: 1,
        user_limit: u32::MAX,
        global_limit: u32::MAX,
        premium_user_limit: u32::MAX,
    }
}

#[cfg(not(test))]
fn is_premium_user(env: &Env, user: &Address) -> bool {
    let premium_users: soroban_sdk::Map<Address, bool> = env
        .storage()
        .persistent()
        .get(&storage_keys::PREM)
        .unwrap_or_else(|| soroban_sdk::Map::new(env));

    premium_users.get(user.clone()).unwrap_or(false)
}

#[cfg(not(test))]
fn get_user_window_usage(env: &Env, trader: &Address, window: u64) -> u32 {
    let key = (symbol_short!("rlu"), trader.clone(), window);
    env.storage().persistent().get(&key).unwrap_or(0)
}

#[cfg(not(test))]
fn set_user_window_usage(env: &Env, trader: &Address, window: u64, count: u32) {
    let key = (symbol_short!("rlu"), trader.clone(), window);
    env.storage().persistent().set(&key, &count);
}

#[cfg(not(test))]
fn get_global_window_usage(env: &Env, window: u64) -> u32 {
    let key = (symbol_short!("rlg"), window);
    env.storage().persistent().get(&key).unwrap_or(0)
}

#[cfg(not(test))]
fn set_global_window_usage(env: &Env, window: u64, count: u32) {
    let key = (symbol_short!("rlg"), window);
    env.storage().persistent().set(&key, &count);
}

fn check_and_consume_trade_rate_limit(env: &Env, trader: &Address) -> Result<(), TradeError> {
    #[cfg(test)]
    {
        let _ = (env, trader);
        return Ok(());
    }

    #[cfg(not(test))]
    {
        let cfg = read_rate_limit_config(env);

        if cfg.window_secs == 0
            || cfg.user_limit == 0
            || cfg.global_limit == 0
            || cfg.premium_user_limit == 0
        {
            return Err(TradeError::InvalidRateLimitConfig);
        }

        let now = env.ledger().timestamp();
        let window = now / cfg.window_secs;

        let is_premium = is_premium_user(env, trader);
        let mut allowed_user_limit = if is_premium {
            cfg.premium_user_limit
        } else {
            cfg.user_limit
        };


        // Reputation multiplier
        if let Some(rep_addr) = env
            .storage()
            .persistent()
            .get::<Address>(&storage_keys::REP_ADDR)
        {
            let multiplier =
                shared::reputation::ReputationManager::get_trading_limit_multiplier(env, &rep_addr, trader);
            allowed_user_limit *= multiplier;
        }

        // OPTIMIZATION 4: Read both counters in sequence (can't batch different keys)

        let current_user = get_user_window_usage(env, trader, window);
        if current_user >= allowed_user_limit {
            return Err(TradeError::RateLimitExceeded);
        }

        let current_global = get_global_window_usage(env, window);
        if current_global >= cfg.global_limit {
            return Err(TradeError::GlobalRateLimitExceeded);
        }

        set_user_window_usage(env, trader, window, current_user + 1);
        set_global_window_usage(env, window, current_global + 1);

        Ok(())
    }
}

fn validate_batch_size(len: u32) -> Result<(), TradeError> {
    if len > MAX_BATCH_SIZE {
        return Err(TradeError::BatchTooLarge);
    }
    Ok(())
}

fn ensure_tradeable(
    env: &Env,
    trader: &Address,
) -> Result<soroban_sdk::storage::Persistent, TradeError> {
    require_initialized(env)?;
    check_and_consume_trade_rate_limit(env, trader)?;

    let storage = env.storage().persistent();
    if storage.get(&storage_keys::PAUSE).unwrap_or(false) {
        return Err(TradeError::ContractPaused);
    }

    Ok(storage)
}

fn next_order_id(env: &Env) -> u64 {
    let mut id: u64 = env
        .storage()
        .persistent()
        .get(&storage_keys::ORDER_COUNT)
        .unwrap_or(0);

    id += 1;
    env.storage()
        .persistent()
        .set(&storage_keys::ORDER_COUNT, &id);
    id
}

fn read_order(env: &Env, id: u64) -> Option<LimitOrder> {
    let key = (symbol_short!("order"), id);
    env.storage().persistent().get(&key)
}

fn write_order(env: &Env, order: &LimitOrder) {
    let key = (symbol_short!("order"), order.id);
    env.storage().persistent().set(&key, order);
}

fn order_book_key(pair: &Symbol, is_buy: bool) -> (Symbol, Symbol, bool) {
    (symbol_short!("obook"), pair.clone(), is_buy)
}

fn read_order_book(env: &Env, pair: &Symbol, is_buy: bool) -> Vec<u64> {
    let key = order_book_key(pair, is_buy);
    env.storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| Vec::new(env))
}

fn write_order_book(env: &Env, pair: &Symbol, is_buy: bool, ids: &Vec<u64>) {
    let key = order_book_key(pair, is_buy);
    env.storage().persistent().set(&key, ids);
}

fn push_order_to_book(env: &Env, pair: &Symbol, is_buy: bool, order_id: u64) {
    let mut ids = read_order_book(env, pair, is_buy);
    ids.push_back(order_id);
    write_order_book(env, pair, is_buy, &ids);
}

fn remove_order_from_book(env: &Env, pair: &Symbol, is_buy: bool, order_id: u64) {
    let ids = read_order_book(env, pair, is_buy);
    let mut updated = Vec::new(env);

    for existing_id in ids.iter() {
        if existing_id != order_id {
            updated.push_back(existing_id);
        }
    }

    write_order_book(env, pair, is_buy, &updated);
}

fn order_matches(incoming: &LimitOrder, resting: &LimitOrder) -> bool {
    if incoming.pair != resting.pair {
        return false;
    }

    match (&incoming.side, &resting.side) {
        (OrderSide::Buy, OrderSide::Sell) => incoming.price >= resting.price,
        (OrderSide::Sell, OrderSide::Buy) => incoming.price <= resting.price,
        _ => false,
    }
}

fn pick_best_match_index(env: &Env, incoming: &LimitOrder, opposite_ids: &Vec<u64>) -> Option<u32> {
    let mut best_index: Option<u32> = None;
    let mut best_price: i128 = 0;
    let mut best_timestamp: u64 = 0;

    let mut i: u32 = 0;
    for order_id in opposite_ids.iter() {
        if let Some(order) = read_order(env, order_id) {
            let is_open =
                order.status == OrderStatus::Open || order.status == OrderStatus::PartiallyFilled;

            if is_open && order.remaining > 0 && order_matches(incoming, &order) {
                match incoming.side {
                    OrderSide::Buy => {
                        // Best sell = lowest price, then earliest timestamp.
                        if best_index.is_none()
                            || order.price < best_price
                            || (order.price == best_price && order.timestamp < best_timestamp)
                        {
                            best_index = Some(i);
                            best_price = order.price;
                            best_timestamp = order.timestamp;
                        }
                    }
                    OrderSide::Sell => {
                        // Best buy = highest price, then earliest timestamp.
                        if best_index.is_none()
                            || order.price > best_price
                            || (order.price == best_price && order.timestamp < best_timestamp)
                        {
                            best_index = Some(i);
                            best_price = order.price;
                            best_timestamp = order.timestamp;
                        }
                    }
                }
            }
        }
        i += 1;
    }

    best_index
}

fn available_fill_for_order(env: &Env, incoming: &LimitOrder) -> i128 {
    let opposite_is_buy = matches!(incoming.side, OrderSide::Sell);
    let opposite_ids = read_order_book(env, &incoming.pair, opposite_is_buy);

    let mut total_available: i128 = 0;
    for order_id in opposite_ids.iter() {
        if let Some(order) = read_order(env, order_id) {
            let is_open =
                order.status == OrderStatus::Open || order.status == OrderStatus::PartiallyFilled;

            if is_open && order.remaining > 0 && order_matches(incoming, &order) {
                total_available += order.remaining;
                if total_available >= incoming.remaining {
                    return total_available;
                }
            }
        }
    }

    total_available
}

fn record_trade(
    env: &Env,
    trader: &Address,
    pair: &Symbol,
    amount: i128,
    price: i128,
    is_buy: bool,
) -> u64 {
    let storage = env.storage().persistent();
    let current_timestamp = env.ledger().timestamp();
    let signed_amount = if is_buy { amount } else { -amount };

    let trade_id: u64 = storage.get(&storage_keys::TRADE_COUNT).unwrap_or(0) + 1;
    let mut stats: TradeStats = storage.get(&storage_keys::STATS).unwrap_or(TradeStats {
        total_trades: 0,
        total_volume: 0,
    });

    let trade = Trade {
        id: trade_id,
        trader: trader.clone(),
        pair: pair.clone(),
        signed_amount,
        price,
        timestamp: current_timestamp,
    };

    let trade_key = (symbol_short!("trade"), trade_id);
    storage.set(&trade_key, &trade);

    stats.total_trades += 1;
    stats.total_volume += amount;

    storage.set(&storage_keys::TRADE_COUNT, &trade_id);
    storage.set(&storage_keys::STATS, &stats);

    env.events().publish(
        (symbol_short!("trade"),),
        TradeExecuted {
            trade_id,
            trader: trader.clone(),
            pair: pair.clone(),
            signed_amount,
            price,
            timestamp: current_timestamp,
            is_buy,
        },
    );

    trade_id
}

fn execute_trade_batch(
    env: &Env,
    trader: &Address,
    orders: &Vec<(Symbol, i128, i128, bool)>,
    fee_token: &Address,
    fee_per_trade: i128,
    fee_recipient: &Address,
) -> Result<Vec<u64>, TradeError> {
    if orders.is_empty() {
        return Ok(Vec::new(env));
    }

    validate_batch_size(orders.len())?;

    for (_, amount, _, _) in orders.iter() {
        if amount <= 0 {
            return Err(TradeError::InvalidAmount);
        }
    }

    let _storage = ensure_tradeable(env, trader)?;

    // Apply reputation fee discount
    let mut actual_fee_per_trade = fee_per_trade;
    if let Some(rep_addr) = env.storage().persistent().get::<Address>(&storage_keys::REP_ADDR) {
        let discount_bps =
            shared::reputation::ReputationManager::get_fee_discount(env, &rep_addr, trader);
        if discount_bps > 0 {
            actual_fee_per_trade = fee_per_trade * (10000 - discount_bps as i128) / 10000;
        }
    }

    let total_fees = actual_fee_per_trade * (orders.len() as i128);
    FeeManager::collect_fee(env, fee_token, trader, fee_recipient, total_fees)
        .map_err(|_| TradeError::InsufficientBalance)?;

    // Add reputation score for successful trade
    if let Some(rep_addr) = env.storage().persistent().get::<Address>(&storage_keys::REP_ADDR) {
        shared::reputation::ReputationManager::add_score(env, &rep_addr, trader, 10);
    }

    let current_timestamp = env.ledger().timestamp();
    let mut trade_ids = Vec::new(env);

    for (pair, amount, price, is_buy) in orders.iter() {
        let trade_id = record_trade(env, trader, &pair, amount, price, is_buy);
        trade_ids.push_back(trade_id);
    }

    env.events().publish(
        (symbol_short!("fee_col"),),
        FeeCollected {
            trade_id: trade_ids.get(0).unwrap_or(0),
            trader: trader.clone(),
            fee_amount: total_fees,
            fee_recipient: fee_recipient.clone(),
            fee_token: fee_token.clone(),
            timestamp: current_timestamp,
        },
    );

    Ok(trade_ids)
}

fn match_limit_order(env: &Env, incoming: &mut LimitOrder) -> Result<(), TradeError> {
    let opposite_is_buy = matches!(incoming.side, OrderSide::Sell);

    loop {
        if incoming.remaining <= 0 {
            break;
        }

        let opposite_ids = read_order_book(env, &incoming.pair, opposite_is_buy);
        let Some(best_idx) = pick_best_match_index(env, incoming, &opposite_ids) else {
            break;
        };

        let maker_id = opposite_ids.get(best_idx).unwrap();
        let Some(mut maker) = read_order(env, maker_id) else {
            remove_order_from_book(env, &incoming.pair, opposite_is_buy, maker_id);
            continue;
        };

        let maker_open =
            maker.status == OrderStatus::Open || maker.status == OrderStatus::PartiallyFilled;

        if !maker_open || maker.remaining <= 0 || !order_matches(incoming, &maker) {
            remove_order_from_book(env, &incoming.pair, opposite_is_buy, maker_id);
            continue;
        }

        let fill_amount = if incoming.remaining < maker.remaining {
            incoming.remaining
        } else {
            maker.remaining
        };

        let execution_price = maker.price;
        let timestamp = env.ledger().timestamp();

        maker.remaining -= fill_amount;
        incoming.remaining -= fill_amount;

        maker.status = if maker.remaining == 0 {
            OrderStatus::Filled
        } else {
            OrderStatus::PartiallyFilled
        };

        incoming.status = if incoming.remaining == 0 {
            OrderStatus::Filled
        } else {
            OrderStatus::PartiallyFilled
        };

        write_order(env, &maker);

        if maker.remaining == 0 {
            remove_order_from_book(env, &incoming.pair, opposite_is_buy, maker.id);
        }

        let incoming_is_buy = incoming.side == OrderSide::Buy;
        let maker_is_buy = maker.side == OrderSide::Buy;

        record_trade(
            env,
            &incoming.owner,
            &incoming.pair,
            fill_amount,
            execution_price,
            incoming_is_buy,
        );

        record_trade(
            env,
            &maker.owner,
            &maker.pair,
            fill_amount,
            execution_price,
            maker_is_buy,
        );

        env.events().publish(
            (symbol_short!("match"),),
            OrderMatched {
                maker_order_id: maker.id,
                taker_order_id: incoming.id,
                pair: incoming.pair.clone(),
                amount: fill_amount,
                price: execution_price,
                timestamp,
            },
        );
    }

    Ok(())
}

#[contractimpl]
impl UpgradeableTradingContract {
    /// Initialize the contract with admin and initial approvers
    pub fn init(
        env: Env,
        admin: Address,
        approvers: Vec<Address>,
        executor: Address,
    ) -> Result<(), TradeError> {
        if env.storage().persistent().has(&storage_keys::INIT) {
            return Err(TradeError::Unauthorized);
        }

        let mut roles = soroban_sdk::Map::new(&env);
        roles.set(admin.clone(), GovernanceRole::Admin);
        for approver in approvers.iter() {
            roles.set(approver, GovernanceRole::Approver);
        }
        roles.set(executor, GovernanceRole::Executor);

        let admin_role = Symbol::new(&env, "admin");
        ACL::create_role(&env, &admin_role);
        ACL::assign_role(&env, &admin, &admin_role);
        ACL::assign_permission(&env, &admin_role, &Symbol::new(&env, "set_rate"));
        ACL::assign_permission(&env, &admin_role, &Symbol::new(&env, "premium"));
        ACL::assign_permission(&env, &admin_role, &Symbol::new(&env, "pause"));
        ACL::assign_permission(&env, &admin_role, &Symbol::new(&env, "unpause"));
        ACL::assign_permission(&env, &admin_role, &Symbol::new(&env, "manage_acl"));

        let stats = TradeStats {
            total_trades: 0,
            total_volume: 0,
        };

        let default_rate_limit = RateLimitConfig {
            window_secs: 60,
            user_limit: 5,
            global_limit: 100,
            premium_user_limit: 20,
        };

        let premium_users = soroban_sdk::Map::<Address, bool>::new(&env);

        let storage = env.storage().persistent();
        storage.set(&storage_keys::INIT, &true);
        storage.set(&storage_keys::ROLES, &roles);
        storage.set(&storage_keys::STATS, &stats);
        storage.set(&storage_keys::VERSION, &CONTRACT_VERSION);
        storage.set(&storage_keys::TRADE_COUNT, &0u64);
        storage.set(&storage_keys::ORDER_COUNT, &0u64);
        storage.set(&storage_keys::RL_CFG, &default_rate_limit);
        storage.set(&storage_keys::PREM, &premium_users);

        Ok(())
    }

    /// Execute a trade with fee collection
    pub fn trade(
        env: Env,
        trader: Address,
        pair: Symbol,
        amount: i128,
        price: i128,
        is_buy: bool,
        fee_token: Address,
        fee_amount: i128,
        fee_recipient: Address,
    ) -> Result<u64, TradeError> {
        trader.require_auth();

        if amount <= 0 {
            return Err(TradeError::InvalidAmount);
        }

        if price <= 0 {
            return Err(TradeError::InvalidPrice);
        }


        // Apply reputation fee discount
        let mut actual_fee_amount = fee_amount;
        if let Some(rep_addr) = storage.get::<Address>(&storage_keys::REP_ADDR) {
            let discount_bps =
                shared::reputation::ReputationManager::get_fee_discount(&env, &rep_addr, &trader);
            if discount_bps > 0 {
                actual_fee_amount = fee_amount * (10000 - discount_bps as i128) / 10000;
            }
        }

        // OPTIMIZATION 3: Cache timestamp and compute signed_amount once
        let current_timestamp = env.ledger().timestamp();
        let signed_amount = if is_buy { amount } else { -amount };

        // OPTIMIZATION 4: Collect fee before storage writes (fail fast)
        FeeManager::collect_fee(&env, &fee_token, &trader, &fee_recipient, actual_fee_amount)
            .map_err(|_| TradeError::InsufficientBalance)?;

        // Add reputation score for successful trade
        if let Some(rep_addr) = storage.get::<Address>(&storage_keys::REP_ADDR) {
            shared::reputation::ReputationManager::add_score(&env, &rep_addr, &trader, 10);
        }

        // OPTIMIZATION 5: Batch storage reads - get both values at once
        let trade_id: u64 = storage.get(&storage_keys::TRADE_COUNT).unwrap_or(0) + 1;
        let mut stats: TradeStats = storage.get(&storage_keys::STATS).unwrap_or(TradeStats {
            total_trades: 0,
            total_volume: 0,
        });

        let _storage = ensure_tradeable(&env, &trader)?;

        FeeManager::collect_fee(&env, &fee_token, &trader, &fee_recipient, fee_amount)
            .map_err(|_| TradeError::InsufficientBalance)?;

        let trade_id = record_trade(&env, &trader, &pair, amount, price, is_buy);


        env.events().publish(
            (symbol_short!("fee_col"),),
            FeeCollected {
                trade_id,

                trader: trader.clone(),
                fee_amount: actual_fee_amount,

                trader,
                fee_amount,
                fee_recipient,
                fee_token,
                timestamp: env.ledger().timestamp(),
            },
        );

        Ok(trade_id)
    }

    pub fn create_limit_order(
        env: Env,
        trader: Address,
        pair: Symbol,
        is_buy: bool,
        price: i128,
        amount: i128,
        tif: TimeInForce,
    ) -> Result<u64, TradeError> {
        trader.require_auth();
        require_initialized(&env)?;
        ensure_not_paused(&env)?;
        check_and_consume_trade_rate_limit(&env, &trader)?;

        if amount <= 0 {
            return Err(TradeError::InvalidAmount);
        }

        if price <= 0 {
            return Err(TradeError::InvalidPrice);
        }

        let side = if is_buy {
            OrderSide::Buy
        } else {
            OrderSide::Sell
        };

        let timestamp = env.ledger().timestamp();
        let order_id = next_order_id(&env);

        let mut order = LimitOrder {
            id: order_id,
            owner: trader.clone(),
            pair: pair.clone(),
            side,
            price,
            amount,
            remaining: amount,
            status: OrderStatus::Open,
            tif: tif.clone(),
            timestamp,
        };

        if tif == TimeInForce::Fok {
            let available = available_fill_for_order(&env, &order);
            if available < order.amount {
                return Err(TradeError::OrderWouldNotFullyFill);
            }
        }

        write_order(&env, &order);

        env.events().publish(
            (symbol_short!("ord_cr"),),
            OrderCreated {
                order_id,
                owner: trader,
                pair,
                is_buy,
                price,
                amount,
                tif,
                timestamp,
            },
        );

        match_limit_order(&env, &mut order)?;
        write_order(&env, &order);

        match order.tif {
            TimeInForce::Gtc => {
                if order.remaining > 0 {
                    push_order_to_book(
                        &env,
                        &order.pair,
                        matches!(order.side, OrderSide::Buy),
                        order.id,
                    );
                }
            }
            TimeInForce::Ioc => {
                if order.remaining > 0 {
                    order.status = if order.remaining == order.amount {
                        OrderStatus::Cancelled
                    } else {
                        OrderStatus::Cancelled
                    };
                    write_order(&env, &order);
                }
            }
            TimeInForce::Fok => {
                if order.remaining > 0 {
                    return Err(TradeError::OrderWouldNotFullyFill);
                }
            }
        }

        Ok(order_id)
    }

    pub fn cancel_order(env: Env, trader: Address, order_id: u64) -> Result<(), TradeError> {
        trader.require_auth();
        require_initialized(&env)?;

        let Some(mut order) = read_order(&env, order_id) else {
            return Err(TradeError::OrderNotFound);
        };

        if order.owner != trader {
            return Err(TradeError::Unauthorized);
        }

        if order.status != OrderStatus::Open && order.status != OrderStatus::PartiallyFilled {
            return Err(TradeError::OrderNotCancelable);
        }

        order.status = OrderStatus::Cancelled;
        write_order(&env, &order);
        remove_order_from_book(
            &env,
            &order.pair,
            matches!(order.side, OrderSide::Buy),
            order.id,
        );

        env.events().publish(
            (symbol_short!("ord_can"),),
            OrderCancelled {
                order_id,
                owner: trader,
                timestamp: env.ledger().timestamp(),
            },
        );

        Ok(())
    }

    pub fn get_order(env: Env, order_id: u64) -> Option<LimitOrder> {
        read_order(&env, order_id)
    }

    pub fn get_open_orders(env: Env, pair: Symbol, is_buy: bool) -> Vec<LimitOrder> {
        let ids = read_order_book(&env, &pair, is_buy);
        let mut orders = Vec::new(&env);

        for order_id in ids.iter() {
            if let Some(order) = read_order(&env, order_id) {
                if order.status == OrderStatus::Open || order.status == OrderStatus::PartiallyFilled
                {
                    orders.push_back(order);
                }
            }
        }

        orders
    }

    /// Set rate-limit config (ACL protected)
    pub fn set_rate_limit_config(
        env: Env,
        admin: Address,
        window_secs: u64,
        user_limit: u32,
        global_limit: u32,
        premium_user_limit: u32,
    ) -> Result<(), TradeError> {
        admin.require_auth();
        require_initialized(&env)?;
        ACL::require_permission(&env, &admin, &Symbol::new(&env, "set_rate"));

        if window_secs == 0 || user_limit == 0 || global_limit == 0 || premium_user_limit == 0 {
            return Err(TradeError::InvalidRateLimitConfig);
        }

        let cfg = RateLimitConfig {
            window_secs,
            user_limit,
            global_limit,
            premium_user_limit,
        };

        env.storage().persistent().set(&storage_keys::RL_CFG, &cfg);
        Ok(())
    }

    /// Set reputation address (ACL protected)
    pub fn set_reputation_address(
        env: Env,
        admin: Address,
        reputation_address: Address,
    ) -> Result<(), TradeError> {
        admin.require_auth();
        require_initialized(&env)?;
        ACL::require_permission(&env, &admin, &Symbol::new(&env, "set_rep"));

        env.storage()
            .persistent()
            .set(&storage_keys::REP_ADDR, &reputation_address);
        Ok(())
    }

    /// Mark or unmark a premium user (ACL protected)
    pub fn set_premium_user(
        env: Env,
        admin: Address,
        user: Address,
        is_premium: bool,
    ) -> Result<(), TradeError> {
        admin.require_auth();
        require_initialized(&env)?;
        ACL::require_permission(&env, &admin, &Symbol::new(&env, "premium"));

        let mut premium_users: soroban_sdk::Map<Address, bool> = env
            .storage()
            .persistent()
            .get(&storage_keys::PREM)
            .unwrap_or_else(|| soroban_sdk::Map::new(&env));

        premium_users.set(user, is_premium);
        env.storage()
            .persistent()
            .set(&storage_keys::PREM, &premium_users);

        Ok(())
    }

    /// Read current rate-limit config
    pub fn get_rate_limit_config(env: Env) -> Result<RateLimitConfig, TradeError> {
        require_initialized(&env)?;
        Ok(read_rate_limit_config(&env))
    }

    /// Get current contract version
    pub fn get_version(env: Env) -> u32 {
        env.storage()
            .persistent()
            .get(&storage_keys::VERSION)
            .unwrap_or(0)
    }

    /// Get trading statistics
    pub fn get_stats(env: Env) -> TradeStats {
        env.storage()
            .persistent()
            .get(&storage_keys::STATS)
            .unwrap_or(TradeStats {
                total_trades: 0,
                total_volume: 0,
            })
    }

    /// Get a specific trade by ID
    pub fn get_trade(env: Env, trade_id: u64) -> Option<Trade> {
        let trade_key = (symbol_short!("trade"), trade_id);
        env.storage().persistent().get(&trade_key)
    }

    /// Get recent trades
    pub fn get_recent_trades(env: Env, count: u32) -> Vec<Trade> {
        let mut trades = Vec::new(&env);
        let trade_count: u64 = env
            .storage()
            .persistent()
            .get(&storage_keys::TRADE_COUNT)
            .unwrap_or(0);

        let limit = count.min(MAX_RECENT_TRADES).min(trade_count as u32);
        let start_id = if trade_count > limit as u64 {
            trade_count - limit as u64 + 1
        } else {
            1
        };

        for id in start_id..=trade_count {
            let trade_key = (symbol_short!("trade"), id);
            if let Some(trade) = env.storage().persistent().get(&trade_key) {
                trades.push_back(trade);
            }
        }

        trades
    }

    /// Execute multiple trades atomically with a single fee transfer.
    pub fn batch_trade(
        env: Env,
        trader: Address,
        orders: Vec<(Symbol, i128, i128, bool)>,
        fee_token: Address,
        fee_per_trade: i128,
        fee_recipient: Address,
    ) -> Result<Vec<u64>, TradeError> {
        trader.require_auth();
        execute_trade_batch(
            &env,
            &trader,
            &orders,
            &fee_token,
            fee_per_trade,
            &fee_recipient,
        )
    }

    /// Backwards-compatible alias retained for existing integrations.
    pub fn trade_batch(
        env: Env,
        trader: Address,
        orders: Vec<(Symbol, i128, i128, bool)>,
        fee_token: Address,
        fee_per_trade: i128,
        fee_recipient: Address,
    ) -> Result<Vec<u64>, TradeError> {
        trader.require_auth();
        execute_trade_batch(
            &env,
            &trader,
            &orders,
            &fee_token,
            fee_per_trade,
            &fee_recipient,
        )
    }

    pub fn max_batch_size() -> u32 {
        MAX_BATCH_SIZE
    }

    /// Pause the contract (ACL protected)
    pub fn pause(env: Env, admin: Address) -> Result<(), TradeError> {
        admin.require_auth();
        require_initialized(&env)?;
        ACL::require_permission(&env, &admin, &Symbol::new(&env, "pause"));
        env.storage().persistent().set(&storage_keys::PAUSE, &true);
        Ok(())
    }

    /// Unpause the contract (ACL protected)
    pub fn unpause(env: Env, admin: Address) -> Result<(), TradeError> {
        admin.require_auth();
        require_initialized(&env)?;
        ACL::require_permission(&env, &admin, &Symbol::new(&env, "unpause"));
        env.storage().persistent().set(&storage_keys::PAUSE, &false);
        Ok(())
    }

    pub fn create_role(env: Env, admin: Address, role: Symbol) -> Result<(), TradeError> {
        admin.require_auth();
        require_initialized(&env)?;
        ACL::require_permission(&env, &admin, &Symbol::new(&env, "manage_acl"));
        ACL::create_role(&env, &role);
        Ok(())
    }

    pub fn assign_role(
        env: Env,
        admin: Address,
        user: Address,
        role: Symbol,
    ) -> Result<(), TradeError> {
        admin.require_auth();
        require_initialized(&env)?;
        ACL::require_permission(&env, &admin, &Symbol::new(&env, "manage_acl"));
        ACL::assign_role(&env, &user, &role);
        Ok(())
    }

    pub fn assign_permission(
        env: Env,
        admin: Address,
        role: Symbol,
        permission: Symbol,
    ) -> Result<(), TradeError> {
        admin.require_auth();
        require_initialized(&env)?;
        ACL::require_permission(&env, &admin, &Symbol::new(&env, "manage_acl"));
        ACL::assign_permission(&env, &role, &permission);
        Ok(())
    }

    pub fn assign_permissions_batch(
        env: Env,
        admin: Address,
        role: Symbol,
        permissions: Vec<Symbol>,
    ) -> Result<(), TradeError> {
        admin.require_auth();
        require_initialized(&env)?;
        ACL::require_permission(&env, &admin, &Symbol::new(&env, "manage_acl"));
        ACL::assign_permissions_batch(&env, &role, &permissions);
        Ok(())
    }

    pub fn set_role_parent(
        env: Env,
        admin: Address,
        child: Symbol,
        parent: Symbol,
    ) -> Result<(), TradeError> {
        admin.require_auth();
        require_initialized(&env)?;
        ACL::require_permission(&env, &admin, &Symbol::new(&env, "manage_acl"));
        ACL::set_parent_role(&env, &child, &parent);
        Ok(())
    }

    pub fn get_user_roles(env: Env, user: Address) -> Result<Vec<Symbol>, TradeError> {
        require_initialized(&env)?;
        Ok(ACL::get_user_roles(&env, &user))
    }

    pub fn get_role_permissions(env: Env, role: Symbol) -> Result<Vec<Symbol>, TradeError> {
        require_initialized(&env)?;
        Ok(ACL::get_role_permissions(&env, &role))
    }

    pub fn has_permission(env: Env, user: Address, permission: Symbol) -> Result<bool, TradeError> {
        require_initialized(&env)?;
        Ok(ACL::has_permission(&env, &user, &permission))
    }

    /// Propose an upgrade via governance
    pub fn propose_upgrade(
        env: Env,
        admin: Address,
        new_contract_hash: Symbol,
        description: Symbol,
        approvers: Vec<Address>,
        approval_threshold: u32,
        timelock_delay: u64,
    ) -> Result<u64, TradeError> {
        admin.require_auth();
        require_initialized(&env)?;

        let proposal_result = GovernanceManager::propose_upgrade(
            &env,
            admin,
            new_contract_hash,
            env.current_contract_address(),
            description,
            approval_threshold,
            approvers,
            timelock_delay,
        );

        match proposal_result {
            Ok(id) => Ok(id),
            Err(_) => Err(TradeError::Unauthorized),
        }
    }

    /// Approve an upgrade proposal
    pub fn approve_upgrade(
        env: Env,
        proposal_id: u64,
        approver: Address,
    ) -> Result<(), TradeError> {
        approver.require_auth();
        require_initialized(&env)?;

        GovernanceManager::approve_proposal(&env, proposal_id, approver)
            .map_err(|_| TradeError::Unauthorized)
    }

    /// Execute an approved upgrade proposal
    pub fn execute_upgrade(
        env: Env,
        proposal_id: u64,
        executor: Address,
    ) -> Result<(), TradeError> {
        executor.require_auth();
        require_initialized(&env)?;

        GovernanceManager::execute_proposal(&env, proposal_id, executor)
            .map_err(|_| TradeError::Unauthorized)
    }

    /// Get upgrade proposal details
    pub fn get_upgrade_proposal(env: Env, proposal_id: u64) -> Result<UpgradeProposal, TradeError> {
        require_initialized(&env)?;
        GovernanceManager::get_proposal(&env, proposal_id).map_err(|_| TradeError::Unauthorized)
    }

    /// Reject an upgrade proposal
    pub fn reject_upgrade(env: Env, proposal_id: u64, rejector: Address) -> Result<(), TradeError> {
        rejector.require_auth();
        require_initialized(&env)?;

        GovernanceManager::reject_proposal(&env, proposal_id, rejector)
            .map_err(|_| TradeError::Unauthorized)
    }

    /// Cancel an upgrade proposal (admin only)
    pub fn cancel_upgrade(env: Env, proposal_id: u64, admin: Address) -> Result<(), TradeError> {
        admin.require_auth();
        require_initialized(&env)?;

        GovernanceManager::cancel_proposal(&env, proposal_id, admin)
            .map_err(|_| TradeError::Unauthorized)
    }
}

#[cfg(test)]
mod test;

#[cfg(test)]
mod bench;
