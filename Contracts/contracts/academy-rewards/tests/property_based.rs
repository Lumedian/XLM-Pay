use proptest::prelude::*;
use proptest::strategy::{BoxedStrategy, Strategy};
use soroban_sdk::{testutils::Address as _, Address, Env, String, Symbol};
use std::collections::HashMap;

use academy_rewards::{AcademyRewardsContract, AcademyRewardsContractClient, ContractError, Badge, BadgeMetadata};

#[derive(Debug, Clone)]
enum AcademyAction {
    CreateBadgeType { badge_type: u32, discount_bps: u32, max_redemptions: u32, validity_duration: u64 },
    MintBadge { user_idx: usize, badge_type: u32 },
    RedeemBadge { user_idx: usize, tx_hash: String },
    RevokeBadge { user_idx: usize },
    SetPaused { paused: bool },
    GetUserDiscount { user_idx: usize },
    GetBadgeMetadata { badge_type: u32 },
}

impl Arbitrary for AcademyAction {
    type Parameters = ();
    type Strategy = BoxedStrategy<Self>;

    fn arbitrary_with(_args: Self::Parameters) -> Self::Strategy {
        prop_oneof![
            (1u32..100u32, 0u32..10000u32, 0u32..100u32, 0u64..31536000u64)
                .prop_map(|(badge_type, discount_bps, max_redemptions, validity_duration)| AcademyAction::CreateBadgeType {
                    badge_type,
                    discount_bps,
                    max_redemptions,
                    validity_duration,
                }),
            (0..10usize, 1u32..100u32)
                .prop_map(|(user_idx, badge_type)| AcademyAction::MintBadge { user_idx, badge_type }),
            (0..10usize, "[a-zA-Z0-9]{10,32}")
                .prop_map(|(user_idx, tx_hash)| AcademyAction::RedeemBadge {
                    user_idx,
                    tx_hash: tx_hash.to_string(),
                }),
            (0..10usize).prop_map(|user_idx| AcademyAction::RevokeBadge { user_idx }),
            any::<bool>().prop_map(|paused| AcademyAction::SetPaused { paused }),
            (0..10usize).prop_map(|user_idx| AcademyAction::GetUserDiscount { user_idx }),
            (1u32..100u32).prop_map(|badge_type| AcademyAction::GetBadgeMetadata { badge_type }),
        ]
        .boxed()
    }
}

#[derive(Debug, Clone)]
struct TestState {
    addresses: Vec<Address>,
    badge_types: HashMap<u32, BadgeMetadata>,
    user_badges: HashMap<usize, Option<Badge>>,
    total_minted: HashMap<u32, u32>,
    is_paused: bool,
}

impl TestState {
    fn new(addresses: Vec<Address>) -> Self {
        Self {
            addresses,
            badge_types: HashMap::new(),
            user_badges: HashMap::new(),
            total_minted: HashMap::new(),
            is_paused: false,
        }
    }
    
