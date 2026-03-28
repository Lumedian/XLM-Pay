#![no_std]

use shared::acl::ACL;
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Symbol, token};

#[contract]
pub struct FeeDistributionContract;

#[contracttype]
#[derive(Clone, Debug)]
pub struct FeeSplits {
    pub treasury_bps: u32,
    pub staking_bps: u32,
    pub burn_bps: u32,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct FeeRecipients {
    pub treasury: Address,
    pub staking: Address,
    pub burn: Address,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct FeeStats {
    pub total_treasury: i128,
    pub total_staking: i128,
    pub total_burn: i128,
}

mod storage_keys {
    use soroban_sdk::{symbol_short, Symbol};

    pub const INIT: Symbol = symbol_short!("init");
    pub const SPLITS: Symbol = symbol_short!("splits");
    pub const RECIPIENTS: Symbol = symbol_short!("recips");
}

#[contracttype]
#[derive(Clone, Debug)]
pub enum DataKey {
    Stats(Address), // token address -> stats
}

#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum FeeDistError {
    Unauthorized = 101,
    NotInitialized = 102,
    InvalidSplits = 103,
    InvalidAmount = 104,
}

impl From<FeeDistError> for soroban_sdk::Error {
    fn from(error: FeeDistError) -> Self {
        soroban_sdk::Error::from_contract_error(error as u32)
    }
}

impl From<&FeeDistError> for soroban_sdk::Error {
    fn from(error: &FeeDistError) -> Self {
        soroban_sdk::Error::from_contract_error(*error as u32)
    }
}

impl From<soroban_sdk::Error> for FeeDistError {
    fn from(_error: soroban_sdk::Error) -> Self {
        FeeDistError::Unauthorized
    }
}

const BPS_DENOMINATOR: u32 = 10000;

#[contractimpl]
impl FeeDistributionContract {
    /// Initialize the contract with default splits and recipients
    pub fn init(
        env: Env,
        admin: Address,
        splits: FeeSplits,
        recipients: FeeRecipients,
    ) -> Result<(), FeeDistError> {
        if env.storage().persistent().has(&storage_keys::INIT) {
            return Err(FeeDistError::Unauthorized);
        }

        validate_splits(&splits)?;

        let admin_role = Symbol::new(&env, "admin");
        ACL::create_role(&env, &admin_role);
        ACL::assign_role(&env, &admin, &admin_role);
        ACL::assign_permission(&env, &admin_role, &Symbol::new(&env, "set_splits"));
        ACL::assign_permission(&env, &admin_role, &Symbol::new(&env, "set_recips"));

        env.storage().persistent().set(&storage_keys::INIT, &true);
        env.storage().persistent().set(&storage_keys::SPLITS, &splits);
        env.storage().persistent().set(&storage_keys::RECIPIENTS, &recipients);

        Ok(())
    }

    /// Update fee splits (Governance/Admin protected)
    pub fn set_splits(env: Env, admin: Address, splits: FeeSplits) -> Result<(), FeeDistError> {
        admin.require_auth();
        ACL::require_permission(&env, &admin, &Symbol::new(&env, "set_splits"));
        validate_splits(&splits)?;
        env.storage().persistent().set(&storage_keys::SPLITS, &splits);
        
        // Emit event
        env.events().publish(
            (Symbol::new(&env, "splits_u"),),
            splits
        );
        Ok(())
    }

    /// Update fee recipients (Governance/Admin protected)
    pub fn set_recipients(env: Env, admin: Address, recipients: FeeRecipients) -> Result<(), FeeDistError> {
        admin.require_auth();
        ACL::require_permission(&env, &admin, &Symbol::new(&env, "set_recips"));
        env.storage().persistent().set(&storage_keys::RECIPIENTS, &recipients);
        
        // Emit event
        env.events().publish(
            (Symbol::new(&env, "recips_u"),),
            recipients
        );
        Ok(())
    }

    /// Distribute fees from a payer. The contract must have allowance from the payer.
    pub fn distribute_fees(
        env: Env,
        token: Address,
        payer: Address,
        amount: i128,
    ) -> Result<(), FeeDistError> {
        if amount <= 0 {
            return Err(FeeDistError::InvalidAmount);
        }
        payer.require_auth();

        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&payer, &env.current_contract_address(), &amount);

        _distribute(&env, &token, &payer, amount)
    }

    /// Distribute tokens currently held by this contract
    pub fn distribute_held_fees(
        env: Env,
        token: Address,
    ) -> Result<(), FeeDistError> {
        let token_client = token::Client::new(&env, &token);
        let amount = token_client.balance(&env.current_contract_address());
        
        if amount <= 0 {
            return Ok(());
        }

        _distribute(&env, &token, &env.current_contract_address(), amount)
    }

    pub fn get_splits(env: Env) -> Result<FeeSplits, FeeDistError> {
        env.storage().persistent().get(&storage_keys::SPLITS).ok_or(FeeDistError::NotInitialized)
    }

    pub fn get_recipients(env: Env) -> Result<FeeRecipients, FeeDistError> {
        env.storage().persistent().get(&storage_keys::RECIPIENTS).ok_or(FeeDistError::NotInitialized)
    }

    pub fn get_stats(env: Env, token: Address) -> FeeStats {
        env.storage().persistent().get(&DataKey::Stats(token))
            .unwrap_or(FeeStats { total_treasury: 0, total_staking: 0, total_burn: 0 })
    }
}

fn _distribute(
    env: &Env,
    token: &Address,
    source: &Address,
    amount: i128,
) -> Result<(), FeeDistError> {
    let splits: FeeSplits = env.storage().persistent().get(&storage_keys::SPLITS)
        .ok_or(FeeDistError::NotInitialized)?;
        let recipients: FeeRecipients = env.storage().persistent().get(&storage_keys::RECIPIENTS)
            .ok_or(FeeDistError::NotInitialized)?;

        let treasury_amount = (amount * splits.treasury_bps as i128) / BPS_DENOMINATOR as i128;
        let staking_amount = (amount * splits.staking_bps as i128) / BPS_DENOMINATOR as i128;
        let burn_amount = amount - treasury_amount - staking_amount;

        let token_client = token::Client::new(env, token);
        let contract_address = env.current_contract_address();

        if treasury_amount > 0 {
            token_client.transfer(&contract_address, &recipients.treasury, &treasury_amount);
        }
        if staking_amount > 0 {
            token_client.transfer(&contract_address, &recipients.staking, &staking_amount);
        }
        if burn_amount > 0 {
            token_client.transfer(&contract_address, &recipients.burn, &burn_amount);
        }

        // Update stats
        let mut stats: FeeStats = env.storage().persistent().get(&DataKey::Stats(token.clone()))
            .unwrap_or(FeeStats { total_treasury: 0, total_staking: 0, total_burn: 0 });
        
        stats.total_treasury += treasury_amount;
        stats.total_staking += staking_amount;
        stats.total_burn += burn_amount;

        env.storage().persistent().set(&DataKey::Stats(token.clone()), &stats);

        // Emit event
        env.events().publish(
            (Symbol::new(env, "fee_dist"), token.clone(), source.clone()),
            (treasury_amount, staking_amount, burn_amount)
        );

        Ok(())
}

#[cfg(test)]
mod test;

fn validate_splits(splits: &FeeSplits) -> Result<(), FeeDistError> {
    if splits.treasury_bps + splits.staking_bps + splits.burn_bps != BPS_DENOMINATOR {
        return Err(FeeDistError::InvalidSplits);
    }
    Ok(())
}
