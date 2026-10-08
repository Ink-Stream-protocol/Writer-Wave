//! # The Writer's Wave
//!
//! Recurring **Writing Sprints** (cycles). During a sprint, authors, readers and
//! contributors earn **Wave Points**:
//!
//! * automatically, when a trusted *reporter* contract (InkStream) records an
//!   on-chain action — a chapter published, a sale, a resale, an hour read; and
//! * manually, when the admin awards points for off-chain work (e.g. a merged PR).
//!
//! Anyone can fund a sprint's reward pool. When the sprint ends, every participant
//! claims `pool × their_points ÷ total_points`.
#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, token,
    Address, Env, String, Vec,
};

const DAY: u64 = 86_400;
const WEEK: u64 = 7 * DAY;
const TTL_EXTEND_TO: u32 = 3_110_400; // ~180 days
const TTL_THRESHOLD: u32 = TTL_EXTEND_TO - 120_960; // extend when < ~173 days remain
const MAX_LISTED_PARTICIPANTS: u32 = 1_000;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotFound = 1,
    InvalidWindow = 2,
    Overlap = 3,
    NotReporter = 4,
    CycleNotEnded = 5,
    AlreadyClaimed = 6,
    NothingToClaim = 7,
    InvalidAmount = 8,
    CycleEnded = 9,
    NoActiveCycle = 10,
}

/// Things that earn points. Order matters: it's the index into `point_values()`.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Action {
    /// Author published a chapter (InkStream limits this to one per novel per day).
    Chapter = 0,
    /// Bonus each week an author keeps a publishing streak going.
    Streak = 1,
    /// Author sold a copy ("Buy forever" or stream-to-own).
    Purchase = 2,
    /// Author's novel was resold on the secondary market.
    Resale = 3,
    /// Reader streamed a full hour.
    ReadHour = 4,
    /// Author received a full hour of reading.
    Engagement = 5,
    /// Off-chain contribution awarded by the admin (issues, PRs, docs…).
    Contribution = 6,
}

const ACTIONS: [Action; 7] = [
    Action::Chapter,
    Action::Streak,
    Action::Purchase,
    Action::Resale,
    Action::ReadHour,
    Action::Engagement,
    Action::Contribution,
];

fn default_points(a: Action) -> u32 {
    match a {
        Action::Chapter => 100,
        Action::Streak => 50,
        Action::Purchase => 50,
        Action::Resale => 25,
        Action::ReadHour => 50,
        Action::Engagement => 20,
        Action::Contribution => 1,
    }
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Cycle {
    pub id: u32,
    pub name: String,
    pub start: u64,
    pub end: u64,
    /// Reward token (any SEP-41 / Stellar Asset Contract).
    pub token: Address,
    pub pool: i128,
    pub total_points: u64,
    pub participants: u32,
    pub claimed: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Standing {
    pub user: Address,
    pub points: u64,
}

#[contracttype]
#[derive(Clone)]
struct StreakState {
    week: u64,
    length: u32,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Points(Action),
    Reporter(Address),
    CycleCount,
    Cycle(u32),
    UserPoints(u32, Address),
    Participants(u32),
    Claimed(u32, Address),
    Streak(u32, Address),
}

#[contractevent(topics = ["wave", "points"])]
pub struct PointsEarned {
    #[topic]
    pub cycle: u32,
    #[topic]
    pub user: Address,
    pub action: Action,
    pub points: u64,
}

#[contractevent(topics = ["wave", "cycle"])]
pub struct CycleStarted {
    #[topic]
    pub cycle: u32,
    pub name: String,
    pub start: u64,
    pub end: u64,
    pub token: Address,
}

#[contractevent(topics = ["wave", "funded"])]
pub struct PoolFunded {
    #[topic]
    pub cycle: u32,
    pub funder: Address,
    pub amount: i128,
}

#[contractevent(topics = ["wave", "claimed"])]
pub struct RewardClaimed {
    #[topic]
    pub cycle: u32,
    #[topic]
    pub user: Address,
    pub amount: i128,
}

#[contract]
pub struct WriterWave;

// ── helpers ──────────────────────────────────────────────────────────────────

fn admin(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Admin).unwrap()
}

fn bump_instance(env: &Env) {
    env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
}

fn get_cycle(env: &Env, id: u32) -> Cycle {
    let key = DataKey::Cycle(id);
    let c: Cycle = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| panic_with_error!(env, Error::NotFound));
    env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
    c
}

