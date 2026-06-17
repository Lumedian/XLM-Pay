use soroban_sdk::{contracttype, symbol_short, Address, Env};

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReentrancyStatus {
    Inactive = 0,
    Active = 1,
}

pub struct ReentrancyGuard;

impl ReentrancyGuard {
    pub const STATUS_KEY: soroban_sdk::Symbol = symbol_short!("_status");
    pub const ORIGINATOR_KEY: soroban_sdk::Symbol = symbol_short!("_origin");

    pub fn enter(env: &Env) {
        let status: ReentrancyStatus = env
            .storage()
            .persistent()
            .get(&Self::STATUS_KEY)
            .unwrap_or(ReentrancyStatus::Inactive);

        if status == ReentrancyStatus::Active {
            panic!("REENTRANCY_DETECTED");
        }

        let originator = env.invoker();

        env.storage()
            .persistent()
            .set(&Self::STATUS_KEY, &ReentrancyStatus::Active);
        env.storage()
            .persistent()
            .set(&Self::ORIGINATOR_KEY, &originator);
    }

    pub fn exit(env: &Env) {
        env.storage()
            .persistent()
            .set(&Self::STATUS_KEY, &ReentrancyStatus::Inactive);
        let _: Option<Address> = env.storage().persistent().remove(&Self::ORIGINATOR_KEY);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{Env, testutils::Address as _};

    #[test]
    fn test_reentrancy_guard_prevents_reentry() {
        let env = Env::default();
        env.mock_all_auths();

        ReentrancyGuard::enter(&env);

        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            ReentrancyGuard::enter(&env);
        }));

        assert!(result.is_err());
        ReentrancyGuard::exit(&env);
    }
}
