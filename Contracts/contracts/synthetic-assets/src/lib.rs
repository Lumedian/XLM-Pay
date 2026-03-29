#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, Symbol,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    InvalidAmount = 4,
    InsufficientCollateral = 5,
    BelowMinCratio = 6,
    CDPNotFound = 7,
    NotLiquidatable = 8,
    AssetNotFound = 9,
    OracleNotSet = 10,
}

#[contracttype]
#[derive(Clone)]
pub struct CDP {
    pub owner: Address,
    pub collateral_amount: i128, // in base units
    pub minted_amount: i128,     // synthetic tokens minted
    pub collateral_ratio: i128,  // scaled by 10000 (15000 = 150%)
    pub is_active: bool,
}

#[contracttype]
#[derive(Clone)]
pub struct SyntheticConfig {
    pub min_cratio: i128,          // scaled by 10000 (15000 = 150%)
    pub liq_cratio: i128,          // scaled by 10000 (12000 = 120%)
    pub liq_penalty: i128,         // scaled by 10000 (1300 = 13%)
    pub stability_fee_bps: i32,    // annual fee in bps (200 = 2%)
    pub oracle_price: i128,     // price scaled by 1_000_000
    pub min_cratio: i128,       // scaled by 10000 (15000 = 150%)
    pub liq_cratio: i128,       // scaled by 10000 (12000 = 120%)
    pub liq_penalty: i128,      // scaled by 10000 (1300 = 13%)
    pub stability_fee_bps: i32, // annual fee in bps (200 = 2%)
    pub total_minted: i128,
    pub is_active: bool,
}

mod keys {
    use soroban_sdk::{symbol_short, Symbol};
    pub const ADMIN: Symbol = symbol_short!("admin");
    pub const CONFIG: Symbol = symbol_short!("config");
    pub const ORACLE: Symbol = symbol_short!("oracle");
}

/// Interface for the Price Oracle contract
pub mod oracle {
    use soroban_sdk::{Address, Env, Symbol};
    #[soroban_sdk::contractclient(name = "PriceOracleClient")]
    pub trait PriceOracle {
        fn get_price(env: Env, asset: Symbol) -> i128;
        fn get_twap(env: Env, asset: Symbol, window: u64) -> i128;
    }
}

#[contract]
pub struct SyntheticAssetsContract;

