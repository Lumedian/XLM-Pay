use soroban_sdk::{
    contract, contractimpl, contracttype,
    testutils::{Address as _, Events}, Address, Env, IntoVal, Symbol,
};
use social_rewards::{SocialRewardsContract, SocialRewardsContractClient, RewardError};

// Mock contracts for integration testing

#[contract]
struct RewardDistributor {
    reward_contract: Address,
    token_address: Address,
}

#[contractimpl]
impl RewardDistributor {
    pub fn __constructor(env: Env, reward_contract: Address, token_address: Address) {
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "reward_contract"), &reward_contract);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "token_address"), &token_address);
    }

    pub fn distribute_reward(env: Env, user: Address, amount: i128, reward_type: Symbol, reason: Symbol) {
        let reward_contract: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "reward_contract"))
            .unwrap();
        let token_address: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "token_address"))
            .unwrap();

        let client = SocialRewardsContractClient::new(&env, &reward_contract);
        let admin = client.admin();
        
        let reward_id = client.add_reward(&admin, &user, &amount, &reward_type, &reason);
        
        // Fund the reward contract
        let token_client = soroban_sdk::token::Client::new(&env, &token_address);
        token_client.transfer(&env.current_contract_address(), &reward_contract, &amount);
        
        env.events()
            .publish((Symbol::new(&env, "reward_distributed"), user), (reward_id, amount));
    }
    
    pub fn get_reward_contract(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&Symbol::new(&env, "reward_contract"))
            .unwrap()
    }
}

#[contract]
struct RewardAggregator {
    reward_contract: Address,
}

#[contractimpl]
impl RewardAggregator {
    pub fn __constructor(env: Env, reward_contract: Address) {
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "reward_contract"), &reward_contract);
    }

    pub fn get_all_user_rewards(env: Env, user: Address) -> i128 {
        let reward_contract: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "reward_contract"))
            .unwrap();
        
        let client = SocialRewardsContractClient::new(&env, &reward_contract);
        let pending = client.get_pending_rewards(&user);
        let rewards_list = client.get_user_rewards(&user);
        
        // Return total pending rewards plus count of rewards
        let count = rewards_list.len() as i128;
        pending + count
    }
    
    pub fn claim_multiple_rewards(env: Env, user: Address, max_count: u32) -> i128 {
        let reward_contract: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "reward_contract"))
            .unwrap();
        
        let client = SocialRewardsContractClient::new(&env, &reward_contract);
        let rewards_list = client.get_user_rewards(&user);
        
        let mut total_claimed = 0i128;
        let mut count = 0u32;
        
        while count < max_count && count < rewards_list.len() {
            let reward_id = rewards_list.get(count).unwrap();
            let reward = client.get_reward(&reward_id);
            if !reward.claimed {
                let amount = client.claim_reward(&reward_id, &user);
                total_claimed += amount;
            }
            count += 1;
        }
        
        total_claimed
    }
}

#[cfg(test)]
mod integration_tests {
    use super::*;

    #[test]
    fn test_reward_distributor_integration() {
        let env = Env::default();
        env.mock_all_auths();

        // Deploy contracts
        let reward_id = env.register_contract(None, SocialRewardsContract);
        let reward_client = SocialRewardsContractClient::new(&env, &reward_id);

        let admin = Address::generate(&env);
        let user = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract(admin.clone());
        reward_client.init(&admin, &token_id);

        let distributor_id = env.register_contract(None, RewardDistributor);
        let distributor_client = RewardDistributorClient::new(&env, &distributor_id);

        // Initialize distributor
        distributor_client.__constructor(&reward_id, &token_id);

        // Fund distributor
        let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);
        token_admin.mint(&distributor_id, &5000);

        // Distribute rewards through distributor
        distributor_client.distribute_reward(
            &user,
            &1000,
            &Symbol::new(&env, "referral"),
            &Symbol::new(&env, "friend_signup"),
        );

        distributor_client.distribute_reward(
            &user,
            &1500,
            &Symbol::new(&env, "achievement"),
            &Symbol::new(&env, "level_up"),
        );

        // Verify rewards were created
        let user_rewards = reward_client.get_user_rewards(&user);
        assert_eq!(user_rewards.len(), 2);
        assert_eq!(reward_client.get_pending_rewards(&user), 2500);

