use soroban_sdk::{
    contract, testutils::Address as _, Address, Env, IntoVal, Symbol,
};
use token::{TokenContract, TokenContractClient};

// Mock contracts for integration testing

#[contract]
struct TokenReceiver {
    token_address: Address,
    received_amount: i128,
    from_address: Address,
}

#[contractimpl]
impl TokenReceiver {
    pub fn __constructor(env: Env, token_address: Address) {
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "token_address"), &token_address);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "received_amount"), &0i128);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "from_address"), &Address::generate(&env));
    }

    pub fn on_token_transfer(env: Env, token: Address, from: Address, amount: i128) {
        let stored_token: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "token_address"))
            .unwrap();
        
        // Verify the token is the expected one
        if token != stored_token {
            panic!("Unexpected token");
        }

        let mut received_amount: i128 = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "received_amount"))
            .unwrap_or(0i128);
        
        received_amount += amount;
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "received_amount"), &received_amount);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "from_address"), &from);

        // Emit event for testing
        env.events()
            .publish((Symbol::new(&env, "token_received"), from), amount);
    }

    pub fn get_received_amount(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&Symbol::new(&env, "received_amount"))
            .unwrap_or(0i128)
    }

    pub fn get_from_address(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&Symbol::new(&env, "from_address"))
            .unwrap()
    }
}

#[contract]
struct TokenSpender {
    token_address: Address,
    owner: Address,
}

#[contractimpl]
impl TokenSpender {
    pub fn __constructor(env: Env, token_address: Address, owner: Address) {
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "token_address"), &token_address);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "owner"), &owner);
    }

    pub fn spend_tokens(env: Env, to: Address, amount: i128) {
        let token_address: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "token_address"))
            .unwrap();
        let owner: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "owner"))
            .unwrap();

        let client = TokenContractClient::new(&env, &token_address);
        client.transfer_from(&env.current_contract_address(), &owner, &to, &amount);
    }

    pub fn spend_and_burn(env: Env, amount: i128) {
        let token_address: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "token_address"))
            .unwrap();
        let owner: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "owner"))
            .unwrap();

        let client = TokenContractClient::new(&env, &token_address);
        client.burn_from(&env.current_contract_address(), &owner, &amount);
    }
}

// Integration tests for token contract with other contracts

#[cfg(test)]
mod integration_tests {
    use super::*;

    #[test]
    fn test_token_receiver_integration() {
        let env = Env::default();
        env.mock_all_auths();

        // Deploy token contract
        let token_id = env.register_contract(None, TokenContract);
        let token_client = TokenContractClient::new(&env, &token_id);

        // Deploy receiver contract
        let receiver_id = env.register_contract(None, TokenReceiver);
        let receiver_client = token_receiver::TokenReceiverClient::new(&env, &receiver_id);

        let admin = Address::generate(&env);
        let user = Address::generate(&env);

        // Initialize token
        token_client.initialize(
            &admin,
            &"Test Token".into_val(&env),
            &"TEST".into_val(&env),
            &7,
        );

        // Initialize receiver
        receiver_client.__constructor(&token_id);

        // Mint tokens to user
        token_client.mint(&user, &1000);

        // Transfer tokens to receiver contract
        token_client.transfer(&user, &receiver_id, &500);

        // Verify receiver got the tokens
        assert_eq!(receiver_client.get_received_amount(), 500);
        assert_eq!(receiver_client.get_from_address(), user);

        // Verify token balances
        assert_eq!(token_client.balance(&user), 500);
        assert_eq!(token_client.balance(&receiver_id), 500);
    }

    #[test]
    fn test_token_spender_integration() {
        let env = Env::default();
        env.mock_all_auths();

        // Deploy token contract
        let token_id = env.register_contract(None, TokenContract);
        let token_client = TokenContractClient::new(&env, &token_id);

        // Deploy spender contract
        let spender_id = env.register_contract(None, TokenSpender);
        let spender_client = token_spender::TokenSpenderClient::new(&env, &spender_id);

        let admin = Address::generate(&env);
        let owner = Address::generate(&env);
        let recipient = Address::generate(&env);

        // Initialize token
        token_client.initialize(
            &admin,
            &"Test Token".into_val(&env),
            &"TEST".into_val(&env),
            &7,
        );

        // Initialize spender
        spender_client.__constructor(&token_id, &owner);

        // Mint tokens to owner
        token_client.mint(&owner, &1000);

        // Approve spender contract
        let current_ledger = env.ledger().sequence();
        token_client.approve(&owner, &spender_id, &500, &(current_ledger + 1000));

        // Spender transfers tokens
        spender_client.spend_tokens(&recipient, &200);

        // Verify balances
        assert_eq!(token_client.balance(&owner), 800);
        assert_eq!(token_client.balance(&recipient), 200);
        assert_eq!(token_client.allowance(&owner, &spender_id), 300);

        // Spender burns tokens
        spender_client.spend_and_burn(&100);

        // Verify burn
        assert_eq!(token_client.balance(&owner), 700);
        assert_eq!(token_client.total_supply(), 900);
        assert_eq!(token_client.allowance(&owner, &spender_id), 200);
    }

    #[test]
    fn test_multi_contract_interaction() {
        let env = Env::default();
        env.mock_all_auths();

        // Deploy token contract
        let token_id = env.register_contract(None, TokenContract);
        let token_client = TokenContractClient::new(&env, &token_id);

        // Deploy receiver and spender contracts
        let receiver_id = env.register_contract(None, TokenReceiver);
        let receiver_client = token_receiver::TokenReceiverClient::new(&env, &receiver_id);

        let spender_id = env.register_contract(None, TokenSpender);
        let spender_client = TokenSpenderClient::new(&env, &spender_id);

        let admin = Address::generate(&env);
        let user = Address::generate(&env);
        let final_recipient = Address::generate(&env);

        // Initialize all contracts
        token_client.initialize(
            &admin,
            &"Test Token".into_val(&env),
            &"TEST".into_val(&env),
            &7,
        );

        receiver_client.__constructor(&token_id);
        spender_client.__constructor(&token_id, &receiver_id);

        // Mint tokens to user
        token_client.mint(&user, &1000);

        // User transfers to receiver
        token_client.transfer(&user, &receiver_id, &400);
        assert_eq!(receiver_client.get_received_amount(), 400);

        // Receiver approves spender to use its tokens
        let current_ledger = env.ledger().sequence();
        token_client.approve(&receiver_id, &spender_id, &200, &(current_ledger + 1000));

        // Spender transfers from receiver to final recipient
        spender_client.spend_tokens(&final_recipient, &150);

        // Verify final state
        assert_eq!(token_client.balance(&user), 600);
        assert_eq!(token_client.balance(&receiver_id), 250);
        assert_eq!(token_client.balance(&final_recipient), 150);
        assert_eq!(token_client.allowance(&receiver_id, &spender_id), 50);

        // Verify total supply is conserved
        assert_eq!(token_client.total_supply(), 1000);
    }
}