fn put<V: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(env: &Env, key: &DataKey, v: &V) {
    env.storage().persistent().set(key, v);
    env.storage().persistent().extend_ttl(key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

fn points_for(env: &Env, a: Action) -> u32 {
    env.storage().instance().get(&DataKey::Points(a)).unwrap_or(default_points(a))
}

/// The cycle whose window contains `now`, if any (only the latest cycle can be live).
fn live_cycle(env: &Env) -> Option<Cycle> {
    let count: u32 = env.storage().instance().get(&DataKey::CycleCount).unwrap_or(0);
    if count == 0 {
        return None;
    }
    let c = get_cycle(env, count);
    let now = env.ledger().timestamp();
    if now >= c.start && now < c.end {
        Some(c)
    } else {
        None
    }
}

fn add_points(env: &Env, cycle: &mut Cycle, user: &Address, action: Action, pts: u64) {
    if pts == 0 {
        return;
    }
    let key = DataKey::UserPoints(cycle.id, user.clone());
    let prev: u64 = env.storage().persistent().get(&key).unwrap_or(0);
    if prev == 0 {
        cycle.participants += 1;
        let pkey = DataKey::Participants(cycle.id);
        let mut list: Vec<Address> = env.storage().persistent().get(&pkey).unwrap_or(Vec::new(env));
        if list.len() < MAX_LISTED_PARTICIPANTS {
            list.push_back(user.clone());
            put(env, &pkey, &list);
        }
    }
    put(env, &key, &(prev + pts));
    cycle.total_points += pts;
    PointsEarned { cycle: cycle.id, user: user.clone(), action, points: pts }.publish(env);
}

#[contractimpl]
impl WriterWave {
    pub fn __constructor(env: Env, admin: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        bump_instance(&env);
    }

    // ── admin ────────────────────────────────────────────────────────────────
    pub fn set_admin(env: Env, new_admin: Address) {
        admin(&env).require_auth();
        env.storage().instance().set(&DataKey::Admin, &new_admin);
    }

    /// Change how many points an action is worth (applies to future records).
    pub fn set_points(env: Env, action: Action, points: u32) {
        admin(&env).require_auth();
        env.storage().instance().set(&DataKey::Points(action), &points);
        bump_instance(&env);
    }

    /// Allow (or revoke) a contract such as InkStream to record points.
    pub fn set_reporter(env: Env, reporter: Address, allowed: bool) {
        admin(&env).require_auth();
        if allowed {
            env.storage().instance().set(&DataKey::Reporter(reporter), &true);
        } else {
            env.storage().instance().remove(&DataKey::Reporter(reporter));
        }
        bump_instance(&env);
    }

    /// Open a new Writing Sprint. Sprints can't overlap.
    pub fn start_cycle(env: Env, name: String, start: u64, end: u64, token: Address) -> u32 {
        admin(&env).require_auth();
        if end <= start || end <= env.ledger().timestamp() {
            panic_with_error!(&env, Error::InvalidWindow);
        }
        let count: u32 = env.storage().instance().get(&DataKey::CycleCount).unwrap_or(0);
        if count > 0 && start < get_cycle(&env, count).end {
            panic_with_error!(&env, Error::Overlap);
        }
        let id = count + 1;
        let c = Cycle { id, name: name.clone(), start, end, token: token.clone(), pool: 0, total_points: 0, participants: 0, claimed: 0 };
        put(&env, &DataKey::Cycle(id), &c);
        env.storage().instance().set(&DataKey::CycleCount, &id);
        bump_instance(&env);
        CycleStarted { cycle: id, name, start, end, token }.publish(&env);
        id
    }

    /// Award points for off-chain work (merged PRs, docs, community…) in the live sprint.
    pub fn award(env: Env, user: Address, points: u64) {
        admin(&env).require_auth();
        let mut c = live_cycle(&env).unwrap_or_else(|| panic_with_error!(&env, Error::NoActiveCycle));
        add_points(&env, &mut c, &user, Action::Contribution, points);
        put(&env, &DataKey::Cycle(c.id), &c);
    }

    // ── anyone ───────────────────────────────────────────────────────────────
    /// Add tokens to a sprint's reward pool (sponsors, the ecosystem, readers…).
    pub fn fund(env: Env, funder: Address, cycle_id: u32, amount: i128) {
        funder.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        let mut c = get_cycle(&env, cycle_id);
        if env.ledger().timestamp() >= c.end {
            panic_with_error!(&env, Error::CycleEnded);
        }
        token::Client::new(&env, &c.token).transfer(&funder, env.current_contract_address(), &amount);
        c.pool += amount;
        put(&env, &DataKey::Cycle(cycle_id), &c);
        PoolFunded { cycle: cycle_id, funder, amount }.publish(&env);
    }

    /// Called by a trusted reporter contract. Returns points added (0 if no sprint is live).
    pub fn record(env: Env, reporter: Address, action: Action, user: Address, units: u32) -> u64 {
        reporter.require_auth();
        if !env.storage().instance().has(&DataKey::Reporter(reporter)) {
            panic_with_error!(&env, Error::NotReporter);
        }
        let Some(mut c) = live_cycle(&env) else { return 0 };
        let mut pts = points_for(&env, action) as u64 * units as u64;
        add_points(&env, &mut c, &user, action, pts);

        // Consistency: an extra bonus each consecutive week with at least one chapter.
        if action == Action::Chapter {
            let week = (env.ledger().timestamp() - c.start) / WEEK;
            let skey = DataKey::Streak(c.id, user.clone());
            let prev: Option<StreakState> = env.storage().persistent().get(&skey);
            let next = match prev {
                Some(s) if s.week == week => s,
                Some(s) if s.week + 1 == week => {
                    let bonus = points_for(&env, Action::Streak) as u64 * s.length as u64;
                    add_points(&env, &mut c, &user, Action::Streak, bonus);
                    pts += bonus;
                    StreakState { week, length: s.length + 1 }
                }
                _ => StreakState { week, length: 1 },
            };
            put(&env, &skey, &next);
        }
        put(&env, &DataKey::Cycle(c.id), &c);
        pts
    }

    // ── views ────────────────────────────────────────────────────────────────
    pub fn admin(env: Env) -> Address {
        admin(&env)
    }

    /// Point values in `Action` order: Chapter, Streak, Purchase, Resale, ReadHour, Engagement, Contribution.
    pub fn point_values(env: Env) -> Vec<u32> {
        let mut v = Vec::new(&env);
        for a in ACTIONS {
            v.push_back(points_for(&env, a));
        }
        v
    }

    pub fn is_reporter(env: Env, reporter: Address) -> bool {
        env.storage().instance().has(&DataKey::Reporter(reporter))
    }

    pub fn cycle_count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::CycleCount).unwrap_or(0)
    }

    pub fn cycle(env: Env, id: u32) -> Cycle {
        get_cycle(&env, id)
    }

    pub fn live(env: Env) -> Option<Cycle> {
        live_cycle(&env)
    }

    pub fn points_of(env: Env, cycle_id: u32, user: Address) -> u64 {
        env.storage().persistent().get(&DataKey::UserPoints(cycle_id, user)).unwrap_or(0)
    }

    /// Everyone with points in a sprint (unsorted; the first 1,000 participants are listed).
    pub fn standings(env: Env, cycle_id: u32) -> Vec<Standing> {
        let list: Vec<Address> = env.storage().persistent().get(&DataKey::Participants(cycle_id)).unwrap_or(Vec::new(&env));
        let mut out = Vec::new(&env);
        for user in list.iter() {
            let points = env.storage().persistent().get(&DataKey::UserPoints(cycle_id, user.clone())).unwrap_or(0);
            out.push_back(Standing { user, points });
        }
        out
    }
}

#[cfg(test)]
mod test;
