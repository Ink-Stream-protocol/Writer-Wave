#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

fn setup() -> (Env, Address, Address, Address, String) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, InkStreamContract);
    let author = Address::generate(&env);
    let reader = Address::generate(&env);
    let title = String::from_str(&env, "The Rust Chronicles");

    (env, contract_id, author, reader, title)
}

#[test]
fn test_publish_and_get() {
    let (env, contract_id, author, _reader, title) = setup();
    let client = InkStreamContractClient::new(&env, &contract_id);

    client.publish(&author, &title, &1_000_000, &100);

    let meta = client.get_novel(&title).unwrap();
    assert_eq!(meta.price_full, 1_000_000);
    assert_eq!(meta.drip_rate, 100);
}

#[test]
fn test_buy_full_marks_owned() {
    let (env, contract_id, author, reader, title) = setup();
    let client = InkStreamContractClient::new(&env, &contract_id);

    // Deploy a mock token and mint to reader
    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(token_admin.clone()).address();
    let token_client = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);
    token_client.mint(&reader, &10_000_000);

    client.publish(&author, &title, &1_000_000, &100);
    client.buy_full(&reader, &title, &token_id);

    assert!(client.is_owned(&reader, &title));
}
