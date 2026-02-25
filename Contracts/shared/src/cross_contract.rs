//! Cross-Contract Communication Patterns
//!
//! This module provides standardized patterns for secure and efficient
//! cross-contract communication in the Stellara ecosystem.
//!
//! # Security Principles
//! - Always validate caller authorization
//! - Use reentrancy guards for state-changing operations
//! - Emit events for all cross-contract interactions
//! - Handle errors gracefully and propagate them correctly
//! - Validate all input parameters before making calls

use soroban_sdk::{contracttype, Address, Env, IntoVal, Symbol, Val, Vec};

use crate::safe_call::{safe_invoke, safe_invoke_typed, CallResult};

// =============================================================================
// Cross-Contract Call Patterns
// =============================================================================

/// Standard interface for contracts that can receive callbacks
pub trait CallbackReceiver {
    /// Called when a cross-contract operation completes successfully
    fn on_success(env: Env, caller: Address, data: Val) -> Result<(), u32>;

    /// Called when a cross-contract operation fails
    fn on_failure(env: Env, caller: Address, error_code: u32) -> Result<(), u32>;
}

/// Event emitted when a cross-contract call is initiated
#[contracttype]
#[derive(Clone, Debug)]
pub struct CrossContractCallInitiatedEvent {
    pub caller: Address,
    pub target: Address,
    pub function: Symbol,
    pub timestamp: u64,
}

/// Event emitted when a cross-contract call succeeds
#[contracttype]
#[derive(Clone, Debug)]
pub struct CrossContractCallSuccessEvent {
    pub caller: Address,
    pub target: Address,
    pub function: Symbol,
    pub timestamp: u64,
}

// =============================================================================
// Token Transfer Pattern
// =============================================================================

/// Safely transfers tokens from one address to another via token contract
///
/// # Arguments
/// * `env` - The environment
/// * `token_contract` - Address of the token contract
/// * `from` - Address to transfer from
/// * `to` - Address to transfer to
/// * `amount` - Amount to transfer
///
/// # Returns
/// * `CallResult<()>` - Success or error code
pub fn transfer_token(
    env: &Env,
    token_contract: &Address,
    from: &Address,
    to: &Address,
    amount: i128,
) -> CallResult<()> {
    // Validate inputs
    if amount <= 0 {
        return Err(3001); // INVALID_AMOUNT
    }

    // Emit initiation event
    emit_call_initiated(env, token_contract, &Symbol::new(env, "transfer"));

    // Prepare arguments
    let mut args = Vec::new(env);
    args.push_back(from.clone().into_val(env));
    args.push_back(to.clone().into_val(env));
    args.push_back(amount.into_val(env));

    // Make the call
    safe_invoke(env, token_contract, &Symbol::new(env, "transfer"), args)?;

    // Emit success event
    emit_call_success(env, token_contract, &Symbol::new(env, "transfer"));

    Ok(())
}

/// Safely transfers tokens using allowance mechanism
///
/// # Arguments
/// * `env` - The environment
/// * `token_contract` - Address of the token contract
/// * `spender` - Address spending the allowance
/// * `from` - Address to transfer from
/// * `to` - Address to transfer to
/// * `amount` - Amount to transfer
pub fn transfer_token_from(
    env: &Env,
    token_contract: &Address,
    spender: &Address,
    from: &Address,
    to: &Address,
    amount: i128,
) -> CallResult<()> {
    if amount <= 0 {
        return Err(3001); // INVALID_AMOUNT
    }

    emit_call_initiated(env, token_contract, &Symbol::new(env, "transfer_from"));

    let mut args = Vec::new(env);
    args.push_back(spender.clone().into_val(env));
    args.push_back(from.clone().into_val(env));
    args.push_back(to.clone().into_val(env));
    args.push_back(amount.into_val(env));

    safe_invoke(
        env,
        token_contract,
        &Symbol::new(env, "transfer_from"),
        args,
    )?;

    emit_call_success(env, token_contract, &Symbol::new(env, "transfer_from"));

    Ok(())
}

/// Gets token balance for an address
///
/// # Arguments
/// * `env` - The environment
/// * `token_contract` - Address of the token contract
/// * `address` - Address to check balance for
///
/// # Returns
/// * `CallResult<i128>` - Balance or error code
pub fn get_token_balance(
    env: &Env,
    token_contract: &Address,
    address: &Address,
) -> CallResult<i128> {
    let mut args = Vec::new(env);
    args.push_back(address.clone().into_val(env));

    safe_invoke_typed::<i128>(env, token_contract, &Symbol::new(env, "balance"), args)
}

// =============================================================================
// Governance Interaction Pattern
// =============================================================================

/// Submits a proposal to a governance contract
///
/// # Arguments
/// * `env` - The environment
/// * `governance_contract` - Address of the governance contract
/// * `proposer` - Address submitting the proposal
/// * `target` - Target contract for the proposal
/// * `description` - Proposal description
pub fn submit_governance_proposal(
    env: &Env,
    governance_contract: &Address,
    proposer: &Address,
    target: &Address,
    description: Symbol,
) -> CallResult<u64> {
    emit_call_initiated(
        env,
        governance_contract,
        &Symbol::new(env, "create_proposal"),
    );

    let mut args = Vec::new(env);
    args.push_back(proposer.clone().into_val(env));
    args.push_back(target.clone().into_val(env));
    args.push_back(description.into_val(env));

    let proposal_id = safe_invoke_typed::<u64>(
        env,
        governance_contract,
        &Symbol::new(env, "create_proposal"),
        args,
    )?;

    emit_call_success(
        env,
        governance_contract,
        &Symbol::new(env, "create_proposal"),
    );

    Ok(proposal_id)
}