        // Verify distributor can access reward contract
        let stored_reward_contract = distributor_client.get_reward_contract();
        assert_eq!(stored_reward_contract, reward_id);
    }

    #[test]
    fn test_reward_aggregator_integration() {
        let env = Env::default();
        env.mock_all_auths();

        // Deploy contracts
        let reward_id = env.register_contract(None, SocialRewardsContract);
        let reward_client = SocialRewardsContractClient::new(&env, &reward_id);

        let admin = Address::generate(&env);
        let user = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract(admin.clone());
        reward_client.init(&admin, &token_id);

        let aggregator_id = env.register_contract(None, RewardAggregator);
        let aggregator_client = RewardAggregatorClient::new(&env, &aggregator_id);

        // Initialize aggregator
        aggregator_client.__constructor(&reward_id);

        // Fund reward contract
        let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);
        token_admin.mint(&reward_id, &5000);

        // Create multiple rewards
        reward_client.add_reward(
            &admin,
            &user,
            &1000,
            &Symbol::new(&env, "type1"),
            &Symbol::new(&env, "reason1"),
        );

        reward_client.add_reward(
            &admin,
            &user,
            &1500,
            &Symbol::new(&env, "type2"),
            &Symbol::new(&env, "reason2"),
        );

        reward_client.add_reward(
            &admin,
            &user,
            &2000,
            &Symbol::new(&env, "type3"),
            &Symbol::new(&env, "reason3"),
        );

        // Test aggregator functions
        let total_rewards_info = aggregator_client.get_all_user_rewards(&user);
        assert_eq!(total_rewards_info, 4502); // 4500 pending + 2 rewards

        let claimed_amount = aggregator_client.claim_multiple_rewards(&user, &2);
        assert_eq!(claimed_amount, 2500); // First two rewards

        // Verify remaining pending
        assert_eq!(reward_client.get_pending_rewards(&user), 2000);
    }

    #[test]
    fn test_cross_contract_reward_management() {
        let env = Env::default();
        env.mock_all_auths();

        // Deploy contracts
        let reward_id = env.register_contract(None, SocialRewardsContract);
        let reward_client = SocialRewardsContractClient::new(&env, &reward_id);

        let admin = Address::generate(&env);
        let user1 = Address::generate(&env);
        let user2 = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract(admin.clone());
        reward_client.init(&admin, &token_id);

        let distributor_id = env.register_contract(None, RewardDistributor);
        let distributor_client = RewardDistributorClient::new(&env, &distributor_id);

        let aggregator_id = env.register_contract(None, RewardAggregator);
        let aggregator_client = RewardAggregatorClient::new(&env, &aggregator_id);

        // Initialize contracts
        distributor_client.__constructor(&reward_id, &token_id);
        aggregator_client.__constructor(&reward_id);

        // Fund contracts
        let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);
        token_admin.mint(&distributor_id, &10000);
        token_admin.mint(&reward_id, &5000);

        // Distribute rewards for user1
        distributor_client.distribute_reward(
            &user1,
            &2000,
            &Symbol::new(&env, "referral"),
            &Symbol::new(&env, "friend1"),
        );

        distributor_client.distribute_reward(
            &user1,
            &1500,
            &Symbol::new(&env, "referral"),
            &Symbol::new(&env, "friend2"),
        );

        // Add direct reward for user2
        reward_client.add_reward(
            &admin,
            &user2,
            &3000,
            &Symbol::new(&env, "bonus"),
            &Symbol::new(&env, "performance"),
        );

        // Verify initial state
        assert_eq!(reward_client.get_pending_rewards(&user1), 3500);
        assert_eq!(reward_client.get_pending_rewards(&user2), 3000);

        // Use aggregator to claim some rewards
        let user1_claimed = aggregator_client.claim_multiple_rewards(&user1, &1);
        assert_eq!(user1_claimed, 2000);

        let user2_claimed = aggregator_client.claim_multiple_rewards(&user2, &1);
        assert_eq!(user2_claimed, 3000);

        // Verify final state
        assert_eq!(reward_client.get_pending_rewards(&user1), 1500);
        assert_eq!(reward_client.get_pending_rewards(&user2), 0);

        let stats = reward_client.get_stats();
        assert_eq!(stats.total_rewards, 3);
        assert_eq!(stats.total_amount, 6500);
        assert_eq!(stats.total_claimed, 5000);
    }

    #[test]
    fn test_reward_event_propagation() {
        let env = Env::default();
        env.mock_all_auths();

        // Deploy contracts
        let reward_id = env.register_contract(None, SocialRewardsContract);
        let reward_client = SocialRewardsContractClient::new(&env, &reward_id);

        let admin = Address::generate(&env);
        let user = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract(admin.clone());
        reward_client.init(&admin, &token_id);

        let distributor_id = env.register_contract(None, RewardDistributor);
        let distributor_client = RewardDistributorClient::new(&env, &distributor_id);

        // Initialize distributor
        distributor_client.__constructor(&reward_id, &token_id);

        // Fund distributor
        let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);
        token_admin.mint(&distributor_id, &5000);

        // Distribute reward and capture events
        distributor_client.distribute_reward(
            &user,
            &1000,
            &Symbol::new(&env, "test"),
            &Symbol::new(&env, "event_test"),
        );

        // Verify events were emitted
        let events = env.events().all();
        
        // Should have reward event from social rewards contract
        let has_reward_event = events.iter().any(|(_, topics, _): (soroban_sdk::Val, soroban_sdk::Vec<soroban_sdk::Val>, soroban_sdk::Val)| {
            if let Some(first_topic) = topics.first() {
                let topic_str: Result<Symbol, _> = first_topic.clone().try_into_val(&env);
                if let Ok(sym) = topic_str {
                    return sym == symbol_short!("reward");
                }
            }
            false
        });
        assert!(has_reward_event, "Reward event not found");

        // Should have distribution event from distributor
        let has_distribute_event = events.iter().any(|(_, topics, _): (soroban_sdk::Val, soroban_sdk::Vec<soroban_sdk::Val>, soroban_sdk::Val)| {
            if let Some(first_topic) = topics.first() {
                let topic_str: Result<Symbol, _> = first_topic.clone().try_into_val(&env);
                if let Ok(sym) = topic_str {
                    return sym == symbol_short!("reward_distributed");
                }
            }
            false
        });
        assert!(has_distribute_event, "Distribution event not found");
    }

    #[test]
    fn test_complex_reward_scenarios() {
        let env = Env::default();
        env.mock_all_auths();

        // Deploy contracts
        let reward_id = env.register_contract(None, SocialRewardsContract);
        let reward_client = SocialRewardsContractClient::new(&env, &reward_id);

        let admin = Address::generate(&env);
        let user = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract(admin.clone());
        reward_client.init(&admin, &token_id);

        let aggregator_id = env.register_contract(None, RewardAggregator);
        let aggregator_client = RewardAggregatorClient::new(&env, &aggregator_id);

        // Initialize aggregator
        aggregator_client.__constructor(&reward_id);

        // Fund reward contract
        let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);
        token_admin.mint(&reward_id, &20000);

        // Create complex reward scenario
        let mut reward_ids = Vec::new();
        
        // Add 10 rewards with different amounts
        for i in 0..10 {
            let amount = 100 + (i * 50);
            let reward_id = reward_client.add_reward(
                &admin,
                &user,
                &amount,
                &Symbol::new(&env, &format!("reward_{}", i)),
                &Symbol::new(&env, "test"),
            );
            reward_ids.push(reward_id);
        }

        // Verify initial state
        assert_eq!(reward_client.get_pending_rewards(&user), 3250); // Sum of 100+150+200+...+550
        assert_eq!(reward_client.get_user_rewards(&user).len(), 10);

        // Claim first 3 rewards through aggregator
        let first_claim = aggregator_client.claim_multiple_rewards(&user, &3);
        assert_eq!(first_claim, 450); // 100 + 150 + 200

        // Claim next 4 rewards
        let second_claim = aggregator_client.claim_multiple_rewards(&user, &7); // 3 + 4 = 7 total
        assert_eq!(second_claim, 1100); // 250 + 300 + 350 + 400

        // Verify remaining rewards
        assert_eq!(reward_client.get_pending_rewards(&user), 1700); // 450 + 500 + 550 + 600 + 650
        assert_eq!(reward_client.get_user_rewards(&user).len(), 10); // Count unchanged

        // Verify stats
        let stats = reward_client.get_stats();
        assert_eq!(stats.total_rewards, 10);
        assert_eq!(stats.total_amount, 3250);
        assert_eq!(stats.total_claimed, 1550);
    }
}

fn test_cross_contract_interactions() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_id = env.register_contract_wasm(None, token::WASM);
    let token_client = token::Client::new(&env, &token_id);
    
    // Initialize token
    token_client.initialize(
        &token_admin,
        &7,
        &"StellarToken".into_val(&env),
        &"STT".into_val(&env),
    );
    
    // Create reward contract
    let reward_id = env.register_contract(None, SocialRewardsContract {});
    let reward_client = SocialRewardsContractClient::new(&env, &reward_id);
    reward_client.initialize(&admin, &token_id);
    
    // Test basic interaction
    let user = Address::generate(&env);
    token_client.mint(&user, &10000);
    
    let reward_id_result = reward_client.add_reward(
        &user,
        &1000,
        &"social".to_string(),
        &"Test reward".to_string(),
    );
    
    assert!(reward_id_result > 0);
    
    // Test reward claiming
    let balance_before = token_client.balance(&user);
    reward_client.claim_reward(&user, &reward_id_result);
    let balance_after = token_client.balance(&user);
    
    assert_eq!(balance_after - balance_before, 1000);
}

#[test]
fn test_cross_contract_scenarios() {
    test_cross_contract_interactions();
}

#[test]
fn test_governance_integration() {
    test_governance_scenarios();
}
