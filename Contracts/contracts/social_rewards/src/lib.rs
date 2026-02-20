#![no_std]
#![allow(unexpected_cfgs)]
use soroban_sdk::{contract, contractimpl, Address, Env};

#[contract]
pub struct SocialRewardsContract;

#[contractimpl]
impl SocialRewardsContract {
    /// Adds a reward. Fails if amount is 0 (to simulate validation logic).
    pub fn add_reward(_env: Env, _user: Address, amount: i128) {
        if amount <= 0 {
            panic!("Invalid reward amount");
        }
        // Logic to store reward would go here.
        // For testing, we just succeed or panic.
    }
}