    fn apply_action(&mut self, action: &AcademyAction) -> Result<Option<u32>, ContractError> {
        match action {
            AcademyAction::CreateBadgeType { badge_type, discount_bps, max_redemptions, validity_duration } => {
                if *discount_bps > 10000 {
                    return Err(ContractError::InvalidDiscount);
                }
                
                let metadata = BadgeMetadata {
                    name: String::from_str(&Env::default(), "TestBadge"),
                    discount_bps: *discount_bps,
                    max_redemptions: *max_redemptions,
                    validity_duration: *validity_duration,
                    enabled: true,
                };
                
                self.badge_types.insert(*badge_type, metadata);
                self.total_minted.insert(*badge_type, 0);
                Ok(None)
            }
            AcademyAction::MintBadge { user_idx, badge_type } => {
                if self.is_paused {
                    return Err(ContractError::ContractPaused);
                }
                
                if *user_idx >= self.addresses.len() {
                    return Err(ContractError::Unauthorized);
                }
                
                let metadata = self.badge_types.get(badge_type)
                    .ok_or(ContractError::BadgeTypeNotFound)?;
                
                if !metadata.enabled {
                    return Err(ContractError::BadgeTypeDisabled);
                }
                
                if let Some(Some(existing_badge)) = self.user_badges.get(user_idx) {
                    if existing_badge.badge_type == *badge_type && existing_badge.active {
                        return Err(ContractError::UserAlreadyHasBadge);
                    }
                }
                
                let badge = Badge {
                    badge_type: *badge_type,
                    discount_bps: metadata.discount_bps,
                    earned_at: 1000, // Fixed timestamp for testing
                    redeemed_count: 0,
                    max_redemptions: metadata.max_redemptions,
                    expiry: if metadata.validity_duration > 0 {
                        1000 + metadata.validity_duration
                    } else {
                        0
                    },
                    active: true,
                };
                
                self.user_badges.insert(*user_idx, Some(badge));
                *self.total_minted.get_mut(badge_type).unwrap_or(&mut 0) += 1;
                Ok(None)
            }
            AcademyAction::RedeemBadge { user_idx, tx_hash: _ } => {
                if self.is_paused {
                    return Err(ContractError::ContractPaused);
                }
                
                if *user_idx >= self.addresses.len() {
                    return Err(ContractError::Unauthorized);
                }
                
                let badge = self.user_badges.get(user_idx)
                    .and_then(|b| b.as_ref())
                    .ok_or(ContractError::UserHasNoBadge)?;
                
                if !badge.active {
                    return Err(ContractError::BadgeNotActive);
                }
                
                if badge.expiry > 0 && 1000 > badge.expiry {
                    return Err(ContractError::BadgeExpired);
                }
                
                if badge.max_redemptions > 0 && badge.redeemed_count >= badge.max_redemptions {
                    return Err(ContractError::RedemptionLimitReached);
                }
                
                Ok(Some(badge.discount_bps))
            }
            AcademyAction::RevokeBadge { user_idx } => {
                if *user_idx >= self.addresses.len() {
                    return Err(ContractError::Unauthorized);
                }
                
                if let Some(Some(badge)) = self.user_badges.get_mut(user_idx) {
                    badge.active = false;
                    Ok(None)
                } else {
                    Err(ContractError::UserHasNoBadge)
                }
            }
            AcademyAction::SetPaused { paused } => {
                self.is_paused = *paused;
                Ok(None)
            }
            AcademyAction::GetUserDiscount { user_idx } => {
                if *user_idx >= self.addresses.len() {
                    return Ok(Some(0));
                }
                
                let discount = self.user_badges.get(user_idx)
                    .and_then(|b| b.as_ref())
                    .map(|badge| {
                        if !badge.active || 
                           (badge.expiry > 0 && 1000 > badge.expiry) ||
                           (badge.max_redemptions > 0 && badge.redeemed_count >= badge.max_redemptions) {
                            0
                        } else {
                            badge.discount_bps
                        }
                    })
                    .unwrap_or(0);
                
                Ok(Some(discount))
            }
            AcademyAction::GetBadgeMetadata { badge_type } => {
                if self.badge_types.contains_key(badge_type) {
                    Ok(None)
                } else {
                    Ok(None) // Still valid to query non-existent badge
                }
            }
        }
    }
}

