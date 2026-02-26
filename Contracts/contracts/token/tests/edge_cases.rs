use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, Address, Env, IntoVal};
use token::{TokenContract, TokenContractClient};

#[cfg(test)]
mod edge_case_tests {
    use super::*;

    #[test]
    fn test_zero_amount_transfers() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenContract);
        let client = TokenContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let user1 = Address::generate(&env);
        let user2 = Address::generate(&env);

        client.initialize(
            &admin,
            &"Stellara Token".into_val(&env),
            &"STLR".into_val(&env),
            &7,
        );

        client.mint(&user1, &1000);

        // Test zero amount transfer
        client.transfer(&user1, &user2, &0);
        assert_eq!(client.balance(&user1), 1000);
        assert_eq!(client.balance(&user2), 0);

        // Test zero amount transfer_from
        let current_ledger = env.ledger().sequence();
        client.approve(&user1, &admin, &100, &(current_ledger + 10));
        client.transfer_from(&admin, &user1, &user2, &0);
        assert_eq!(client.balance(&user1), 1000);
        assert_eq!(client.balance(&user2), 0);

        // Test zero amount burn
        client.burn(&user1, &0);
        assert_eq!(client.balance(&user1), 1000);

        // Test zero amount mint
        client.mint(&user2, &0);
        assert_eq!(client.balance(&user2), 0);
    }

    #[test]
    fn test_self_transfers() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenContract);
        let client = TokenContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let user = Address::generate(&env);

        client.initialize(
            &admin,
            &"Stellara Token".into_val(&env),
            &"STLR".into_val(&env),
            &7,
        );

        client.mint(&user, &1000);

        // Test self transfer
        client.transfer(&user, &user, &500);
        assert_eq!(client.balance(&user), 1000); // Should remain unchanged

        // Test self transfer_from
        let current_ledger = env.ledger().sequence();
        client.approve(&user, &admin, &300, &(current_ledger + 10));
        client.transfer_from(&admin, &user, &user, &200);
        assert_eq!(client.balance(&user), 1000); // Should remain unchanged
    }

    #[test]
    fn test_maximum_values() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenContract);
        let client = TokenContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let user1 = Address::generate(&env);
        let user2 = Address::generate(&env);

        client.initialize(
            &admin,
            &"Stellara Token".into_val(&env),
            &"STLR".into_val(&env),
            &7,
        );

        // Test maximum mint
        client.mint(&user1, &i128::MAX);
        assert_eq!(client.balance(&user1), i128::MAX);
        assert_eq!(client.total_supply(), i128::MAX);

        // Test maximum allowance
        let current_ledger = env.ledger().sequence();
        client.approve(&user1, &user2, &i128::MAX, &(current_ledger + 1000));
        assert_eq!(client.allowance(&user1, &user2), i128::MAX);

        // Test maximum expiration
        client.approve(&user1, &user2, &100, &u32::MAX);
        assert_eq!(client.allowance(&user1, &user2), 100);
    }

    #[test]
    fn test_minimum_values() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenContract);
        let client = TokenContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let user1 = Address::generate(&env);
        let user2 = Address::generate(&env);

        client.initialize(
            &admin,
            &"Stellara Token".into_val(&env),
            &"STLR".into_val(&env),
            &7,
        );

        // Test minimum positive mint
        client.mint(&user1, &1);
        assert_eq!(client.balance(&user1), 1);

        // Test minimum positive transfer
        client.transfer(&user1, &user2, &1);
        assert_eq!(client.balance(&user1), 0);
        assert_eq!(client.balance(&user2), 1);

        // Test minimum positive allowance
        let current_ledger = env.ledger().sequence();
        client.approve(&user2, &user1, &1, &(current_ledger + 1));
        assert_eq!(client.allowance(&user2, &user1), 1);
    }

    #[test]
    fn test_edge_case_expirations() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenContract);
        let client = TokenContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let owner = Address::generate(&env);
        let spender = Address::generate(&env);

        client.initialize(
            &admin,
            &"Stellara Token".into_val(&env),
            &"STLR".into_val(&env),
            &7,
        );

        client.mint(&owner, &1000);

        let current_ledger = env.ledger().sequence();

        // Test allowance that expires in next block
        client.approve(&owner, &spender, &500, &(current_ledger + 1));
        assert_eq!(client.allowance(&owner, &spender), 500);

        // Advance ledger to expire allowance
        let mut ledger_info = env.ledger().get();
        ledger_info.sequence_number = current_ledger + 1;
        env.ledger().set(ledger_info);
        assert_eq!(client.allowance(&owner, &spender), 0);

        // Test allowance with expiration in current block (should be valid)
        client.approve(&owner, &spender, &300, &current_ledger);
        assert_eq!(client.allowance(&owner, &spender), 300);

        // Test allowance with expiration in past (should be treated as zero)
        client.approve(&owner, &spender, &200, &(current_ledger - 1));
        assert_eq!(client.allowance(&owner, &spender), 0);
    }

    #[test]
    fn test_unauthorized_operations() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenContract);
        let client = TokenContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let user = Address::generate(&env);
        let unauthorized_user = Address::generate(&env);

        client.initialize(
            &admin,
            &"Stellara Token".into_val(&env),
            &"STLR".into_val(&env),
            &7,
        );

        client.mint(&user, &1000);

        // Deauthorize user
        client.set_authorized(&user, &false);
        assert!(!client.authorized(&user));

        // Try to transfer from unauthorized user (should fail)
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.transfer(&user, &unauthorized_user, &100);
        }));
        assert!(result.is_err());

        // Try to burn from unauthorized user (should fail)
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.burn(&user, &100);
        }));
        assert!(result.is_err());

        // Reauthorize user
        client.set_authorized(&user, &true);
        assert!(client.authorized(&user));

        // Now transfers should work
        client.transfer(&user, &unauthorized_user, &100);
        assert_eq!(client.balance(&user), 900);
        assert_eq!(client.balance(&unauthorized_user), 100);
    }

    #[test]
    fn test_multiple_allowances() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenContract);
        let client = TokenContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let owner = Address::generate(&env);
        let spender1 = Address::generate(&env);
        let spender2 = Address::generate(&env);
        let spender3 = Address::generate(&env);

        client.initialize(
            &admin,
            &"Stellara Token".into_val(&env),
            &"STLR".into_val(&env),
            &7,
        );

        client.mint(&owner, &1000);

        let current_ledger = env.ledger().sequence();

        // Set up multiple allowances
        client.approve(&owner, &spender1, &200, &(current_ledger + 100));
        client.approve(&owner, &spender2, &300, &(current_ledger + 200));
        client.approve(&owner, &spender3, &400, &(current_ledger + 300));

        assert_eq!(client.allowance(&owner, &spender1), 200);
        assert_eq!(client.allowance(&owner, &spender2), 300);
        assert_eq!(client.allowance(&owner, &spender3), 400);

        // Use allowances independently
        let recipient = Address::generate(&env);
        client.transfer_from(&spender1, &owner, &recipient, &100);
        assert_eq!(client.allowance(&owner, &spender1), 100);
        assert_eq!(client.allowance(&owner, &spender2), 300); // Unchanged
        assert_eq!(client.allowance(&owner, &spender3), 400); // Unchanged

        client.transfer_from(&spender2, &owner, &recipient, &150);
        assert_eq!(client.allowance(&owner, &spender1), 100); // Unchanged
        assert_eq!(client.allowance(&owner, &spender2), 150);
        assert_eq!(client.allowance(&owner, &spender3), 400); // Unchanged
    }

    #[test]
    fn test_concurrent_operations() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenContract);
        let client = TokenContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let user1 = Address::generate(&env);
        let user2 = Address::generate(&env);
        let user3 = Address::generate(&env);

        client.initialize(
            &admin,
            &"Stellara Token".into_val(&env),
            &"STLR".into_val(&env),
            &7,
        );

        // Set up initial state
        client.mint(&user1, &500);
        client.mint(&user2, &300);
        client.mint(&user3, &200);

        let current_ledger = env.ledger().sequence();

        // Set up allowances
        client.approve(&user1, &user2, &200, &(current_ledger + 100));
        client.approve(&user2, &user3, &150, &(current_ledger + 100));

        // Perform multiple operations
        client.transfer(&user1, &user2, &100);
        client.transfer_from(&user2, &user1, &user3, &50);
        client.transfer(&user3, &user1, &75);

        // Verify final state
        assert_eq!(client.balance(&user1), 425); // 500 - 100 + 75
        assert_eq!(client.balance(&user2), 350); // 300 + 100 - 50
        assert_eq!(client.balance(&user3), 175); // 200 + 50 - 75

        // Verify total supply is conserved
        assert_eq!(client.total_supply(), 1000);

        // Verify remaining allowances
        assert_eq!(client.allowance(&user1, &user2), 200); // Unchanged
        assert_eq!(client.allowance(&user2, &user3), 100); // 150 - 50
    }

    #[test]
    fn test_extreme_decimal_values() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenContract);
        let client = TokenContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let user = Address::generate(&env);

        // Test with maximum decimals (18)
        client.initialize(
            &admin,
            &"High Precision Token".into_val(&env),
            &"HPT".into_val(&env),
            &18,
        );

        assert_eq!(client.decimals(), 18);
        assert_eq!(client.name(), "High Precision Token".into_val(&env));
        assert_eq!(client.symbol(), "HPT".into_val(&env));

        // Test with minimum decimals (0)
        let contract_id2 = env.register_contract(None, TokenContract);
        let client2 = TokenContractClient::new(&env, &contract_id2);

        client2.initialize(
            &admin,
            &"Whole Token".into_val(&env),
            &"WHOLE".into_val(&env),
            &0,
        );

        assert_eq!(client2.decimals(), 0);
        assert_eq!(client2.name(), "Whole Token".into_val(&env));
        assert_eq!(client2.symbol(), "WHOLE".into_val(&env));
    }

    #[test]
    fn test_empty_and_long_names() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenContract);
        let client = TokenContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);

        // Test with very long name and symbol
        let long_name = "A".repeat(1000);
        let long_symbol = "B".repeat(100);

        client.initialize(
            &admin,
            &long_name.as_str().into_val(&env),
            &long_symbol.as_str().into_val(&env),
            &7,
        );

        assert_eq!(client.name(), long_name.as_str().into_val(&env));
        assert_eq!(client.symbol(), long_symbol.as_str().into_val(&env));
    }

    #[test]
    fn test_burn_all_supply() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenContract);
        let client = TokenContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let user = Address::generate(&env);

        client.initialize(
            &admin,
            &"Stellara Token".into_val(&env),
            &"STLR".into_val(&env),
            &7,
        );

        client.mint(&user, &1000);

        // Burn all tokens
        client.burn(&user, &1000);
        assert_eq!(client.balance(&user), 0);
        assert_eq!(client.total_supply(), 0);

        // Try to burn more (should fail)
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.burn(&user, &1);
        }));
        assert!(result.is_err());
    }

    #[test]
    fn test_admin_operations_edge_cases() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenContract);
        let client = TokenContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let new_admin = Address::generate(&env);
        let user = Address::generate(&env);

        client.initialize(
            &admin,
            &"Stellara Token".into_val(&env),
            &"STLR".into_val(&env),
            &7,
        );

        // Test admin self-transfer
        client.set_admin(&admin);
        assert_eq!(client.admin(), admin);

        // Test admin change
        client.set_admin(&new_admin);
        assert_eq!(client.admin(), new_admin);

        // Test clawback from zero balance
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.clawback(&user, &100);
        }));
        assert!(result.is_err());

        // Test clawback with zero amount
        client.mint(&user, &100);
        client.clawback(&user, &0);
        assert_eq!(client.balance(&user), 100);
    }
}
