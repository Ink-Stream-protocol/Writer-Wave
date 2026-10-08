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
fn stream_pays_per_second_and_refunds_the_rest() {
    let t = setup();
    let id = publish(&t);
    t.ink.start_stream(&t.reader, &id, &(10 * XLM)); // enough for 1,000 s
    assert_eq!(t.token.balance(&t.reader), 990 * XLM);

    at(&t, 300);
    let st = t.ink.stream_status(&t.reader, &id);
    assert_eq!(st.owed_now, 3 * XLM);
    assert_eq!(st.session_seconds, 300);
    assert_eq!(st.to_own, 17 * XLM);

    // the author can pull earnings mid-stream
    assert_eq!(t.ink.settle(&t.reader, &id), 3 * XLM);
    assert_eq!(t.token.balance(&t.author), 3 * XLM);

    at(&t, 500);
    assert_eq!(t.ink.stop_stream(&t.reader, &id), 5 * XLM); // 500 s × 0.01 = 5 paid, 5 refunded
    assert_eq!(t.token.balance(&t.author), 5 * XLM);
    assert_eq!(t.token.balance(&t.reader), 995 * XLM);
    assert!(!t.ink.stream_status(&t.reader, &id).active);
    assert_eq!(t.ink.novel(&id).seconds_read, 500);
}

#[test]
fn stream_stops_charging_when_deposit_runs_out() {
    let t = setup();
    let id = publish(&t);
    t.ink.start_stream(&t.reader, &id, &XLM); // 100 s worth
    at(&t, 10_000);
    assert_eq!(t.ink.stream_status(&t.reader, &id).deposit_left, 0);
    assert_eq!(t.ink.stop_stream(&t.reader, &id), 0);
    assert_eq!(t.token.balance(&t.author), XLM);
}

#[test]
fn streaming_the_full_price_grants_ownership() {
    let t = setup();
    let id = publish(&t);
    t.ink.start_stream(&t.reader, &id, &(50 * XLM));
    at(&t, 5_000); // would be 50 XLM, but capped at the 20 XLM price
    t.ink.settle(&t.reader, &id);
    assert!(t.ink.is_owned(&t.reader, &id));
    assert_eq!(t.token.balance(&t.author), 20 * XLM);
    assert_eq!(t.token.balance(&t.reader), 980 * XLM); // 30 refunded
    // 2,000 s of paid reading ≈ 0 full hours → only Purchase points for the author
    assert_eq!(t.wave.points_of(&1, &t.author), 50);
    assert_eq!(t.ink.novel(&id).sales, 1);
}

#[test]
fn buying_after_streaming_only_charges_the_difference() {
    let t = setup();
    let id = publish(&t);
    t.ink.start_stream(&t.reader, &id, &(10 * XLM));
    at(&t, 600); // 6 XLM streamed
    assert_eq!(t.ink.buy(&t.reader, &id), 14 * XLM);
    assert_eq!(t.token.balance(&t.author), 20 * XLM);
    assert_eq!(t.token.balance(&t.reader), 980 * XLM);
    assert!(t.ink.is_owned(&t.reader, &id));
}

#[test]
fn reading_hours_earn_points_for_reader_and_author() {
    let t = setup();
    // cheap novel: 1,000 XLM price, 0.001 XLM/s → 2 h costs 7.2 XLM
    let id = t.ink.publish(&t.author, &s(&t.env, "Long Read"), &s(&t.env, ""), &s(&t.env, ""), &(1_000 * XLM), &(XLM / 1_000), &1_000, &0);
    t.ink.start_stream(&t.reader, &id, &(10 * XLM));
    at(&t, 2 * HOUR + 59);
    t.ink.stop_stream(&t.reader, &id);
    assert_eq!(t.wave.points_of(&1, &t.reader), 100); // 2 × ReadHour(50)
    assert_eq!(t.wave.points_of(&1, &t.author), 40); // 2 × Engagement(20)
}

