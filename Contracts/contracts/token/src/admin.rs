use crate::storage::get_admin;
use soroban_sdk::Env;

pub fn require_admin(env: &Env) {
    let admin = get_admin(env);
    admin.require_auth();
}
