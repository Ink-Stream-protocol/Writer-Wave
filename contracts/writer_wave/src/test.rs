#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, Env, String,
};

const T0: u64 = 1_000_000;

struct S<'a> {
    env: Env,
    wave: WriterWaveClient<'a>,
    token: TokenClient<'a>,
    sac: StellarAssetClient<'a>,
    reporter: Address,
}

fn setup() -> S<'static> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|l| l.timestamp = T0);
    let admin = Address::generate(&env);
    let sac_addr = env.register_stellar_asset_contract_v2(Address::generate(&env)).address();
    let wave = WriterWaveClient::new(&env, &env.register(WriterWave, (admin,)));
    let reporter = Address::generate(&env);
    wave.set_reporter(&reporter, &true);
    S { token: TokenClient::new(&env, &sac_addr), sac: StellarAssetClient::new(&env, &sac_addr), env, wave, reporter }
}

fn err(e: Error) -> soroban_sdk::Error {
    soroban_sdk::Error::from_contract_error(e as u32)
}

fn sprint(s: &S) -> u32 {
    s.wave.start_cycle(&String::from_str(&s.env, "Sprint 1"), &T0, &(T0 + 4 * WEEK), &s.token.address)
}

#[test]
fn weekly_chapter_streak_earns_bonus() {
    let s = setup();
    let id = sprint(&s);
    let author = Address::generate(&s.env);
    // week 0: two chapters → 200, no bonus
    s.wave.record(&s.reporter, &Action::Chapter, &author, &1);
    s.wave.record(&s.reporter, &Action::Chapter, &author, &1);
    // week 1 → 100 + 50×1 bonus
    s.env.ledger().with_mut(|l| l.timestamp = T0 + WEEK + 10);
    assert_eq!(s.wave.record(&s.reporter, &Action::Chapter, &author, &1), 150);
    // week 2 → 100 + 50×2
    s.env.ledger().with_mut(|l| l.timestamp = T0 + 2 * WEEK + 10);
    assert_eq!(s.wave.record(&s.reporter, &Action::Chapter, &author, &1), 200);
    // skip week 3? no: week 3 → 100 + 50×3 ; a 4-week streak totals 200+150+200+250 = 800
    s.env.ledger().with_mut(|l| l.timestamp = T0 + 3 * WEEK + 10);
    assert_eq!(s.wave.record(&s.reporter, &Action::Chapter, &author, &1), 250);
    assert_eq!(s.wave.points_of(&id, &author), 800);
}

#[test]
fn broken_streak_resets() {
    let s = setup();
    sprint(&s);
    let author = Address::generate(&s.env);
    s.wave.record(&s.reporter, &Action::Chapter, &author, &1);
    s.env.ledger().with_mut(|l| l.timestamp = T0 + 2 * WEEK + 10); // skipped week 1
    assert_eq!(s.wave.record(&s.reporter, &Action::Chapter, &author, &1), 100);
}

#[test]
fn only_reporters_record_and_nothing_outside_a_sprint() {
    let s = setup();
    let user = Address::generate(&s.env);
    // no sprint yet → 0, no panic (so InkStream calls never fail)
    assert_eq!(s.wave.record(&s.reporter, &Action::Purchase, &user, &1), 0);
    let stranger = Address::generate(&s.env);
    assert_eq!(s.wave.try_record(&stranger, &Action::Purchase, &user, &1), Err(Ok(err(Error::NotReporter))));
    s.wave.set_reporter(&s.reporter, &false);
    assert_eq!(s.wave.try_record(&s.reporter, &Action::Purchase, &user, &1), Err(Ok(err(Error::NotReporter))));
}

#[test]
fn admin_can_tune_point_values() {
    let s = setup();
    let id = sprint(&s);
    s.wave.set_points(&Action::Resale, &40);
    let user = Address::generate(&s.env);
    assert_eq!(s.wave.record(&s.reporter, &Action::Resale, &user, &1), 40);
    assert_eq!(s.wave.point_values().get(3).unwrap(), 40);
    assert_eq!(s.wave.points_of(&id, &user), 40);
}