#[test]
fn resale_listing_pays_royalty_and_moves_ownership() {
    let t = setup();
    let id = publish(&t);
    t.ink.buy(&t.reader, &id);
    let buyer = Address::generate(&t.env);
    StellarAssetClient::new(&t.env, &t.token.address).mint(&buyer, &(100 * XLM));
    t.ink.list_resale(&t.reader, &id, &(12 * XLM));
    t.ink.list_resale(&t.reader, &id, &(10 * XLM)); // re-list updates price
    assert_eq!(t.ink.listings(&id).len(), 1);
    assert_eq!(t.ink.buy_resale(&buyer, &id, &t.reader), 10 * XLM);
    assert_eq!(t.token.balance(&t.author), 21 * XLM); // 20 sale + 1 royalty
    assert_eq!(t.token.balance(&t.reader), 989 * XLM); // 980 + 9
    assert!(t.ink.is_owned(&buyer, &id));
    assert!(!t.ink.is_owned(&t.reader, &id));
    assert_eq!(t.ink.listings(&id).len(), 0);
    assert_eq!(t.wave.points_of(&1, &t.author), 75); // Purchase 50 + Resale 25
    assert_eq!(t.ink.try_list_resale(&t.reader, &id, &XLM), Err(Ok(err(Error::NotOwner))));
}

#[test]
fn listing_rules() {
    let t = setup();
    let id = publish(&t);
    let other = Address::generate(&t.env);
    assert_eq!(t.ink.try_list_resale(&t.reader, &id, &XLM), Err(Ok(err(Error::NotOwner))));
    assert_eq!(t.ink.try_list_resale(&t.author, &id, &XLM), Err(Ok(err(Error::NotOwner))));
    t.ink.buy(&t.reader, &id);
    assert_eq!(t.ink.try_list_resale(&t.reader, &id, &0), Err(Ok(err(Error::InvalidAmount))));
    t.ink.list_resale(&t.reader, &id, &XLM);
    assert_eq!(t.ink.try_buy_resale(&t.reader, &id, &t.reader), Err(Ok(err(Error::SameParty))));
    assert_eq!(t.ink.try_buy_resale(&other, &id, &t.author), Err(Ok(err(Error::NotListed))));
    t.ink.cancel_resale(&t.reader, &id);
    assert_eq!(t.ink.try_buy_resale(&other, &id, &t.reader), Err(Ok(err(Error::NotListed))));
}

#[test]
fn validation() {
    let t = setup();
    let e = &t.env;
    let (a, b) = (s(e, "T"), s(e, ""));
    assert_eq!(t.ink.try_publish(&t.author, &a, &b, &b, &0, &1, &0, &0), Err(Ok(err(Error::InvalidPrice))));
    assert_eq!(t.ink.try_publish(&t.author, &a, &b, &b, &10, &0, &0, &0), Err(Ok(err(Error::InvalidRate))));
    assert_eq!(t.ink.try_publish(&t.author, &a, &b, &b, &10, &11, &0, &0), Err(Ok(err(Error::InvalidRate))));
    assert_eq!(t.ink.try_publish(&t.author, &a, &b, &b, &10, &1, &5_001, &0), Err(Ok(err(Error::InvalidRoyalty))));
    let long = String::from_str(e, &"x".repeat(121));
    assert_eq!(t.ink.try_publish(&t.author, &long, &b, &b, &10, &1, &0, &0), Err(Ok(err(Error::TooLong))));
    assert_eq!(t.ink.try_novel(&7), Err(Ok(err(Error::NovelNotFound))));
    let id = publish(&t);
    assert_eq!(t.ink.try_start_stream(&t.author, &id, &XLM), Err(Ok(err(Error::AlreadyOwned))));
    assert_eq!(t.ink.try_stop_stream(&t.reader, &id), Err(Ok(err(Error::NoStream))));
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
