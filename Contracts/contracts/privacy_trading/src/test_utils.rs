#![cfg(test)]

use soroban_sdk::{contract, contractimpl, Address, Env, BytesN};
use shared::privacy::{MerkleProof, MerkleRoot, PrivacyPool, PrivacyPoolConfig};

// Mock Token Contract that implements the necessary interface
#[contract]
pub struct MockTokenContract;

#[contractimpl]
impl MockTokenContract {
    pub fn initialize(env: Env, _admin: Address) {
        let config = PrivacyPoolConfig {
            token: env.current_contract_address(),
            tree_depth: 20,
            min_deposit: 1,
            max_deposit: i128::MAX,
            deposit_fee_bps: 0,
            withdrawal_fee_bps: 0,
        };
        PrivacyPool::initialize(&env, &config);
    }

    pub fn deposit(env: Env, _from: Address, amount: i128, commitment: BytesN<32>) -> u32 {
        PrivacyPool::deposit(&env, &commitment, amount).unwrap()
    }

    pub fn merkle_root(env: Env) -> MerkleRoot {
        PrivacyPool::get_root(&env)
    }

    pub fn generate_proof(env: Env, index: u32) -> Option<MerkleProof> {
        PrivacyPool::generate_proof(&env, index)
    }
}