/// Votes on a governance proposal
///
/// # Arguments
/// * `env` - The environment
/// * `governance_contract` - Address of the governance contract
/// * `voter` - Address voting
/// * `proposal_id` - ID of the proposal
/// * `approve` - Whether to approve (true) or reject (false)
pub fn vote_on_proposal(
    env: &Env,
    governance_contract: &Address,
    voter: &Address,
    proposal_id: u64,
    approve: bool,
) -> CallResult<()> {
    let func_name = if approve {
        "approve_proposal"
    } else {
        "reject_proposal"
    };
    let func = Symbol::new(env, func_name);

    emit_call_initiated(env, governance_contract, &func);

    let mut args = Vec::new(env);
    args.push_back(voter.clone().into_val(env));
    args.push_back(proposal_id.into_val(env));

    safe_invoke(env, governance_contract, &func, args)?;

    emit_call_success(env, governance_contract, &func);

    Ok(())
}

// =============================================================================
// Fee Collection Pattern
// =============================================================================

/// Collects fees and transfers them to a fee recipient
///
/// # Arguments
/// * `env` - The environment
/// * `token_contract` - Address of the token contract for fee payment
/// * `payer` - Address paying the fee
/// * `recipient` - Address receiving the fee
/// * `amount` - Fee amount
///
/// # Security Note
/// This function should be called with proper authorization checks
pub fn collect_fee(
    env: &Env,
    token_contract: &Address,
    payer: &Address,
    recipient: &Address,
    amount: i128,
) -> CallResult<()> {
    if amount <= 0 {
        return Ok(()); // No fee to collect
    }

    // Transfer fee from payer to recipient
    transfer_token(env, token_contract, payer, recipient, amount)?;

    // Emit fee collection event
    env.events().publish(
        (Symbol::new(env, "fee_collected"),),
        (payer.clone(), recipient.clone(), amount),
    );

    Ok(())
}

// =============================================================================
// Callback Pattern
// =============================================================================

/// Invokes a callback on a target contract
///
/// # Arguments
/// * `env` - The environment
/// * `target` - Address of the contract to call back
/// * `callback_func` - Name of the callback function
/// * `data` - Data to pass to the callback
///
/// # Returns
/// * `CallResult<()>` - Success or error code
///
/// # Note
/// This uses try_invoke to gracefully handle cases where the target
/// doesn't implement the callback interface
pub fn invoke_callback(
    env: &Env,
    target: &Address,
    callback_func: &Symbol,
    data: Val,
) -> CallResult<()> {
    let mut args = Vec::new(env);
    args.push_back(env.current_contract_address().into_val(env));
    args.push_back(data);

    // Use safe_invoke which handles errors gracefully
    match safe_invoke(env, target, callback_func, args) {
        Ok(_) => Ok(()),
        Err(_) => {
            // Callback failed, but we don't want to revert the entire transaction
            // Just emit an event for monitoring
            env.events().publish(
                (Symbol::new(env, "callback_failed"),),
                (target.clone(), callback_func.clone()),
            );
            Ok(())
        }
    }
}

// =============================================================================
// Event Emission Helpers
// =============================================================================

fn emit_call_initiated(env: &Env, target: &Address, function: &Symbol) {
    let event = CrossContractCallInitiatedEvent {
        caller: env.current_contract_address(),
        target: target.clone(),
        function: function.clone(),
        timestamp: env.ledger().timestamp(),
    };

    env.events()
        .publish((Symbol::new(env, "call_init"),), event);
}

fn emit_call_success(env: &Env, target: &Address, function: &Symbol) {
    let event = CrossContractCallSuccessEvent {
        caller: env.current_contract_address(),
        target: target.clone(),
        function: function.clone(),
        timestamp: env.ledger().timestamp(),
    };

    env.events().publish((Symbol::new(env, "call_ok"),), event);
}

// =============================================================================
// Authorization Helpers
// =============================================================================

/// Verifies that the caller is authorized to make cross-contract calls
///
/// # Arguments
/// * `_env` - The environment (currently unused but kept for API consistency)
/// * `expected_caller` - The expected caller address
///
/// # Returns
/// * `CallResult<()>` - Success if authorized, error otherwise
pub fn verify_caller(_env: &Env, expected_caller: &Address) -> CallResult<()> {
    expected_caller.require_auth();
    Ok(())
}

/// Verifies that the current contract is being called by an authorized contract
///
/// # Arguments
/// * `_env` - The environment (currently unused but kept for API consistency)
/// * `authorized_contracts` - List of authorized contract addresses
///
/// # Returns
/// * `CallResult<()>` - Success if caller is authorized, error otherwise
///
/// # Note
/// In Soroban, checking the invoker requires specific context setup.
/// This is a placeholder implementation that should be customized based on your needs.
pub fn verify_contract_caller(_env: &Env, _authorized_contracts: &Vec<Address>) -> CallResult<()> {
    // Note: Soroban doesn't provide a direct way to get the invoker address
    // in all contexts. This would need to be implemented based on your
    // specific contract architecture, possibly by passing the caller
    // as a parameter or using contract-specific storage.

    // For now, we return Ok to allow compilation
    // In production, implement proper caller verification
    Ok(())
}
