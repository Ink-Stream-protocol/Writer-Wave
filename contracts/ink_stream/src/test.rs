#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, Env, String,
};
use writer_wave::{WriterWave, WriterWaveClient};

const T0: u64 = 1_000_000;
const XLM: i128 = 10_000_000; // 1 token = 10^7 base units

struct S<'a> {
    env: Env,
    ink: InkStreamClient<'a>,
    wave: WriterWaveClient<'a>,
    token: TokenClient<'a>,
    author: Address,
    reader: Address,
}

fn setup() -> S<'static> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|l| l.timestamp = T0);
    let admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(Address::generate(&env)).address();
    let wave = WriterWaveClient::new(&env, &env.register(WriterWave, (admin.clone(),)));
    let ink_id = env.register(InkStream, (admin.clone(), sac.clone(), Some(wave.address.clone())));
    wave.set_reporter(&ink_id, &true);
    wave.start_cycle(&String::from_str(&env, "Sprint 1"), &T0, &(T0 + 28 * DAY), &sac);

    let author = Address::generate(&env);
    let reader = Address::generate(&env);
    StellarAssetClient::new(&env, &sac).mint(&reader, &(1_000 * XLM));
    S { ink: InkStreamClient::new(&env, &ink_id), token: TokenClient::new(&env, &sac), env, wave, author, reader }
}

fn s(env: &Env, v: &str) -> String {
    String::from_str(env, v)
}

fn err(e: Error) -> soroban_sdk::Error {
    soroban_sdk::Error::from_contract_error(e as u32)
}

/// 20 XLM to own, 0.01 XLM per second (so 2,000 s of streaming = ownership), 10% royalty.
fn publish(t: &S) -> u32 {
    t.ink.publish(&t.author, &s(&t.env, "The Rust Chronicles"), &s(&t.env, "A borrow-checker saga"), &s(&t.env, ""), &(20 * XLM), &(XLM / 100), &1_000, &1)
}

fn at(t: &S, secs: u64) {
    t.env.ledger().with_mut(|l| l.timestamp = T0 + secs);
}

#[test]
fn publish_and_chapters_award_wave_points_once_per_day() {
    let t = setup();
    let id = publish(&t);
    assert_eq!(t.ink.novel(&id).title, s(&t.env, "The Rust Chronicles"));
    assert!(t.ink.is_owned(&t.author, &id));

    assert_eq!(t.ink.add_chapter(&id, &s(&t.env, "Ch 1"), &s(&t.env, "It was a dark and stormy compile.")), 0);
    assert_eq!(t.ink.add_chapter(&id, &s(&t.env, "Ch 2"), &s(&t.env, "...")), 1); // same day: no extra points
    assert_eq!(t.wave.points_of(&1, &t.author), 100);
    at(&t, DAY);
    t.ink.add_chapter(&id, &s(&t.env, "Ch 3"), &s(&t.env, "..."));
    assert_eq!(t.wave.points_of(&1, &t.author), 200);
    assert_eq!(t.ink.novel(&id).chapters, 3);
    assert_eq!(t.ink.chapter(&id, &0).title, s(&t.env, "Ch 1"));
    assert_eq!(t.ink.try_chapter(&id, &9), Err(Ok(err(Error::ChapterNotFound))));
}

#[test]
fn buy_forever_pays_author_and_records_ownership() {
    let t = setup();
    let id = publish(&t);
    assert_eq!(t.ink.buy(&t.reader, &id), 20 * XLM);
    assert_eq!(t.token.balance(&t.author), 20 * XLM);
    assert!(t.ink.is_owned(&t.reader, &id));
    assert_eq!(t.ink.try_buy(&t.reader, &id), Err(Ok(err(Error::AlreadyOwned))));
    assert_eq!(t.ink.novel(&id).sales, 1);
    assert_eq!(t.wave.points_of(&1, &t.author), 50); // Purchase
}

#[test]
fn list_novels_newest_first() {
    let t = setup();
    for _ in 0..3 {
        publish(&t);
    }
    let l = t.ink.list_novels(&0, &2);
    assert_eq!((l.get(0).unwrap().id, l.get(1).unwrap().id), (3, 2));
    assert_eq!(t.ink.list_novels(&2, &10).len(), 1);
    assert_eq!(t.ink.novel_count(), 3);
}

#[test]
fn works_without_a_wave_contract() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(Address::generate(&env)).address();
    let ink = InkStreamClient::new(&env, &env.register(InkStream, (admin, sac.clone(), None::<Address>)));
    let (author, reader) = (Address::generate(&env), Address::generate(&env));
    StellarAssetClient::new(&env, &sac).mint(&reader, &100);
    let id = ink.publish(&author, &s(&env, "T"), &s(&env, ""), &s(&env, ""), &50, &1, &0, &0);
    ink.add_chapter(&id, &s(&env, "1"), &s(&env, "x"));
    assert_eq!(ink.buy(&reader, &id), 50);
}
