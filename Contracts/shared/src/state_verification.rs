use soroban_sdk::{contracttype, symbol_short, Address, Bytes, BytesN, Env, Error, IntoVal, Map, Symbol, Val, Vec};

#[contracttype]
#[derive(Clone)]
pub struct StateProof {
    pub contract: Address,
    pub key: Symbol,
    pub subject: Val,
    pub digest: BytesN<32>,
    pub ledger: u32,
}

fn compute_payload(env: &Env, contract: &Address, key: &Symbol, subject: &Val, ledger: u32) -> Bytes {
    let mut v = Vec::new(env);
    v.push_back(contract.clone().into_val(env));
    v.push_back(key.clone().into_val(env));
    v.push_back(subject.clone());
    v.push_back(ledger.into_val(env));
    env.serialize(&v)
}

pub fn compute_commitment(env: &Env, contract: &Address, key: &Symbol, subject: &Val, ledger: u32) -> BytesN<32> {
    let payload = compute_payload(env, contract, key, subject, ledger);
    env.crypto().sha256(&payload)
}

fn trust_key() -> Symbol {
    symbol_short!("trusted")
}

pub fn trust_add(env: &Env, contract: &Address) {
    let key = trust_key();
    let mut set: Map<Address, bool> = env.storage().persistent().get(&key).unwrap_or_else(|| Map::new(env));
    set.set(contract.clone(), true);
    env.storage().persistent().set(&key, &set);
}

pub fn trust_remove(env: &Env, contract: &Address) {
    let key = trust_key();
    let mut set: Map<Address, bool> = env.storage().persistent().get(&key).unwrap_or_else(|| Map::new(env));
    set.remove(contract.clone());
    env.storage().persistent().set(&key, &set);
}

pub fn is_trusted(env: &Env, contract: &Address) -> bool {
    let key = trust_key();
    let set: Map<Address, bool> = env.storage().persistent().get(&key).unwrap_or_else(|| Map::new(env));
    set.get(contract.clone()).unwrap_or(false)
}

pub fn verify_with_contract(env: &Env, contract: &Address, key: &Symbol, subject: &Val) -> bool {
    if !is_trusted(env, contract) {
        return false;
    }
    let f = Symbol::new(env, "state_commitment");
    let mut args = Vec::new(env);
    args.push_back(key.clone().into_val(env));
    args.push_back(subject.clone());
    let res: Result<BytesN<32>, Error> = env.try_invoke_contract(contract, &f, args);
    match res {
        Ok(remote_digest) => {
            let digest = compute_commitment(env, contract, key, subject, env.ledger().sequence());
            remote_digest == digest
        }
        Err(_) => false,
    }
}

pub fn make_proof(env: &Env, contract: &Address, key: &Symbol, subject: &Val) -> StateProof {
    let ledger = env.ledger().sequence();
    let digest = compute_commitment(env, contract, key, subject, ledger);
    StateProof {
        contract: contract.clone(),
        key: key.clone(),
        subject: subject.clone(),
        digest,
        ledger,
    }
}

pub fn verify_proof(env: &Env, proof: &StateProof) -> bool {
    if !is_trusted(env, &proof.contract) {
        return false;
    }
    let expected = compute_commitment(env, &proof.contract, &proof.key, &proof.subject, env.ledger().sequence());
    proof.digest == expected
}
