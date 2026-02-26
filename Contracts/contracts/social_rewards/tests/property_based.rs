use proptest::prelude::*;
use soroban_sdk::{testutils::Address as _, Address, Env, IntoVal, Symbol};
use social_rewards::{SocialRewardsContract, SocialRewardsContractClient, RewardError};
use std::collections::HashMap;

#[derive(Debug, Clone)]
enum RewardAction {
    AddReward { user_idx: usize, amount: i128, reward_type: String, reason: String },
    ClaimReward { reward_id: u64 },
    GetPendingRewards { user_idx: usize },
    GetStats,
}

impl Arbitrary for RewardAction {
    type Parameters = ();
    type Strategy = BoxedStrategy<Self>;

    fn arbitrary_with(_args: Self::Parameters) -> Self::Strategy {
        prop_oneof![
            (0..10usize, 1i128..10000i128, "[a-z]{1,10}", "[a-z]{5,20}")
                .prop_map(|(user_idx, amount, reward_type, reason)| RewardAction::AddReward {
                    user_idx,
                    amount,
                    reward_type: reward_type.to_string(),
                    reason: reason.to_string(),
                }),
            (1u64..1000u64).prop_map(|reward_id| RewardAction::ClaimReward { reward_id }),
            (0..10usize).prop_map(|user_idx| RewardAction::GetPendingRewards { user_idx }),
            Just(RewardAction::GetStats),
        ]
        .boxed()
    }
}

#[derive(Debug, Clone)]
struct TestState {
    addresses: Vec<Address>,
    rewards: Vec<(u64, i128, bool)>, // (reward_id, amount, claimed)
    user_rewards: HashMap<usize, Vec<u64>>,
    total_claimed: i128,
    total_rewards: u64,
    admin: usize,
}

impl TestState {
    fn new(num_addresses: usize, admin_idx: usize) -> Self {
        let env = Env::default();
        let mut addresses = Vec::new();
        for _ in 0..num_addresses {
            addresses.push(Address::generate(&env));
        }
        
        Self {
            addresses,
            rewards: Vec::new(),
            user_rewards: HashMap::new(),
            total_claimed: 0,
            total_rewards: 0,
            admin: admin_idx,
        }
    }
    
    fn apply_action(&mut self, action: &RewardAction, client: &SocialRewardsContractClient, env: &Env) {
        match action {
            RewardAction::AddReward { user_idx, amount, reward_type, reason } => {
                if *user_idx >= self.addresses.len() || *amount <= 0 {
                    return;
                }
                
                let reward_type_symbol = Symbol::new(env, reward_type);
                let reason_symbol = Symbol::new(env, reason);
                
                let reward_id = client.add_reward(
                    &self.addresses[self.admin],
                    &self.addresses[*user_idx],
                    amount,
                    &reward_type_symbol,
                    &reason_symbol,
                );
                
                self.rewards.push((reward_id, *amount, false));
                self.user_rewards.entry(*user_idx).or_insert_with(Vec::new).push(reward_id);
                self.total_rewards += 1;
            }
            
            RewardAction::ClaimReward { reward_id } => {
                // Find the reward
                if let Some(reward_entry) = self.rewards.iter_mut().find(|(id, _, _)| *id == *reward_id) {
                    let (_, amount, claimed) = reward_entry;
                    if !*claimed {
                        *claimed = true;
                        self.total_claimed += *amount;
                        
                        // Claim the reward
                        client.claim_reward(reward_id, &self.addresses[0]); // Use first address as claimer
                    }
                }
            }
            
            RewardAction::GetPendingRewards { user_idx } => {
                if *user_idx < self.addresses.len() {
                    let _ = client.get_pending_rewards(&self.addresses[*user_idx]);
                }
            }
            
            RewardAction::GetStats => {
                let _ = client.get_stats();
            }
        }
    }
    
