#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Symbol, symbol_short, IntoVal};
use shared::state_verification::{verify_with_contract, trust_add, is_trusted};
use shared::fees::{FeeManager, FeeError};
use shared::governance::{
    GovernanceManager, GovernanceRole, UpgradeProposal,
};
use shared::events::{
    EventEmitter, TradeExecutedEvent, ContractPausedEvent, ContractUnpausedEvent, FeeCollectedEvent,
};

/// Version of this contract implementation
const CONTRACT_VERSION: u32 = 1;

/// Trading contract with upgradeability and governance
#[contract]
pub struct UpgradeableTradingContract;

/// Trade record for tracking
#[contracttype]
#[derive(Clone, Debug)]
pub struct Trade {
    pub id: u64,
    pub trader: Address,
    pub pair: Symbol,
    pub amount: i128,
    pub price: i128,
    pub timestamp: u64,
    pub is_buy: bool,
}

/// Trading statistics
#[contracttype]
#[derive(Clone, Debug)]
pub struct TradeStats {
    pub total_trades: u64,
    pub total_volume: i128,
    pub last_trade_id: u64,
}

#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum TradeError {
    Unauthorized = 3001,
    InvalidAmount = 3002,
    ContractPaused = 3003,
    NotInitialized = 3004,
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

#[contractimpl]
impl UpgradeableTradingContract {
    /// Initialize the contract with admin and initial approvers
    pub fn init(
        env: Env,
        admin: Address,
        approvers: soroban_sdk::Vec<Address>,
        executor: Address,
    ) -> Result<(), TradeError> {
        // Check if already initialized
        let init_key = symbol_short!("init");
        if env.storage().persistent().has(&init_key) {
            return Err(TradeError::Unauthorized);
        }

        // Set initialization flag
        env.storage().persistent().set(&init_key, &true);

        // Store roles
        let roles_key = symbol_short!("roles");
        let mut roles = soroban_sdk::Map::new(&env);

        // Set admin role
        roles.set(admin, GovernanceRole::Admin);

        // Set approvers
        for approver in approvers.iter() {
            roles.set(approver, GovernanceRole::Approver);
        }

        // Set executor
        roles.set(executor, GovernanceRole::Executor);

        env.storage().persistent().set(&roles_key, &roles);

        // Initialize stats
        let stats = TradeStats {
            total_trades: 0,
            total_volume: 0,
            last_trade_id: 0,
        };
        let stats_key = symbol_short!("stats");
        env.storage().persistent().set(&stats_key, &stats);

        // Store contract version
        let version_key = symbol_short!("ver");
        env.storage().persistent().set(&version_key, &CONTRACT_VERSION);

        Ok(())
    }

    pub fn trust_contract(env: Env, contract: Address) {
        trust_add(&env, &contract);
    }

    pub fn verify_external_balance(env: Env, token: Address, holder: Address, expected: i128) -> bool {
        if !is_trusted(&env, &token) {
            return false;
        }
        let key = Symbol::new(&env, "balance");
        let subject = (holder, expected).into_val(&env);
        verify_with_contract(&env, &token, &key, &subject)
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
    ) -> Result<u64, FeeError> {
        trader.require_auth();

        // Verify not paused
        let paused_key = symbol_short!("pause");
        let is_paused: bool = env
            .storage()
            .persistent()
            .get(&paused_key)
            .unwrap_or(false);

        if is_paused {
            panic!("PAUSED");
        }

        // Collect fee first
        FeeManager::collect_fee(&env, &fee_token, &trader, &fee_recipient, fee_amount)?;

        // Emit fee collected event
        if fee_amount > 0 {
            EventEmitter::fee_collected(&env, FeeCollectedEvent {
                payer: trader.clone(),
                recipient: fee_recipient,
                amount: fee_amount,
                token: fee_token.clone(),
                timestamp: env.ledger().timestamp(),
            });
        }

        // Create trade record
        let stats_key = symbol_short!("stats");
        let mut stats: TradeStats = env
            .storage()
            .persistent()
            .get(&stats_key)
            .unwrap_or(TradeStats {
                total_trades: 0,
                total_volume: 0,
                last_trade_id: 0,
            });

        let trade_id = stats.last_trade_id + 1;
        let timestamp = env.ledger().timestamp();
        let trade = Trade {
            id: trade_id,
            trader: trader.clone(),
            pair: pair.clone(),
            amount,
            price,
            timestamp,
            is_buy,
        };

        // Update stats
        stats.total_trades += 1;
        stats.total_volume += amount;
        stats.last_trade_id = trade_id;

        // Store trade
        let trades_key = symbol_short!("trades");
        let mut trades: soroban_sdk::Vec<Trade> = env
            .storage()
            .persistent()
            .get(&trades_key)
            .unwrap_or_else(|| soroban_sdk::Vec::new(&env));

        trades.push_back(trade);

        // Update persistent storage
        env.storage().persistent().set(&trades_key, &trades);
        env.storage().persistent().set(&stats_key, &stats);

        // Emit trade executed event
        EventEmitter::trade_executed(&env, TradeExecutedEvent {
            trade_id,
            trader,
            pair,
            amount,
            price,
            is_buy,
            fee_amount,
            fee_token,
            timestamp,
        });

        Ok(trade_id)
    }