#[contractimpl]
impl SyntheticAssetsContract {
    pub fn initialize(env: Env, admin: Address) -> Result<(), Error> {
        if env.storage().instance().has(&keys::ADMIN) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&keys::ADMIN, &admin);
        Ok(())
    }

    pub fn set_oracle(env: Env, caller: Address, oracle: Address) -> Result<(), Error> {
        caller.require_auth();
        Self::require_admin(&env, &caller)?;
        env.storage().instance().set(&keys::ORACLE, &oracle);
        Ok(())
    }

    /// Register a synthetic asset with initial config
    pub fn register_asset(
        env: Env,
        caller: Address,
        asset_symbol: Symbol,
        min_cratio: i128,
        liq_cratio: i128,
        liq_penalty: i128,
        stability_fee_bps: i32,
    ) -> Result<(), Error> {
        caller.require_auth();
        Self::require_admin(&env, &caller)?;

        let config = SyntheticConfig {
            min_cratio,
            liq_cratio,
            liq_penalty,
            stability_fee_bps,
            total_minted: 0,
            is_active: true,
        };
        env.storage().persistent().set(&asset_symbol, &config);
        Ok(())
    }

    /// Open CDP: deposit collateral
    pub fn open_cdp(
        env: Env,
        owner: Address,
        asset_symbol: Symbol,
        collateral_amount: i128,
    ) -> Result<(), Error> {
        owner.require_auth();

        if collateral_amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let cdp_key = Self::cdp_key(&owner, &asset_symbol);
        let cdp = CDP {
            owner: owner.clone(),
            collateral_amount,
            minted_amount: 0,
            collateral_ratio: 0,
            is_active: true,
        };
        env.storage().persistent().set(&cdp_key, &cdp);
        Ok(())
    }

    /// Mint synthetic tokens against collateral
    pub fn mint(
        env: Env,
        owner: Address,
        asset_symbol: Symbol,
        mint_amount: i128,
    ) -> Result<i128, Error> {
        owner.require_auth();

        if mint_amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let config: SyntheticConfig = env
            .storage()
            .persistent()
            .get(&asset_symbol)
            .ok_or(Error::AssetNotFound)?;

        let cdp_key = Self::cdp_key(&owner, &asset_symbol);
        let mut cdp: CDP = env
            .storage()
            .persistent()
            .get(&cdp_key)
            .ok_or(Error::CDPNotFound)?;

        // Fetch current price from Oracle
        let oracle_price = self.get_oracle_price(&env, &asset_symbol)?;

        // collateral_ratio = (collateral_amount * 1e6 / oracle_price) / (minted+mint) * 10000
        let new_minted = cdp.minted_amount + mint_amount;
        let collateral_usd = cdp.collateral_amount * 1_000_000 / oracle_price;
        let cratio = collateral_usd * 10000 / new_minted;

        if cratio < config.min_cratio {
            return Err(Error::BelowMinCratio);
        }

        cdp.minted_amount = new_minted;
        cdp.collateral_ratio = cratio;

        let mut updated_config = config.clone();
        updated_config.total_minted += mint_amount;

        env.storage().persistent().set(&cdp_key, &cdp);
        env.storage()
            .persistent()
            .set(&asset_symbol, &updated_config);

        Ok(new_minted)
    }


    /// Liquidate a CDP that has fallen below liq_cratio
    pub fn liquidate(

    /// Burn synthetic tokens to reduce debt
    pub fn burn(
        env: Env,
        owner: Address,
        asset_symbol: Symbol,
        burn_amount: i128,
    ) -> Result<(), Error> {
        owner.require_auth();

        if burn_amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let config: SyntheticConfig = env
            .storage()
            .persistent()
            .get(&asset_symbol)
            .ok_or(Error::AssetNotFound)?;

        let cdp_key = Self::cdp_key(&owner, &asset_symbol);
        let mut cdp: CDP = env
            .storage()
            .persistent()
            .get(&cdp_key)
            .ok_or(Error::CDPNotFound)?;

        if burn_amount > cdp.minted_amount {
            return Err(Error::InvalidAmount);
        }

        cdp.minted_amount -= burn_amount;

        // Recalculate cratio
        if cdp.minted_amount > 0 {
            let collateral_usd = cdp.collateral_amount * 1_000_000 / config.oracle_price;
            cdp.collateral_ratio = collateral_usd * 10000 / cdp.minted_amount;
        } else {
            cdp.collateral_ratio = i128::MAX;
        }

        let mut updated_config = config;
        updated_config.total_minted -= burn_amount;

        env.storage().persistent().set(&cdp_key, &cdp);
        env.storage()
            .persistent()
            .set(&asset_symbol, &updated_config);
        Ok(())
    }

    /// Add more collateral to improve health
    pub fn add_collateral(
        env: Env,
        liquidator: Address,
        owner: Address,
        asset_symbol: Symbol,
    ) -> Result<(), Error> {
        liquidator.require_auth();

        let config: SyntheticConfig = env
            .storage()
            .persistent()
            .get(&asset_symbol)
            .ok_or(Error::AssetNotFound)?;

        let cdp_key = Self::cdp_key(&owner, &asset_symbol);
        let mut cdp: CDP = env
            .storage()
            .persistent()
            .get(&cdp_key)
            .ok_or(Error::CDPNotFound)?;

        // Fetch TWAP for liquidation to prevent front-running flash crashes
        let twap_window = 3600; // 1 hour TWAP for liquidations
        let price = self.get_oracle_twap(&env, &asset_symbol, twap_window)?;

        let collateral_usd = cdp.collateral_amount * 1_000_000 / price;
        let current_cratio = collateral_usd * 10000 / cdp.minted_amount;

        if current_cratio >= config.liq_cratio {
            return Err(Error::NotLiquidatable);
        }


        // Liquidation logic: liquidator pays debt, gets collateral + bonus
        // For simplicity, we just mark CDP as inactive in this mock
        // Seize collateral with penalty: seized = debt_usd * (1 + penalty) / collateral_price
        let penalty_collateral = cdp.collateral_amount * config.liq_penalty / 10000;
        let seized = cdp
            .collateral_amount
            .min(cdp.collateral_amount - penalty_collateral);

        let mut updated_config = config;
        updated_config.total_minted -= cdp.minted_amount;


        cdp.is_active = false;
        env.storage().persistent().set(&cdp_key, &cdp);

        env.storage()
            .persistent()
            .set(&asset_symbol, &updated_config);

        Ok(seized)
    }

    /// Close a CDP with zero debt
    pub fn close_cdp(env: Env, owner: Address, asset_symbol: Symbol) -> Result<i128, Error> {
        owner.require_auth();

        let cdp_key = Self::cdp_key(&owner, &asset_symbol);
        let mut cdp: CDP = env
            .storage()
            .persistent()
            .get(&cdp_key)
            .ok_or(Error::CDPNotFound)?;

        if cdp.minted_amount > 0 {
            return Err(Error::InsufficientCollateral);
        }


        Ok(())
    }

    fn get_oracle_price(&self, env: &Env, asset: &Symbol) -> Result<i128, Error> {
        let oracle_addr: Address = env.storage().instance().get(&keys::ORACLE).ok_or(Error::OracleNotSet)?;
        let oracle_client = oracle::PriceOracleClient::new(env, &oracle_addr);
        Ok(oracle_client.get_price(asset))
    }

    fn get_oracle_twap(&self, env: &Env, asset: &Symbol, window: u64) -> Result<i128, Error> {
        let oracle_addr: Address = env.storage().instance().get(&keys::ORACLE).ok_or(Error::OracleNotSet)?;
        let oracle_client = oracle::PriceOracleClient::new(env, &oracle_addr);
        Ok(oracle_client.get_twap(asset, &window))
    }

    fn require_admin(env: &Env, caller: &Address) -> Result<(), Error> {
        let admin: Address = env.storage().instance().get(&keys::ADMIN).ok_or(Error::NotInitialized)?;
        if admin != *caller {
            return Err(Error::Unauthorized);
        }
        Ok(())
    }

    fn cdp_key(owner: &Address, asset: &Symbol) -> (Symbol, Address, Symbol) {
        (symbol_short!("cdp"), owner.clone(), asset.clone())
    }
}