proptest! {
    #[test]
    fn property_based_academy_invariants(
        actions in prop::collection::vec(any::<AcademyAction>(), 10..50),
    ) {
        let env = Env::default();
        let admin = Address::generate(&env);
        let mut ledger_info = env.ledger().get();
        ledger_info.timestamp = 1000;
        env.ledger().set(ledger_info);
        
        let client = AcademyRewardsContractClient::new(&env, &env.register_contract(None, AcademyRewardsContract {}));
        client.initialize(&admin).unwrap();
        
        let addresses: Vec<Address> = (0..10).map(|_| Address::generate(&env)).collect();
        let mut state = TestState::new(addresses.clone());
        
        for action in actions {
            let result = state.apply_action(&action);
            
            match action {
                AcademyAction::CreateBadgeType { badge_type, discount_bps, max_redemptions, validity_duration } => {
                    let client_result = client.try_create_badge_type(
                        &admin,
                        badge_type,
                        &String::from_str(&env, "TestBadge"),
                        discount_bps,
                        max_redemptions,
                        validity_duration,
                    );
                    
                    if *discount_bps <= 10000 {
                        prop_assert!(client_result.is_ok());
                    } else {
                        prop_assert!(client_result.is_err());
                    }
                }
                AcademyAction::MintBadge { user_idx, badge_type } => {
                    if *user_idx < addresses.len() {
                        let client_result = client.try_mint_badge(&admin, &addresses[*user_idx], badge_type);
                        
                        if let Err(e) = &result {
                            prop_assert!(client_result.is_err());
                        } else {
                            prop_assert!(client_result.is_ok());
                        }
                    }
                }
                AcademyAction::RedeemBadge { user_idx, tx_hash } => {
                    if *user_idx < addresses.len() {
                        let client_result = client.try_redeem_badge(&addresses[*user_idx], &String::from_str(&env, tx_hash));
                        
                        if let Ok(Some(discount)) = result {
                            prop_assert!(client_result.is_ok());
                            if let Ok(actual_discount) = client_result {
                                prop_assert_eq!(actual_discount, discount);
                            }
                        } else {
                            prop_assert!(client_result.is_err());
                        }
                    }
                }
                AcademyAction::RevokeBadge { user_idx } => {
                    if *user_idx < addresses.len() {
                        let client_result = client.try_revoke_badge(&admin, &addresses[*user_idx]);
                        
                        match result {
                            Ok(_) => prop_assert!(client_result.is_ok()),
                            Err(_) => prop_assert!(client_result.is_err()),
                        }
                    }
                }
                AcademyAction::SetPaused { paused } => {
                    let client_result = client.try_set_paused(&admin, paused);
                    prop_assert!(client_result.is_ok());
                }
                AcademyAction::GetUserDiscount { user_idx } => {
                    if *user_idx < addresses.len() {
                        let discount = client.get_user_discount(&addresses[*user_idx]);
                        if let Ok(Some(expected)) = result {
                            prop_assert_eq!(discount, expected);
                        }
                    }
                }
                AcademyAction::GetBadgeMetadata { badge_type } => {
                    let _metadata = client.get_badge_metadata(badge_type);
                    // Should not panic
                }
            }
        }
        
        // Final state verification
        for badge_type in 1..=10 {
            let total_minted = client.get_total_minted(&badge_type);
            prop_assert!(total_minted >= 0);
        }
    }
}

#[test]
fn test_academy_state_machine_invariants() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let mut ledger_info = env.ledger().get();
    ledger_info.timestamp = 1000;
    env.ledger().set(ledger_info);
    
    let client = AcademyRewardsContractClient::new(&env, &env.register_contract(None, AcademyRewardsContract {}));
    client.initialize(&admin).unwrap();
    
    // Create badge types
    client.create_badge_type(&admin, &1, &String::from_str(&env, "Bronze"), &500, &10, &3600).unwrap();
    client.create_badge_type(&admin, &2, &String::from_str(&env, "Silver"), &1000, &5, &7200).unwrap();
    
    let user = Address::generate(&env);
    
    // Test valid mint
    client.mint_badge(&admin, &user, &1).unwrap();
    
    // Test user discount
    let discount = client.get_user_discount(&user);
    assert_eq!(discount, 500);
    
    // Test badge redemption
    let tx_hash = String::from_str(&env, "test_tx_1");
    let redeemed_discount = client.redeem_badge(&user, &tx_hash).unwrap();
    assert_eq!(redeemed_discount, 500);
    
    // Test redemption history
    let history = client.get_redemption_history(&user, &0).unwrap();
    assert_eq!(history.badge_type, 1);
    assert_eq!(history.discount_applied, 500);
    
    // Test revoke badge
    client.revoke_badge(&admin, &user).unwrap();
    let discount_after_revoke = client.get_user_discount(&user);
    assert_eq!(discount_after_revoke, 0);
    
    // Test paused state
    client.set_paused(&admin, &true).unwrap();
    let paused_result = client.try_mint_badge(&admin, &user, &2);
    assert!(paused_result.is_err());
    
    client.set_paused(&admin, &false).unwrap();
    let unpaused_result = client.try_mint_badge(&admin, &user, &2);
    assert!(unpaused_result.is_ok());
}