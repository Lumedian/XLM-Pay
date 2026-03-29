use soroban_sdk::{Address, Env, Symbol, Vec, IntoVal};

pub struct ReputationManager;

impl ReputationManager {
    pub fn add_score(env: &Env, reputation_id: &Address, user: &Address, amount: i32) {
        let args: Vec<soroban_sdk::Val> = (env.current_contract_address(), user.clone(), amount).into_val(env);
        env.invoke_contract::<()>(
            reputation_id,
            &Symbol::new(env, "add_score"),
            args,
        );
    }

    pub fn get_fee_discount(env: &Env, reputation_id: &Address, user: &Address) -> u32 {
        let args: Vec<soroban_sdk::Val> = (user.clone(),).into_val(env);
        env.invoke_contract::<u32>(
            reputation_id,
            &Symbol::new(env, "get_fee_discount"),
            args,
        )
    }

    pub fn get_trading_limit_multiplier(env: &Env, reputation_id: &Address, user: &Address) -> u32 {
        let args: Vec<soroban_sdk::Val> = (user.clone(),).into_val(env);
        env.invoke_contract::<u32>(
            reputation_id,
            &Symbol::new(env, "get_trading_limit_multiplier"),
            args,
        )
    }
}
