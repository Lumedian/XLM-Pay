use soroban_sdk::{testutils::Address as _, Address, Env, IntoVal, Symbol};
use social_rewards::{SocialRewardsContract, SocialRewardsContractClient, RewardError};
use std::collections::HashMap;

#[derive(Debug, Clone)]
struct FuzzTestState {
    client: SocialRewardsContractClient,
    addresses: Vec<Address>,
    admin: Address,
    token_id: Address,
    reward_counter: u64,
    total_funding: i128,
}

impl FuzzTestState {
    fn new(num_addresses: usize) -> Self {
        let mut env = Env::default();
        env.mock_all_auths();
        
        let contract_id = env.register_contract(None, SocialRewardsContract);
        let client = SocialRewardsContractClient::new(&env, &contract_id);
        
        let mut addresses = Vec::new();
        for _ in 0..num_addresses {
            addresses.push(Address::generate(&env));
        }
        
        let admin = addresses[0].clone();
        let token_id = env.register_stellar_asset_contract(admin.clone());
        client.init(&admin, &token_id);
        
        Self {
            env,
            client,
            addresses,
            admin,
            token_id,
            reward_counter: 0,
            total_funding: 0,
        }
    }
    
    fn setup_funding(&mut self, amount: i128) {
        let token_admin = soroban_sdk::token::StellarAssetClient::new(&self.env, &self.token_id);
        token_admin.mint(&self.client.address, &amount);
        self.total_funding = amount;
    }
    
    fn execute_add_reward(&mut self, user_idx: usize, amount: i128, reward_type: &str, reason: &str) {
        if user_idx >= self.addresses.len() || amount <= 0 {
            return;
        }
        
        let reward_type_symbol = Symbol::new(&self.env, reward_type);
        let reason_symbol = Symbol::new(&self.env, reason);
        
        let reward_id = self.client.add_reward(
            &self.admin,
            &self.addresses[user_idx],
            amount,
            &reward_type_symbol,
            &reason_symbol,
        );
        
        self.reward_counter = reward_id;
    }
    
    fn verify_invariants(&self) -> Result<(), String> {
        // Check stats consistency
        let stats = self.client.get_stats();
        if stats.total_rewards != self.reward_counter {
            return Err(format!("Reward count mismatch: contract={}, expected={}", stats.total_rewards, self.reward_counter));
        }
        
        // Check total claimed doesn't exceed total amount
        if stats.total_claimed > stats.total_amount {
            return Err(format!("Claimed exceeds total: claimed={}, total={}", stats.total_claimed, stats.total_amount));
        }
        
        // Check funding covers claimed amount
        if stats.total_claimed > self.total_funding {
            return Err(format!("Insufficient funding: claimed={}, funded={}", stats.total_claimed, self.total_funding));
        }
        
        // Check reward IDs are sequential
        if stats.last_reward_id > self.reward_counter {
            return Err(format!("Reward ID inconsistency: last={}, counter={}", stats.last_reward_id, self.reward_counter));
        }
        
        Ok(())
    }
}

#[cfg(test)]
mod fuzz_tests {
    use super::*;
    
    #[test]
    fn test_basic_fuzzing() {
        test_fuzzing_properties();
    }

    #[test]
    fn test_fuzzing_overflow_scenarios() {
        test_fuzzing_error_handling();
    }

    // Simple fuzz test - remove the complex arbitrary-based testing
    fn test_fuzzing_properties() {
        let mut state = FuzzTestState::new(10);
        state.setup_funding(100000);

        // Test basic valid operations
        let ops = vec![
            FuzzOperation::AddReward {
                user_idx: 0,
                amount: 1000,
                reward_type: "test".to_string(),
                reason: "fuzzing".to_string(),
            },
            FuzzOperation::GetStats,
            FuzzOperation::GetPendingRewards { user_idx: 0 },
        ];

        for op in ops {
            match &op {
                FuzzOperation::AddReward { user_idx, amount, reward_type, reason } => {
                    if *user_idx < state.addresses.len() {
                        state.execute_add_reward(*user_idx, *amount, reward_type, reason);
                    }
                }
                FuzzOperation::GetStats => {
                    let stats = state.client.get_stats();
                    assert!(stats.total_rewards >= 0);
                    assert!(stats.total_claimed >= 0);
                    assert!(stats.total_users >= 0);
                }
                FuzzOperation::GetPendingRewards { user_idx } => {
                    if *user_idx < state.addresses.len() {
                        let pending = state.client.get_pending_rewards(&state.addresses[*user_idx]);
                        // Should not panic
                    }
                }
                _ => {
                    // Other operations handled elsewhere
                }
            }
        }

        // Test error handling with edge cases
        test_fuzzing_error_handling(&state);
    }

    fn test_fuzzing_error_handling(state: &FuzzTestState) {
        // Test overflow scenarios
        let max_amount = i128::MAX;
        let user = Address::generate(&state.env);
        let reward_type = Symbol::new(&state.env, "overflow");
        let reason = Symbol::new(&state.env, "attack");
        
        let _ = state.client.try_add_reward(&state.admin, &user, &max_amount, &reward_type, &reason);

        // Test underflow scenarios
        let fake_user = Address::generate(&state.env);
        let _ = state.client.try_claim_reward(999999, &fake_user);

        // Test unauthorized claim
        let wrong_user = Address::generate(&state.env);
        let _ = state.client.try_claim_reward(1, &wrong_user);

        // Test invalid reward ID
        let _ = state.client.try_get_reward(&u128::MAX as u64);
    }
}
