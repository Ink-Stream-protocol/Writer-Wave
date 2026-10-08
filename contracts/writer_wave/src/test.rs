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
fn full_cycle_points_fund_and_pro_rata_claims() {
    let s = setup();
    let id = sprint(&s);
    let (alice, bob, sponsor) = (Address::generate(&s.env), Address::generate(&s.env), Address::generate(&s.env));

    // alice: 1 chapter (100) ; bob: 2 read-hours (2 × 50) + 1 contribution award of 200
    assert_eq!(s.wave.record(&s.reporter, &Action::Chapter, &alice, &1), 100);
    assert_eq!(s.wave.record(&s.reporter, &Action::ReadHour, &bob, &2), 100);
    s.wave.award(&bob, &200);
    assert_eq!(s.wave.points_of(&id, &alice), 100);
    assert_eq!(s.wave.points_of(&id, &bob), 300);

    s.sac.mint(&sponsor, &4_000);
    s.wave.fund(&sponsor, &id, &4_000);
    let c = s.wave.cycle(&id);
    assert_eq!((c.pool, c.total_points, c.participants), (4_000, 400, 2));
    assert_eq!(s.wave.claimable(&id, &alice), 1_000);
    assert_eq!(s.wave.standings(&id).len(), 2);

    // can't claim before the end
    assert_eq!(s.wave.try_claim(&alice, &id), Err(Ok(err(Error::CycleNotEnded))));
    s.env.ledger().with_mut(|l| l.timestamp = T0 + 4 * WEEK);

    assert_eq!(s.wave.claim(&alice, &id), 1_000);
    assert_eq!(s.wave.claim(&bob, &id), 3_000);
    assert_eq!(s.token.balance(&alice), 1_000);
    assert_eq!(s.token.balance(&bob), 3_000);
    assert_eq!(s.wave.try_claim(&alice, &id), Err(Ok(err(Error::AlreadyClaimed))));
    assert_eq!(s.wave.claimable(&id, &alice), 0);
    assert_eq!(s.wave.cycle(&id).claimed, 4_000);
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

#[test]
fn cycles_cannot_overlap_and_funding_closes_at_end() {
    let s = setup();
    let id = sprint(&s);
    let name = String::from_str(&s.env, "Sprint 2");
    assert_eq!(s.wave.try_start_cycle(&name, &(T0 + WEEK), &(T0 + 5 * WEEK), &s.token.address), Err(Ok(err(Error::Overlap))));
    assert_eq!(s.wave.try_start_cycle(&name, &T0, &T0, &s.token.address), Err(Ok(err(Error::InvalidWindow))));
    let id2 = s.wave.start_cycle(&name, &(T0 + 4 * WEEK), &(T0 + 8 * WEEK), &s.token.address);
    assert_eq!(id2, 2);
    s.env.ledger().with_mut(|l| l.timestamp = T0 + 4 * WEEK);
    let sponsor = Address::generate(&s.env);
    s.sac.mint(&sponsor, &10);
    assert_eq!(s.wave.try_fund(&sponsor, &id, &10), Err(Ok(err(Error::CycleEnded))));
    assert_eq!(s.wave.live().unwrap().id, 2);
}

#[test]
fn nothing_to_claim_without_points() {
    let s = setup();
    let id = sprint(&s);
    s.env.ledger().with_mut(|l| l.timestamp = T0 + 5 * WEEK);
    let nobody = Address::generate(&s.env);
    assert_eq!(s.wave.try_claim(&nobody, &id), Err(Ok(err(Error::NothingToClaim))));
}
