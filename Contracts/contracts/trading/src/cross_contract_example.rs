//! Example implementation demonstrating cross-contract communication patterns
//!
//! This module shows how to properly use the standardized cross-contract
//! communication patterns in a real trading contract scenario.

use soroban_sdk::{contract, contractimpl, Address, Env, Symbol};

use shared::cross_contract::{
    collect_fee, get_token_balance, invoke_callback, transfer_token, verify_caller,
};
use shared::safe_call::{check_reentrancy, clear_reentrancy_guard, set_reentrancy_guard};

/// Example trading contract demonstrating cross-contract patterns
#[contract]
pub struct CrossContractExample;

#[contractimpl]
impl CrossContractExample {
    /// Execute a trade with proper cross-contract communication
    ///
    /// This function demonstrates:
    /// - Reentrancy protection
    /// - Authorization checks
    /// - Token transfers
    /// - Fee collection
    /// - Event emission
    /// - Callback notifications
    ///
    /// # Arguments
    /// * `env` - The environment
    /// * `token` - Token contract address
    /// * `trader` - Address executing the trade
    /// * `amount` - Trade amount
    /// * `fee_recipient` - Address to receive fees
    /// * `fee_amount` - Fee amount to collect
    /// * `callback_target` - Optional address to notify on completion
    pub fn execute_trade(
        env: Env,
        token: Address,
        trader: Address,
        amount: i128,
        fee_recipient: Address,
        fee_amount: i128,
        callback_target: Option<Address>,
    ) -> Result<(), u32> {
        // 1. Reentrancy protection
        check_reentrancy(&env)?;
        set_reentrancy_guard(&env);

        // 2. Authorization check
        verify_caller(&env, &trader)?;

        // 3. Validate inputs
        if amount <= 0 {
            clear_reentrancy_guard(&env);
            return Err(3001); // INVALID_AMOUNT
        }

        if fee_amount < 0 || fee_amount >= amount {
            clear_reentrancy_guard(&env);
            return Err(3001); // INVALID_AMOUNT
        }

        // 4. Check sufficient balance
        let balance = match get_token_balance(&env, &token, &trader) {
            Ok(bal) => bal,
            Err(e) => {
                clear_reentrancy_guard(&env);
                return Err(e);
            }
        };

        if balance < amount {
            clear_reentrancy_guard(&env);
            return Err(3002); // INSUFFICIENT_BALANCE
        }

        // 5. Collect fee first (fail fast if fee collection fails)
        if let Err(e) = collect_fee(&env, &token, &trader, &fee_recipient, fee_amount) {
            clear_reentrancy_guard(&env);
            return Err(e);
        }

        // 6. Execute main trade logic
        let trade_amount = amount - fee_amount;
        if let Err(e) = transfer_token(
            &env,
            &token,
            &trader,
            &env.current_contract_address(),
            trade_amount,
        ) {
            clear_reentrancy_guard(&env);
            return Err(e);
        }

        // 7. Emit trade executed event
        env.events().publish(
            (Symbol::new(&env, "trade_executed"),),
            (trader.clone(), amount, fee_amount, env.ledger().timestamp()),
        );

        // 8. Notify callback target if provided (non-blocking)
        if let Some(target) = callback_target {
            let _ = invoke_callback(
                &env,
                &target,
                &Symbol::new(&env, "on_trade_complete"),
                (trader.clone(), amount).into_val(&env),
            );
        }

        // 9. Clear reentrancy guard
        clear_reentrancy_guard(&env);

        Ok(())
    }

    /// Batch execute multiple trades
    ///
    /// Demonstrates handling multiple cross-contract calls efficiently
    pub fn batch_execute_trades(
        env: Env,
        token: Address,
        traders: soroban_sdk::Vec<Address>,
        amounts: soroban_sdk::Vec<i128>,
        fee_recipient: Address,
        fee_percentage: u32,
    ) -> Result<u32, u32> {
        // Reentrancy protection
        check_reentrancy(&env)?;
        set_reentrancy_guard(&env);

        if traders.len() != amounts.len() {
            clear_reentrancy_guard(&env);
            return Err(3003); // INVALID_STATE
        }

        let mut successful_trades = 0u32;

        for i in 0..traders.len() {
            let trader = match traders.get(i) {
                Some(t) => t,
                None => continue,
            };

            let amount = match amounts.get(i) {
                Some(a) => a,
                None => continue,
            };

            // Calculate fee
            let fee_amount = (amount * fee_percentage as i128) / 10000;

            // Execute individual trade (errors are logged but don't stop batch)
            match Self::execute_single_trade(
                &env,
                &token,
                &trader,
                amount,
                &fee_recipient,
                fee_amount,
            ) {
                Ok(_) => {
                    successful_trades += 1;
                }
                Err(e) => {
                    // Log error but continue with other trades
                    env.events().publish(
                        (Symbol::new(&env, "trade_failed"),),
                        (trader, amount, e),
                    );
                }
            }
        }

        clear_reentrancy_guard(&env);
        Ok(successful_trades)
    }