    /// Get current contract version
    pub fn get_version(env: Env) -> u32 {
        let version_key = symbol_short!("ver");
        env.storage()
            .persistent()
            .get(&version_key)
            .unwrap_or(0)
    }

    /// Get trading statistics
    pub fn get_stats(env: Env) -> TradeStats {
        let stats_key = symbol_short!("stats");
        env.storage()
            .persistent()
            .get(&stats_key)
            .unwrap_or(TradeStats {
                total_trades: 0,
                total_volume: 0,
                last_trade_id: 0,
            })
    }

    /// Pause the contract (admin only)
    pub fn pause(env: Env, admin: Address) -> Result<(), TradeError> {
        admin.require_auth();

        // Verify admin role
        let roles_key = symbol_short!("roles");
        let roles: soroban_sdk::Map<Address, GovernanceRole> = env
            .storage()
            .persistent()
            .get(&roles_key)
            .ok_or(TradeError::Unauthorized)?;

        let role = roles
            .get(admin.clone())
            .ok_or(TradeError::Unauthorized)?;

        if role != GovernanceRole::Admin {
            return Err(TradeError::Unauthorized);
        }

        let paused_key = symbol_short!("pause");
        env.storage().persistent().set(&paused_key, &true);

        // Emit contract paused event
        EventEmitter::contract_paused(&env, ContractPausedEvent {
            paused_by: admin,
            timestamp: env.ledger().timestamp(),
        });

        Ok(())
    }

    /// Unpause the contract (admin only)
    pub fn unpause(env: Env, admin: Address) -> Result<(), TradeError> {
        admin.require_auth();

        let roles_key = symbol_short!("roles");
        let roles: soroban_sdk::Map<Address, GovernanceRole> = env
            .storage()
            .persistent()
            .get(&roles_key)
            .ok_or(TradeError::Unauthorized)?;

        let role = roles
            .get(admin.clone())
            .ok_or(TradeError::Unauthorized)?;

        if role != GovernanceRole::Admin {
            return Err(TradeError::Unauthorized);
        }

        let paused_key = symbol_short!("pause");
        env.storage().persistent().set(&paused_key, &false);

        // Emit contract unpaused event
        EventEmitter::contract_unpaused(&env, ContractUnpausedEvent {
            unpaused_by: admin,
            timestamp: env.ledger().timestamp(),
        });

        Ok(())
    }

    /// Propose an upgrade via governance
    pub fn propose_upgrade(
        env: Env,
        admin: Address,
        new_contract_hash: Symbol,
        description: Symbol,
        approvers: soroban_sdk::Vec<Address>,
        approval_threshold: u32,
        timelock_delay: u64,
    ) -> Result<u64, TradeError> {
        admin.require_auth();

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

        GovernanceManager::execute_proposal(&env, proposal_id, executor)
            .map_err(|_| TradeError::Unauthorized)
    }

    /// Get upgrade proposal details
    pub fn get_upgrade_proposal(env: Env, proposal_id: u64) -> Result<UpgradeProposal, TradeError> {
        GovernanceManager::get_proposal(&env, proposal_id)
            .map_err(|_| TradeError::Unauthorized)
    }

    /// Reject an upgrade proposal
    pub fn reject_upgrade(
        env: Env,
        proposal_id: u64,
        rejector: Address,
    ) -> Result<(), TradeError> {
        rejector.require_auth();

        GovernanceManager::reject_proposal(&env, proposal_id, rejector)
            .map_err(|_| TradeError::Unauthorized)
    }

    /// Cancel an upgrade proposal (admin only)
    pub fn cancel_upgrade(
        env: Env,
        proposal_id: u64,
        admin: Address,
    ) -> Result<(), TradeError> {
        admin.require_auth();

        GovernanceManager::cancel_proposal(&env, proposal_id, admin)
            .map_err(|_| TradeError::Unauthorized)
    }
}

#[cfg(test)]
mod test;
