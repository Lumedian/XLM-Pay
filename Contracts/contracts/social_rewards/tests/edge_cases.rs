use soroban_sdk::{testutils::Address as _, Address, Env, IntoVal, Symbol};
use social_rewards::{SocialRewardsContract, SocialRewardsContractClient, RewardError};

#[cfg(test)]
mod edge_case_tests {
    use super::*;

    #[test]
    fn test_zero_amount_rewards() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, SocialRewardsContract);
        let client = SocialRewardsContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let user = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract(admin.clone());
        client.init(&admin, &token_id);

        // Test zero amount reward
        let result = client.try_add_reward(
            &admin,
            &user,
            &0,
            &Symbol::new(&env, "test"),
            &Symbol::new(&env, "test"),
        );
        assert_eq!(result, Err(Ok(RewardError::InvalidAmount)));

        // Test negative amount reward
        let result = client.try_add_reward(
            &admin,
            &user,
            &-100,
            &Symbol::new(&env, "test"),
            &Symbol::new(&env, "test"),
        );
        assert_eq!(result, Err(Ok(RewardError::InvalidAmount)));

        // Verify no rewards were created
        let stats = client.get_stats();
        assert_eq!(stats.total_rewards, 0);
    }

    #[test]
    fn test_maximum_values() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, SocialRewardsContract);
        let client = SocialRewardsContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let user = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract(admin.clone());
        client.init(&admin, &token_id);

        let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);
        token_admin.mint(&contract_id, &i128::MAX);

        // Test maximum reward amount
        let reward_id = client.add_reward(
            &admin,
            &user,
            &i128::MAX,
            &Symbol::new(&env, "max_reward"),
            &Symbol::new(&env, "test"),
        );

        // Test maximum reward can be claimed
        let claimed_amount = client.claim_reward(&reward_id, &user);
        assert_eq!(claimed_amount, i128::MAX);

        // Verify stats
        let stats = client.get_stats();
        assert_eq!(stats.total_rewards, 1);
        assert_eq!(stats.total_amount, i128::MAX);
        assert_eq!(stats.total_claimed, i128::MAX);
    }

    #[test]
    fn test_reward_id_boundary_conditions() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, SocialRewardsContract);
        let client = SocialRewardsContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let user = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract(admin.clone());
        client.init(&admin, &token_id);

        let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);
        token_admin.mint(&contract_id, &10000);

        // Test reward ID 1
        let reward_id_1 = client.add_reward(
            &admin,
            &user,
            &100,
            &Symbol::new(&env, "first"),
            &Symbol::new(&env, "test"),
        );
        assert_eq!(reward_id_1, 1);

        // Test reward ID 2
        let reward_id_2 = client.add_reward(
            &admin,
            &user,
            &200,
            &Symbol::new(&env, "second"),
            &Symbol::new(&env, "test"),
        );
        assert_eq!(reward_id_2, 2);

        // Test get non-existent reward
        let result = client.try_get_reward(&999);
        assert!(result.is_err());

        // Test claim non-existent reward
        let result = client.try_claim_reward(&999, &user);
        assert!(result.is_err());

        // Verify stats
        let stats = client.get_stats();
        assert_eq!(stats.total_rewards, 2);
        assert_eq!(stats.last_reward_id, 2);
    }

    #[test]
    fn test_unauthorized_operations() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, SocialRewardsContract);
        let client = SocialRewardsContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let user = Address::generate(&env);
        let unauthorized_user = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract(admin.clone());
        client.init(&admin, &token_id);

        // Test add reward without admin authorization
        let result = client.try_add_reward(
            &unauthorized_user,
            &user,
            &100,
            &Symbol::new(&env, "unauthorized"),
            &Symbol::new(&env, "test"),
        );
        assert_eq!(result, Err(Ok(RewardError::Unauthorized)));

        // Test claim reward with wrong user
        let reward_id = client.add_reward(
            &admin,
            &user,
            &100,
            &Symbol::new(&env, "test"),
            &Symbol::new(&env, "test"),
        );

        let result = client.try_claim_reward(&reward_id, &unauthorized_user);
        assert_eq!(result, Err(Ok(RewardError::Unauthorized)));

        // Verify stats unchanged
        let stats = client.get_stats();
        assert_eq!(stats.total_rewards, 1);
        assert_eq!(stats.total_claimed, 0);
    }

    #[test]
    fn test_claim_already_claimed() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, SocialRewardsContract);
        let client = SocialRewardsContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let user = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract(admin.clone());
        client.init(&admin, &token_id);

        let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);
        token_admin.mint(&contract_id, &1000);

        // Create and claim reward
        let reward_id = client.add_reward(
            &admin,
            &user,
            &500,
            &Symbol::new(&env, "test"),
            &Symbol::new(&env, "test"),
        );

        let claimed_amount = client.claim_reward(&reward_id, &user);
        assert_eq!(claimed_amount, 500);

        // Try to claim again
        let result = client.try_claim_reward(&reward_id, &user);
        assert_eq!(result, Err(Ok(RewardError::AlreadyClaimed)));

        // Verify stats
        let stats = client.get_stats();
        assert_eq!(stats.total_claimed, 500);
    }

    #[test]
    fn test_insufficient_contract_balance() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, SocialRewardsContract);
        let client = SocialRewardsContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let user = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract(admin.clone());
        client.init(&admin, &token_id);

        // Create reward without funding contract
        let reward_id = client.add_reward(
            &admin,
            &user,
            &1000,
            &Symbol::new(&env, "test"),
            &Symbol::new(&env, "test"),
        );

        // Try to claim with insufficient balance
        let result = client.try_claim_reward(&reward_id, &user);
        assert_eq!(result, Err(Ok(RewardError::InsufficientBalance)));

        // Verify stats
        let stats = client.get_stats();
        assert_eq!(stats.total_rewards, 1);
        assert_eq!(stats.total_claimed, 0);
        assert_eq!(stats.total_amount, 1000);
    }

    #[test]
    fn test_multiple_users_rewards() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, SocialRewardsContract);
        let client = SocialRewardsContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let user1 = Address::generate(&env);
        let user2 = Address::generate(&env);
        let user3 = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract(admin.clone());
        client.init(&admin, &token_id);

        let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);
        token_admin.mint(&contract_id, &3000);

        // Create rewards for multiple users
        let reward1 = client.add_reward(
            &admin,
            &user1,
            &1000,
            &Symbol::new(&env, "user1_reward"),
            &Symbol::new(&env, "test"),
        );

        let reward2 = client.add_reward(
            &admin,
            &user2,
            &1500,
            &Symbol::new(&env, "user2_reward"),
            &Symbol::new(&env, "test"),
        );

        let reward3 = client.add_reward(
            &admin,
            &user3,
            &500,
            &Symbol::new(&env, "user3_reward"),
            &Symbol::new(&env, "test"),
        );

        // Verify user rewards
        let user1_rewards = client.get_user_rewards(&user1);
        assert_eq!(user1_rewards.len(), 1);
        assert_eq!(user1_rewards.get(0).unwrap(), reward1);

        let user2_rewards = client.get_user_rewards(&user2);
        assert_eq!(user2_rewards.len(), 1);
        assert_eq!(user2_rewards.get(0).unwrap(), reward2);

        let user3_rewards = client.get_user_rewards(&user3);
        assert_eq!(user3_rewards.len(), 1);
        assert_eq!(user3_rewards.get(0).unwrap(), reward3);

        // Claim rewards
        let claimed1 = client.claim_reward(&reward1, &user1);
        let claimed2 = client.claim_reward(&reward2, &user2);
        let claimed3 = client.claim_reward(&reward3, &user3);

        assert_eq!(claimed1, 1000);
        assert_eq!(claimed2, 1500);
        assert_eq!(claimed3, 500);

        // Verify final stats
        let stats = client.get_stats();
        assert_eq!(stats.total_rewards, 3);
        assert_eq!(stats.total_amount, 3000);
        assert_eq!(stats.total_claimed, 3000);
        assert_eq!(stats.last_reward_id, 3);
    }

    #[test]
    fn test_empty_and_long_reward_types() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, SocialRewardsContract);
        let client = SocialRewardsContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let user = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract(admin.clone());
        client.init(&admin, &token_id);

        let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);
        token_admin.mint(&contract_id, &1000);

        // Test with very long reward type
        let long_type = "A".repeat(100);
        let long_reason = "B".repeat(100);

        let reward_id = client.add_reward(
            &admin,
            &user,
            &1000,
            &Symbol::new(&env, &long_type),
            &Symbol::new(&env, &long_reason),
        );

        let reward = client.get_reward(&reward_id);
        assert_eq!(reward.amount, 1000);
        assert_eq!(reward.user, user);
        assert!(!reward.claimed);

        // Claim the reward
        let claimed = client.claim_reward(&reward_id, &user);
        assert_eq!(claimed, 1000);
    }

    #[test]
    fn test_concurrent_reward_operations() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, SocialRewardsContract);
        let client = SocialRewardsContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let user1 = Address::generate(&env);
        let user2 = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract(admin.clone());
        client.init(&admin, &token_id);

        let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);
        token_admin.mint(&contract_id, &5000);

        // Set up initial state
        let reward1 = client.add_reward(
            &admin,
            &user1,
            &1000,
            &Symbol::new(&env, "reward1"),
            &Symbol::new(&env, "test"),
        );

        let reward2 = client.add_reward(
            &admin,
            &user2,
            &1500,
            &Symbol::new(&env, "reward2"),
            &Symbol::new(&env, "test"),
        );

        let reward3 = client.add_reward(
            &admin,
            &user1,
            &2000,
            &Symbol::new(&env, "reward3"),
            &Symbol::new(&env, "test"),
        );

        // Perform multiple operations
        let claimed1 = client.claim_reward(&reward1, &user1);
        let user1_pending = client.get_pending_rewards(&user1);
        let user2_pending = client.get_pending_rewards(&user2);
        let claimed2 = client.claim_reward(&reward2, &user2);

        // Verify final state
        assert_eq!(claimed1, 1000);
        assert_eq!(claimed2, 1500);
        assert_eq!(user1_pending, 2000); // Only reward3 pending
        assert_eq!(user2_pending, 0);   // All claimed

        // Verify total supply is conserved
        let stats = client.get_stats();
        assert_eq!(stats.total_rewards, 3);
        assert_eq!(stats.total_amount, 4500);
        assert_eq!(stats.total_claimed, 2500);
    }
}