    /// Internal helper for single trade execution
    fn execute_single_trade(
        env: &Env,
        token: &Address,
        trader: &Address,
        amount: i128,
        fee_recipient: &Address,
        fee_amount: i128,
    ) -> Result<(), u32> {
        // Collect fee
        collect_fee(env, token, trader, fee_recipient, fee_amount)?;

        // Transfer trade amount
        let trade_amount = amount - fee_amount;
        transfer_token(
            env,
            token,
            trader,
            &env.current_contract_address(),
            trade_amount,
        )?;

        Ok(())
    }

    /// Withdraw accumulated funds with authorization
    ///
    /// Demonstrates admin-only cross-contract operations
    pub fn withdraw(
        env: Env,
        token: Address,
        admin: Address,
        recipient: Address,
        amount: i128,
    ) -> Result<(), u32> {
        // Reentrancy protection
        check_reentrancy(&env)?;
        set_reentrancy_guard(&env);

        // Verify admin authorization
        if let Err(e) = verify_caller(&env, &admin) {
            clear_reentrancy_guard(&env);
            return Err(e);
        }

        // Check contract balance
        let balance = match get_token_balance(&env, &token, &env.current_contract_address()) {
            Ok(bal) => bal,
            Err(e) => {
                clear_reentrancy_guard(&env);
                return Err(e);
            }
        };

        if balance < amount {
            clear_reentrancy_guard(&env);
            return Err(3002); // INSUFFICIENT_BALANCE
        }

        // Execute withdrawal
        if let Err(e) = transfer_token(&env, &token, &env.current_contract_address(), &recipient, amount)
        {
            clear_reentrancy_guard(&env);
            return Err(e);
        }

        // Emit withdrawal event
        env.events().publish(
            (Symbol::new(&env, "withdrawal"),),
            (admin, recipient, amount, env.ledger().timestamp()),
        );

        clear_reentrancy_guard(&env);
        Ok(())
    }

    /// Query contract balance
    ///
    /// Demonstrates read-only cross-contract calls (no reentrancy guard needed)
    pub fn get_contract_balance(env: Env, token: Address) -> Result<i128, u32> {
        get_token_balance(&env, &token, &env.current_contract_address())
    }

    /// Check if user has sufficient balance for trade
    ///
    /// Another example of read-only cross-contract call
    pub fn can_execute_trade(
        env: Env,
        token: Address,
        trader: Address,
        amount: i128,
    ) -> Result<bool, u32> {
        let balance = get_token_balance(&env, &token, &trader)?;
        Ok(balance >= amount)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    #[test]
    fn test_execute_trade_validation() {
        let env = Env::default();
        env.mock_all_auths();

        let token = Address::generate(&env);
        let trader = Address::generate(&env);
        let fee_recipient = Address::generate(&env);

        // Test invalid amount (zero)
        let result = CrossContractExample::execute_trade(
            env.clone(),
            token.clone(),
            trader.clone(),
            0,
            fee_recipient.clone(),
            0,
            None,
        );
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), 3001); // INVALID_AMOUNT

        // Test invalid amount (negative)
        let result = CrossContractExample::execute_trade(
            env.clone(),
            token.clone(),
            trader.clone(),
            -100,
            fee_recipient.clone(),
            0,
            None,
        );
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), 3001); // INVALID_AMOUNT

        // Test fee >= amount
        let result = CrossContractExample::execute_trade(
            env.clone(),
            token.clone(),
            trader.clone(),
            100,
            fee_recipient.clone(),
            100,
            None,
        );
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), 3001); // INVALID_AMOUNT
    }

    #[test]
    fn test_batch_execute_validation() {
        let env = Env::default();
        env.mock_all_auths();

        let token = Address::generate(&env);
        let fee_recipient = Address::generate(&env);

        let mut traders = soroban_sdk::Vec::new(&env);
        traders.push_back(Address::generate(&env));

        let mut amounts = soroban_sdk::Vec::new(&env);
        amounts.push_back(100);
        amounts.push_back(200); // Mismatched length

        // Test mismatched lengths
        let result = CrossContractExample::batch_execute_trades(
            env.clone(),
            token,
            traders,
            amounts,
            fee_recipient,
            100, // 1% fee
        );
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), 3003); // INVALID_STATE
    }
}
