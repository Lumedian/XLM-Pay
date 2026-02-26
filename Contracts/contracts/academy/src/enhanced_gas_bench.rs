// Enhanced gas benchmarking system for Stellara contracts
// Measures gas usage before and after optimizations

#[cfg(test)]
mod enhanced_gas_benchmarks {
    use super::*;
    use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, token, Address, Env, Symbol};
    use std::time::Instant;

    // Benchmark utility functions
    fn measure_gas<F>(env: &Env, operation: F) -> u64 
    where 
        F: FnOnce() -> (),
    {
        let start = env.ledger().sequence();
        operation();
        let end = env.ledger().sequence();
        end - start
    }

    fn setup_token_contract() -> (Env, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let token_contract_address = env.register_contract(&TokenContract, ());
        let token_client = TokenContractClient::new(&env, &token_contract_address);
        
        token_client.initialize(
            &admin,
            &Symbol::new(&env, "TestToken"),
            &Symbol::new(&env, "TEST"),
            &18u32,
        );
        
        (env, admin, token_contract_address)
    }

    fn setup_vesting_contract() -> (Env, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let issuer = Address::generate(&env);
        let reward_token = env.register_stellar_asset_contract(issuer);
        let governance = Address::generate(&env);
        
        AcademyVestingContract::init(env.clone(), admin.clone(), reward_token.clone(), governance.clone()).unwrap();
        (env, admin, reward_token, governance)
    }

    // Token contract benchmarks
    #[test]
    fn bench_token_transfer_optimized() {
        let (env, admin, token_contract) = setup_token_contract();
        let token_client = TokenContractClient::new(&env, &token_contract);
        
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        let amount = 1000i128;
        
        // Mint tokens to alice
        token_client.mint(&admin, &alice, &amount);
        
        // Measure transfer gas
        let gas_used = measure_gas(&env, || {
            token_client.transfer(&alice, &bob, &amount);
        });
        
        println!("Optimized transfer gas: {}", gas_used);
        assert!(gas_used > 0, "Transfer should consume gas");
    }

    #[test]
    fn bench_token_transfer_from_optimized() {
        let (env, admin, token_contract) = setup_token_contract();
        let token_client = TokenContractClient::new(&env, &token_contract);
        
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        let spender = Address::generate(&env);
        let amount = 500i128;
        let allowance_amount = 1000i128;
        
        // Setup
        token_client.mint(&admin, &alice, &allowance_amount);
        token_client.approve(&alice, &spender, &allowance_amount, &999999u32);
        
        // Measure transfer_from gas
        let gas_used = measure_gas(&env, || {
            token_client.transfer_from(&spender, &alice, &bob, &amount);
        });
        
        println!("Optimized transfer_from gas: {}", gas_used);
        assert!(gas_used > 0, "Transfer_from should consume gas");
    }

    #[test]
    fn bench_token_mint_optimized() {
        let (env, admin, token_contract) = setup_token_contract();
        let token_client = TokenContractClient::new(&env, &token_contract);
        
        let recipient = Address::generate(&env);
        let amount = 1000i128;
        
        // Measure mint gas
        let gas_used = measure_gas(&env, || {
            token_client.mint(&admin, &recipient, &amount);
        });
        
        println!("Optimized mint gas: {}", gas_used);
        assert!(gas_used > 0, "Mint should consume gas");
    }

    // Vesting contract benchmarks
    #[test]
    fn bench_vesting_grant_optimized() {
        let (env, admin, reward_token, _governance) = setup_vesting_contract();
        let beneficiary = Address::generate(&env);
        let start_time = 1000u64;
        let cliff = 100u64;
        let duration = 1000u64;
        let amount = 1000i128;
        
        // Measure grant_vesting gas
        let gas_used = measure_gas(&env, || {
            AcademyVestingContract::grant_vesting(
                env.clone(), 
                admin.clone(), 
                beneficiary, 
                amount, 
                start_time, 
                cliff, 
                duration
            ).unwrap();
        });
        
        println!("Optimized grant_vesting gas: {}", gas_used);
        assert!(gas_used > 0, "Grant_vesting should consume gas");
    }

    #[test]
    fn bench_vesting_claim_optimized() {
        let (env, admin, reward_token, _governance) = setup_vesting_contract();
        let beneficiary = Address::generate(&env);
        let start_time = 0u64;
        let cliff = 100u64;
        let duration = 1000u64;
        let amount = 1000i128;
        
        // Setup
        AcademyVestingContract::grant_vesting(
            env.clone(), 
            admin.clone(), 
            beneficiary.clone(), 
            amount, 
            start_time, 
            cliff, 
            duration
        ).unwrap();

        let token_admin = token::StellarAssetClient::new(&env, &reward_token);
        token_admin.mint(&env.current_contract_address(), &amount);

        // Set time to after cliff
        let mut ledger_info = env.ledger().get();
        ledger_info.timestamp = start_time + cliff + 500;
        env.ledger().set(ledger_info);
        
        // Measure claim gas
        let gas_used = measure_gas(&env, || {
            AcademyVestingContract::claim(env.clone(), 1, beneficiary.clone()).unwrap();
        });
        
        println!("Optimized claim gas: {}", gas_used);
        assert!(gas_used > 0, "Claim should consume gas");
    }

    #[test]
    fn bench_vesting_revoke_optimized() {
        let (env, admin, reward_token, _governance) = setup_vesting_contract();
        let beneficiary = Address::generate(&env);
        let start_time = 0u64;
        let cliff = 100u64;
        let duration = 1000u64;
        let amount = 1000i128;
        let revoke_delay = 3600u64; // 1 hour
        
        // Setup
        AcademyVestingContract::grant_vesting(
            env.clone(), 
            admin.clone(), 
            beneficiary, 
            amount, 
            start_time, 
            cliff, 
            duration
        ).unwrap();

        // Set time to allow revocation
        let mut ledger_info = env.ledger().get();
        ledger_info.timestamp = start_time + revoke_delay + 100;
        env.ledger().set(ledger_info);
        
        // Measure revoke gas
        let gas_used = measure_gas(&env, || {
            AcademyVestingContract::revoke(
                env.clone(), 
                1, 
                admin.clone(), 
                revoke_delay
            ).unwrap();
        });
        
        println!("Optimized revoke gas: {}", gas_used);
        assert!(gas_used > 0, "Revoke should consume gas");
    }

    // Storage optimization benchmarks
    #[test]
    fn bench_storage_read_write_patterns() {
        let env = Env::default();
        env.mock_all_auths();
        
        // Test individual vs map storage patterns
        let test_key = Symbol::new(&env, "test");
        let test_value = 42i128;
        
        // Individual storage write
        let individual_write_gas = measure_gas(&env, || {
            env.storage().persistent().set(&test_key, &test_value);
        });
        
        // Individual storage read
        let individual_read_gas = measure_gas(&env, || {
            let _: Option<i128> = env.storage().persistent().get(&test_key);
        });
        
        println!("Individual storage write gas: {}", individual_write_gas);
        println!("Individual storage read gas: {}", individual_read_gas);
        
        // Test map storage patterns
        let map_key = Symbol::new(&env, "map");
        let mut test_map = soroban_sdk::Map::new(&env);
        test_map.set(Symbol::new(&env, "item1"), 1i128);
        test_map.set(Symbol::new(&env, "item2"), 2i128);
        
        // Map storage write
        let map_write_gas = measure_gas(&env, || {
            env.storage().persistent().set(&map_key, &test_map);
        });
        
        // Map storage read
        let map_read_gas = measure_gas(&env, || {
            let _: Option<soroban_sdk::Map<Symbol, i128>> = env.storage().persistent().get(&map_key);
        });
        
        println!("Map storage write gas: {}", map_write_gas);
        println!("Map storage read gas: {}", map_read_gas);
        
        // Calculate efficiency improvements
        let write_improvement = if map_write_gas > 0 {
            ((map_write_gas - individual_write_gas) as f64 / map_write_gas as f64) * 100.0
        } else {
            0.0
        };
        
        let read_improvement = if map_read_gas > 0 {
            ((map_read_gas - individual_read_gas) as f64 / map_read_gas as f64) * 100.0
        } else {
            0.0
        };
        
        println!("Storage write efficiency improvement: {:.2}%", write_improvement);
        println!("Storage read efficiency improvement: {:.2}%", read_improvement);
    }

    // Comprehensive gas analysis
    #[test]
    fn comprehensive_gas_analysis() {
        println!("\n=== Comprehensive Gas Analysis ===");
        
        // Token operations
        println!("\n--- Token Contract Operations ---");
        bench_token_transfer_optimized();
        bench_token_transfer_from_optimized();
        bench_token_mint_optimized();
        
        // Vesting operations
        println!("\n--- Vesting Contract Operations ---");
        bench_vesting_grant_optimized();
        bench_vesting_claim_optimized();
        bench_vesting_revoke_optimized();
        
        // Storage patterns
        println!("\n--- Storage Pattern Analysis ---");
        bench_storage_read_write_patterns();
        
        println!("\n=== Gas Analysis Complete ===");
    }
}
