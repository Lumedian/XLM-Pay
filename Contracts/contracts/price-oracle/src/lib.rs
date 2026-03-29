#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, Symbol, Vec, Map,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    AssetNotFound = 4,
    NoValidOracle = 5,
    PriceDeviationTooHigh = 6,
    StalePrice = 7,
    InvalidConfig = 8,
    InsufficientOracles = 9,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum OracleType {
    Chainlink = 0,
    Stellar = 1,
    Custom = 2,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct PriceData {
    pub price: i128,
    pub timestamp: u64,
    pub provider: Address,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct AssetConfig {
    pub oracles: Vec<Address>,      // Authorized oracle addresses
    pub max_deviation_bps: u32,     // Deviation from previous consensus price
    pub stale_threshold: u64,       // Max time since update (seconds)
    pub min_oracles: u32,           // Minimum oracles needed for consensus
    pub twap_window: u64,           // Window for TWAP (seconds)
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct HistoricalPrice {
    pub price: i128,
    pub timestamp: u64,
}

mod keys {
    use soroban_sdk::{symbol_short, Symbol};
    pub const ADMIN: Symbol = symbol_short!("admin");
    pub const CONFIG: Symbol = symbol_short!("config"); // Map<Symbol, AssetConfig>
    pub const LATEST_PRICES: Symbol = symbol_short!("l_prices"); // Map<(Symbol, Address), PriceData>
    pub const CONSENSUS_PRICES: Symbol = symbol_short!("c_prices"); // Map<Symbol, PriceData>
    pub const HISTORY: Symbol = symbol_short!("history"); // Map<Symbol, Vec<HistoricalPrice>>
}

/// Simple interface for external oracles (like Chainlink)
pub trait ExternalOracle {
    fn get_latest_price(env: Env) -> i128;
}

#[contract]
pub struct PriceOracleContract;

#[contractimpl]
impl PriceOracleContract {
    /// Initialize the Oracle Manager
    pub fn initialize(env: Env, admin: Address) -> Result<(), Error> {
        if env.storage().instance().has(&keys::ADMIN) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&keys::ADMIN, &admin);
        
        // Initialize storage maps
        if !env.storage().persistent().has(&keys::CONFIG) {
            env.storage().persistent().set(&keys::CONFIG, &Map::<Symbol, AssetConfig>::new(&env));
        }
        if !env.storage().persistent().has(&keys::LATEST_PRICES) {
            env.storage().persistent().set(&keys::LATEST_PRICES, &Map::<(Symbol, Address), PriceData>::new(&env));
        }
        if !env.storage().persistent().has(&keys::CONSENSUS_PRICES) {
            env.storage().persistent().set(&keys::CONSENSUS_PRICES, &Map::<Symbol, PriceData>::new(&env));
        }
        if !env.storage().persistent().has(&keys::HISTORY) {
            env.storage().persistent().set(&keys::HISTORY, &Map::<Symbol, Vec<HistoricalPrice>>::new(&env));
        }

        Ok(())
    }

    /// Configure oracles for an asset
    pub fn set_asset_config(
        env: Env,
        admin: Address,
        asset: Symbol,
        config: AssetConfig,
    ) -> Result<(), Error> {
        admin.require_auth();
        Self::require_admin(&env, &admin)?;

        if config.oracles.is_empty() {
            return Err(Error::InvalidConfig);
        }

        let mut configs: Map<Symbol, AssetConfig> = env.storage().persistent().get(&keys::CONFIG).unwrap();
        configs.set(asset, config);
        env.storage().persistent().set(&keys::CONFIG, &configs);

        Ok(())
    }

    /// Update price from an oracle (called by oracle provider)
    pub fn update_price(
        env: Env,
        oracle: Address,
        asset: Symbol,
        price: i128,
    ) -> Result<(), Error> {
        oracle.require_auth();

        let configs: Map<Symbol, AssetConfig> = env.storage().persistent().get(&keys::CONFIG).ok_or(Error::NotInitialized)?;
        let config = configs.get(asset.clone()).ok_or(Error::AssetNotFound)?;

        // Verify oracle is authorized
        if !config.oracles.contains(&oracle) {
            return Err(Error::Unauthorized);
        }

        let timestamp = env.ledger().timestamp();
        let price_data = PriceData {
            price,
            timestamp,
            provider: oracle.clone(),
        };

        // Store latest price for this provider
        let mut latest_prices: Map<(Symbol, Address), PriceData> = env.storage().persistent().get(&keys::LATEST_PRICES).unwrap();
        latest_prices.set((asset.clone(), oracle), price_data);
        env.storage().persistent().set(&keys::LATEST_PRICES, &latest_prices);

        // Try to update consensus price
        Self::recalculate_consensus(&env, &asset, &config)?;

        Ok(())
    }

    /// Recalculate consensus price for an asset based on multiple oracles
    fn recalculate_consensus(env: &Env, asset: &Symbol, config: &AssetConfig) -> Result<(), Error> {
        let latest_prices: Map<(Symbol, Address), PriceData> = env.storage().persistent().get(&keys::LATEST_PRICES).unwrap();
        let mut valid_prices = Vec::new(env);
        let now = env.ledger().timestamp();

        for oracle in config.oracles.iter() {
            if let Some(price_data) = latest_prices.get((asset.clone(), oracle)) {
                // Check if price is not stale
                if now <= price_data.timestamp + config.stale_threshold {
                    valid_prices.push_back(price_data.price);
                }
            }
        }

        if valid_prices.len() < config.min_oracles {
            return Ok(()); // Not enough oracles for consensus yet, but not an error
        }

        // Calculate median
        valid_prices.sort();
        let consensus_price = if valid_prices.len() % 2 == 1 {
            valid_prices.get(valid_prices.len() / 2).unwrap()
        } else {
            let p1 = valid_prices.get(valid_prices.len() / 2 - 1).unwrap();
            let p2 = valid_prices.get(valid_prices.len() / 2).unwrap();
            (p1 + p2) / 2
        };

        // Circuit Breaker: check deviation from previous consensus
        let mut consensus_prices: Map<Symbol, PriceData> = env.storage().persistent().get(&keys::CONSENSUS_PRICES).unwrap();
        if let Some(prev_consensus) = consensus_prices.get(asset.clone()) {
            let diff = if consensus_price > prev_consensus.price { consensus_price - prev_consensus.price } else { prev_consensus.price - consensus_price };
            let deviation_bps = (diff * 10000) / prev_consensus.price;
            if deviation_bps > config.max_deviation_bps as i128 {
                // Potential flash crash or oracle manipulation - reject update
                return Err(Error::PriceDeviationTooHigh);
            }
        }

        consensus_prices.set(asset.clone(), PriceData {
            price: consensus_price,
            timestamp: now,
            provider: env.current_contract_address(), // Indicating consensus
        });
        env.storage().persistent().set(&keys::CONSENSUS_PRICES, &consensus_prices);

        // Update history
        let mut history_map: Map<Symbol, Vec<HistoricalPrice>> = env.storage().persistent().get(&keys::HISTORY).unwrap();
        let mut history = history_map.get(asset.clone()).unwrap_or(Vec::new(env));
        history.push_back(HistoricalPrice { price: consensus_price, timestamp: now });
        
        // Keep history window manageable
        if history.len() > 1000 {
            history.remove(0);
        }
        history_map.set(asset.clone(), history);
        env.storage().persistent().set(&keys::HISTORY, &history_map);

        Ok(())
    }

    /// Get current consensus price
    pub fn get_price(env: Env, asset: Symbol) -> Result<i128, Error> {
        let consensus_prices: Map<Symbol, PriceData> = env.storage().persistent().get(&keys::CONSENSUS_PRICES).ok_or(Error::NotInitialized)?;
        let price_data = consensus_prices.get(asset.clone()).ok_or(Error::NoValidOracle)?;

        let configs: Map<Symbol, AssetConfig> = env.storage().persistent().get(&keys::CONFIG).ok_or(Error::NotInitialized)?;
        let config = configs.get(asset).ok_or(Error::AssetNotFound)?;

        // Final staleness check on consensus price
        let now = env.ledger().timestamp();
        if now > price_data.timestamp + config.stale_threshold {
            return Err(Error::StalePrice);
        }

        Ok(price_data.price)
    }

    /// Get Time-Weighted Average Price
    pub fn get_twap(env: Env, asset: Symbol, window: u64) -> Result<i128, Error> {
        let history_map: Map<Symbol, Vec<HistoricalPrice>> = env.storage().persistent().get(&keys::HISTORY).ok_or(Error::NotInitialized)?;
        let history = history_map.get(asset).ok_or(Error::AssetNotFound)?;

        if history.is_empty() {
            return Err(Error::NoValidOracle);
        }

        let now = env.ledger().timestamp();
        let start_time = now.saturating_sub(window);
        
        let mut total_price_time: i128 = 0;
        let mut total_time: u64 = 0;
        
        let mut prev_time = start_time;
        let mut prev_price = history.get(0).unwrap().price;

        for entry in history.iter() {
            if entry.timestamp <= start_time {
                prev_price = entry.price;
                continue;
            }
            
            let duration = entry.timestamp - prev_time;
            total_price_time += prev_price * (duration as i128);
            total_time += duration;
            
            prev_time = entry.timestamp;
            prev_price = entry.price;
        }
        
        if now > prev_time {
            let duration = now - prev_time;
            total_price_time += prev_price * (duration as i128);
            total_time += duration;
        }

        if total_time == 0 {
            return Ok(prev_price);
        }

        Ok(total_price_time / (total_time as i128))
    }

    /// Historical price query
    pub fn get_historical_price(env: Env, asset: Symbol, timestamp: u64) -> Result<i128, Error> {
        let history_map: Map<Symbol, Vec<HistoricalPrice>> = env.storage().persistent().get(&keys::HISTORY).ok_or(Error::NotInitialized)?;
        let history = history_map.get(asset).ok_or(Error::AssetNotFound)?;

        let mut last_price = 0;
        for entry in history.iter() {
            if entry.timestamp > timestamp {
                break;
            }
            last_price = entry.price;
        }

        if last_price == 0 {
            return Err(Error::NoValidOracle);
        }

        Ok(last_price)
    }

    fn require_admin(env: &Env, caller: &Address) -> Result<(), Error> {
        let admin: Address = env.storage().instance().get(&keys::ADMIN).ok_or(Error::NotInitialized)?;
        if admin != *caller {
            return Err(Error::Unauthorized);
        }
        Ok(())
    }
}