    fn verify_invariants(&self, client: &SocialRewardsContractClient) -> Result<(), String> {
        // Check stats consistency
        let stats = client.get_stats();
        if stats.total_rewards != self.total_rewards {
            return Err(format!("Total rewards mismatch: contract={}, calculated={}", stats.total_rewards, self.total_rewards));
        }
        
        let calculated_total_amount: i128 = self.rewards.iter().map(|(_, amount, _)| amount).sum();
        if stats.total_amount != calculated_total_amount {
            return Err(format!("Total amount mismatch: contract={}, calculated={}", stats.total_amount, calculated_total_amount));
        }
        
        if stats.total_claimed != self.total_claimed {
            return Err(format!("Total claimed mismatch: contract={}, calculated={}", stats.total_claimed, self.total_claimed));
        }
        
        // Check reward amounts are positive
        for (_, amount, _) in &self.rewards {
            if *amount <= 0 {
                return Err(format!("Negative or zero reward amount: {}", amount));
            }
        }
        
        Ok(())
    }
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(50))]
    
    #[test]
    fn property_based_reward_invariants(
        initial_rewards in 1u64..100u64,
        actions in prop::collection::vec(any::<RewardAction>(), 20..50),
    ) {
        let env = Env::default();
        env.mock_all_auths();
        
        let contract_id = env.register_contract(None, SocialRewardsContract);
        let client = SocialRewardsContractClient::new(&env, &contract_id);
        
        let admin = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract(admin.clone());
        client.init(&admin, &token_id);
        
        let mut state = TestState::new(10, 0);
        state.addresses[0] = admin.clone();
        
        // Fund contract for claims
        let token_client = soroban_sdk::token::Client::new(&env, &token_id);
        let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);
        token_admin.mint(&contract_id, &(initial_rewards as i128 * 1000));
        
        // Apply actions and verify invariants
        for action in actions {
            state.apply_action(&action, &client, &env);
            
            // Verify invariants after each action
            if let Err(e) = state.verify_invariants(&client) {
                prop_assert!(false, "Invariant violation after action {:?}: {}", action, e);
            }
        }
    }
    
    #[test]
    fn property_based_claim_conservation(
        rewards_data in prop::collection::vec(
            (1i128..1000i128, prop::option::of(0u64..10u64)), // (amount, maybe claim idx)
            5..20
        ),
    ) {
        let env = Env::default();
        env.mock_all_auths();
        
        let contract_id = env.register_contract(None, SocialRewardsContract);
        let client = SocialRewardsContractClient::new(&env, &contract_id);
        
        let admin = Address::generate(&env);
        let user = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract(admin.clone());
        client.init(&admin, &token_id);
        
        let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);
        let mut total_amount = 0i128;
        let mut reward_ids = Vec::new();
        
        // Create rewards
        for (amount, _) in &rewards_data {
            let reward_id = client.add_reward(
                &admin,
                &user,
                amount,
                &Symbol::new(&env, "test"),
                &Symbol::new(&env, "test"),
            );
            reward_ids.push(reward_id);
            total_amount += amount;
        }
        
        // Fund contract
        token_admin.mint(&contract_id, &total_amount);
        
        // Claim rewards
        let mut claimed_amount = 0i128;
        for (i, (_, claim_idx)) in rewards_data.iter().enumerate() {
            if let Some(idx) = claim_idx {
                if *idx < reward_ids.len() as u64 {
                    let reward_id = reward_ids[*idx as usize];
                    let reward_amount = client.claim_reward(&reward_id, &user);
                    claimed_amount += reward_amount;
                }
            }
        }
        
        // Verify conservation
        let stats = client.get_stats();
        prop_assert_eq!(stats.total_amount, total_amount);
        prop_assert_eq!(stats.total_claimed, claimed_amount);
        prop_assert!(claimed_amount <= total_amount);
    }
    
    #[test]
    fn property_based_user_reward_tracking(
        user_count in 2usize..5usize,
        reward_count in 5u64..20u64,
        claim_pattern in prop::collection::vec(
            prop::bool::weighted(0.7), // 70% chance of claiming
            5..20
        ),
    ) {
        let env = Env::default();
        env.mock_all_auths();
        
        let contract_id = env.register_contract(None, SocialRewardsContract);
        let client = SocialRewardsContractClient::new(&env, &contract_id);
        
        let admin = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract(admin.clone());
        client.init(&admin, &token_id);
        
        let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);
        let mut addresses = Vec::new();
        for _ in 0..user_count {
            addresses.push(Address::generate(&env));
        }
        
        let mut user_rewards: HashMap<usize, Vec<u64>> = HashMap::new();
        let mut total_funding = 0i128;
        
        // Distribute rewards
        for i in 0..reward_count as usize {
            let user_idx = i % user_count;
            let amount = 100i128 + (i as i128 * 10);
            let reward_id = client.add_reward(
                &admin,
                &addresses[user_idx],
                &amount,
                &Symbol::new(&env, "distribution"),
                &Symbol::new(&env, "test"),
            );
            
            user_rewards.entry(user_idx).or_insert_with(Vec::new).push(reward_id);
            total_funding += amount;
        }
        
        // Fund contract
        token_admin.mint(&contract_id, &total_funding);
        
        // Verify user rewards
        for (user_idx, expected_rewards) in &user_rewards {
            let user_rewards_list = client.get_user_rewards(&addresses[*user_idx]);
            prop_assert_eq!(user_rewards_list.len(), expected_rewards.len() as u32);
            
            for (i, &expected_id) in expected_rewards.iter().enumerate() {
                prop_assert_eq!(user_rewards_list.get(i as u32).unwrap(), expected_id);
            }
        }
        
        // Verify pending rewards
        for (user_idx, expected_rewards) in &user_rewards {
            let pending = client.get_pending_rewards(&addresses[*user_idx]);
            let expected_pending: i128 = expected_rewards.iter().map(|&id| {
                let reward = client.get_reward(&id);
                if reward.claimed { 0 } else { reward.amount }
            }).sum();
            prop_assert_eq!(pending, expected_pending);
        }
    }
}