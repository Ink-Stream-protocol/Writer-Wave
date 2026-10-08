//! # InkStream — the streaming bookstore
//!
//! * **Publish**: authors register a novel (price, per-second rate, resale royalty) and add chapters.
//! * **Buy forever**: one payment straight to the author; ownership recorded on-chain.
//! * **Stream to read**: the reader deposits; the author earns `rate` per second while the
//!   stream is open. Stop any time and the unused deposit comes back.
//! * **Stream-to-own**: once a reader has streamed the full price, they own the book.
//!   Buying later only costs the remaining difference.
//! * **Resell**: owners list their copy; another reader buys it and the author gets a royalty automatically.
//! * **Writer's Wave**: every one of these actions reports Wave Points to the
//!   `writer_wave` contract (if configured), so authors and readers earn a share of the sprint pool.
#![no_std]

use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype,
    panic_with_error, token, Address, Env, String, Vec,
};

const DAY: u64 = 86_400;
const HOUR: u64 = 3_600;
const TTL_EXTEND_TO: u32 = 3_110_400; // ~180 days
const TTL_THRESHOLD: u32 = TTL_EXTEND_TO - 120_960;
const MAX_TITLE: u32 = 120;
const MAX_DESCRIPTION: u32 = 1_000;
const MAX_URI: u32 = 300;
const MAX_CHAPTER_BYTES: u32 = 16_000;
const MAX_ROYALTY_BPS: u32 = 5_000;
const MAX_LIST: u32 = 50;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NovelNotFound = 1,
    ChapterNotFound = 2,
    NotAuthor = 3,
    InvalidPrice = 4,
    InvalidRate = 5,
    InvalidRoyalty = 6,
    TooLong = 7,
    AlreadyOwned = 8,
    NotOwner = 9,
    InvalidAmount = 10,
    NoStream = 11,
    SameParty = 12,
    NotListed = 13,
    TooManyListings = 14,
}

/// Mirrors `writer_wave::Action` (same discriminants → same on-chain encoding).
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Action {
    Chapter = 0,
    Streak = 1,
    Purchase = 2,
    Resale = 3,
    ReadHour = 4,
    Engagement = 5,
    Contribution = 6,
}

#[contractclient(name = "WaveClient")]
pub trait WaveInterface {
    fn record(env: Env, reporter: Address, action: Action, user: Address, units: u32) -> u64;
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub admin: Address,
    /// Payment token for purchases and streams (e.g. the XLM or USDC Stellar Asset Contract).
    pub token: Address,
    pub wave: Option<Address>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Novel {
    pub id: u32,
    pub author: Address,
    pub title: String,
    pub description: String,
    pub cover_uri: String,
    /// Buy-forever price, in token base units (stroops for XLM/USDC).
    pub price: i128,
    /// Streaming rate, token base units per second.
    pub rate: i128,
    pub royalty_bps: u32,
    pub chapters: u32,
    /// How many opening chapters anyone can read for free.
    pub free_chapters: u32,
    pub created_at: u64,
    pub sales: u32,
    pub seconds_read: u64,
    pub earned: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Listing {
    pub seller: Address,
    pub price: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Chapter {
    pub title: String,
    pub body: String,
    pub published_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Stream {
    pub active: bool,
    /// Unspent deposit held by the contract.
    pub deposit: i128,
    pub last_settled: u64,
    /// Seconds paid during the current session (for Wave reading-hour points).
    pub session_seconds: u64,
    /// Lifetime amount this reader has paid by streaming this novel (counts towards ownership).
    pub paid: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StreamStatus {
    pub active: bool,
    pub deposit_left: i128,
    pub owed_now: i128,
    pub session_seconds: u64,
    pub paid: i128,
    pub seconds_left: u64,
    /// Remaining amount to own the book (price − paid).
    pub to_own: i128,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Config,
    NovelCount,
    Novel(u32),
    Chapter(u32, u32),
    Owned(Address, u32),
    Listings(u32),
    Stream(Address, u32),
    LastChapterReward(u32),
}

// ── events ───────────────────────────────────────────────────────────────────

#[contractevent(topics = ["ink", "published"])]
pub struct Published { #[topic] pub id: u32, #[topic] pub author: Address, pub title: String, pub price: i128, pub rate: i128 }

#[contractevent(topics = ["ink", "chapter"])]
pub struct ChapterAdded { #[topic] pub id: u32, pub index: u32, pub title: String }

#[contractevent(topics = ["ink", "bought"])]
pub struct Bought { #[topic] pub id: u32, #[topic] pub reader: Address, pub paid: i128, pub via_stream: bool }

#[contractevent(topics = ["ink", "resold"])]
pub struct Resold { #[topic] pub id: u32, pub seller: Address, pub buyer: Address, pub price: i128, pub royalty: i128 }

#[contractevent(topics = ["ink", "listed"])]
pub struct Listed { #[topic] pub id: u32, pub seller: Address, pub price: i128 }

#[contractevent(topics = ["ink", "stream_started"])]
pub struct StreamStarted { #[topic] pub id: u32, #[topic] pub reader: Address, pub deposit: i128 }

#[contractevent(topics = ["ink", "stream_stopped"])]
pub struct StreamStopped { #[topic] pub id: u32, #[topic] pub reader: Address, pub seconds: u64, pub refunded: i128 }

#[contract]
pub struct InkStream;

// ── helpers ──────────────────────────────────────────────────────────────────

fn config(env: &Env) -> Config {
    env.storage().instance().get(&DataKey::Config).unwrap()
}

fn put<V: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(env: &Env, key: &DataKey, v: &V) {
    env.storage().persistent().set(key, v);
    env.storage().persistent().extend_ttl(key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

fn load_novel(env: &Env, id: u32) -> Novel {
    let key = DataKey::Novel(id);
    let n: Novel = env.storage().persistent().get(&key).unwrap_or_else(|| panic_with_error!(env, Error::NovelNotFound));
    env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
    n
}

fn owned(env: &Env, reader: &Address, id: u32) -> bool {
    env.storage().persistent().has(&DataKey::Owned(reader.clone(), id))
}

fn set_owned(env: &Env, reader: &Address, id: u32) {
    put(env, &DataKey::Owned(reader.clone(), id), &true);
}

/// Best-effort Wave report: never makes the main action fail.
fn wave(env: &Env, action: Action, user: &Address, units: u32) {
    if units == 0 {
        return;
    }
    if let Some(w) = config(env).wave {
        let _ = WaveClient::new(env, &w).try_record(&env.current_contract_address(), &action, user, &units);
    }
}

fn check_len(env: &Env, s: &String, max: u32) {
    if s.len() > max {
        panic_with_error!(env, Error::TooLong);
    }
}

fn token(env: &Env) -> token::Client<'_> {
    token::Client::new(env, &config(env).token)
}

/// Pays the author what the stream owes up to now. Returns (stream, novel) updated (not saved).
fn settle_inner(env: &Env, mut s: Stream, mut n: Novel) -> (Stream, Novel) {
    let now = env.ledger().timestamp();
    if !s.active || now <= s.last_settled {
        return (s, n);
    }
    let elapsed = now - s.last_settled;
    let affordable_secs = (s.deposit / n.rate) as u64;
    let remaining_to_own = (n.price - s.paid).max(0);
    // never stream more than the buy-forever price
    let to_own_secs = ((remaining_to_own + n.rate - 1) / n.rate) as u64;
    let secs = elapsed.min(affordable_secs).min(to_own_secs);
    let due = (n.rate * secs as i128).min(remaining_to_own);
    if due > 0 {
        token(env).transfer(&env.current_contract_address(), &n.author, &due);
    }
    s.deposit -= due;
    s.paid += due;
    s.session_seconds += secs;
    s.last_settled = now;
    n.seconds_read += secs;
    n.earned += due;
    (s, n)
}

#[contractimpl]
impl InkStream {
    pub fn __constructor(env: Env, admin: Address, token: Address, wave: Option<Address>) {
        env.storage().instance().set(&DataKey::Config, &Config { admin, token, wave });
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    pub fn set_wave(env: Env, wave: Option<Address>) {
        let mut c = config(&env);
        c.admin.require_auth();
        c.wave = wave;
        env.storage().instance().set(&DataKey::Config, &c);
    }

    // ── authors ──────────────────────────────────────────────────────────────
    #[allow(clippy::too_many_arguments)]
    pub fn publish(
        env: Env,
        author: Address,
        title: String,
        description: String,
        cover_uri: String,
        price: i128,
        rate: i128,
        royalty_bps: u32,
        free_chapters: u32,
    ) -> u32 {
        author.require_auth();
        if price <= 0 {
            panic_with_error!(&env, Error::InvalidPrice);
        }
        if rate <= 0 || rate > price {
            panic_with_error!(&env, Error::InvalidRate);
        }
        if royalty_bps > MAX_ROYALTY_BPS {
            panic_with_error!(&env, Error::InvalidRoyalty);
        }
        check_len(&env, &title, MAX_TITLE);
        check_len(&env, &description, MAX_DESCRIPTION);
        check_len(&env, &cover_uri, MAX_URI);

        let id: u32 = env.storage().instance().get(&DataKey::NovelCount).unwrap_or(0) + 1;
        env.storage().instance().set(&DataKey::NovelCount, &id);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        let n = Novel {
            id, author: author.clone(), title: title.clone(), description, cover_uri, price, rate, royalty_bps,
            chapters: 0, free_chapters, created_at: env.ledger().timestamp(), sales: 0, seconds_read: 0, earned: 0,
        };
        put(&env, &DataKey::Novel(id), &n);
        set_owned(&env, &author, id); // authors can always read their own book
        Published { id, author, title, price, rate }.publish(&env);
        id
    }

    /// Update pricing. Existing open streams keep settling at the new rate from their next settlement.
    pub fn update_pricing(env: Env, id: u32, price: i128, rate: i128, royalty_bps: u32, free_chapters: u32) {
        let mut n = load_novel(&env, id);
        n.author.require_auth();
        if price <= 0 {
            panic_with_error!(&env, Error::InvalidPrice);
        }
        if rate <= 0 || rate > price {
            panic_with_error!(&env, Error::InvalidRate);
        }
        if royalty_bps > MAX_ROYALTY_BPS {
            panic_with_error!(&env, Error::InvalidRoyalty);
        }
        n.price = price;
        n.rate = rate;
        n.royalty_bps = royalty_bps;
        n.free_chapters = free_chapters;
        put(&env, &DataKey::Novel(id), &n);
    }

    /// Adds a chapter. Earns Wave "Chapter" points at most once per novel per day.
    pub fn add_chapter(env: Env, id: u32, title: String, body: String) -> u32 {
        let mut n = load_novel(&env, id);
        n.author.require_auth();
        check_len(&env, &title, MAX_TITLE);
        check_len(&env, &body, MAX_CHAPTER_BYTES);
        let index = n.chapters;
        let now = env.ledger().timestamp();
        put(&env, &DataKey::Chapter(id, index), &Chapter { title: title.clone(), body, published_at: now });
        n.chapters += 1;
        put(&env, &DataKey::Novel(id), &n);

        let rkey = DataKey::LastChapterReward(id);
        let last: Option<u64> = env.storage().persistent().get(&rkey);
        if last.is_none_or(|t| now >= t + DAY) {
            put(&env, &rkey, &now);
            wave(&env, Action::Chapter, &n.author, 1);
        }
        ChapterAdded { id, index, title }.publish(&env);
        index
    }

    // ── readers ──────────────────────────────────────────────────────────────
    /// Buy forever. If the reader has streamed before, only the remaining difference is charged.
    pub fn buy(env: Env, reader: Address, id: u32) -> i128 {
        reader.require_auth();
        let mut n = load_novel(&env, id);
        if owned(&env, &reader, id) {
            panic_with_error!(&env, Error::AlreadyOwned);
        }
        let skey = DataKey::Stream(reader.clone(), id);
        let mut credit = 0;
        if let Some(s) = env.storage().persistent().get::<_, Stream>(&skey) {
            let (mut s, n2) = settle_inner(&env, s, n);
            n = n2;
            credit = s.paid;
            if s.deposit > 0 {
                token(&env).transfer(&env.current_contract_address(), &reader, &s.deposit);
            }
            s.deposit = 0;
            s.active = false;
            put(&env, &skey, &s);
        }
        let due = (n.price - credit).max(0);
        if due > 0 {
            token(&env).transfer(&reader, &n.author, &due);
        }
        n.sales += 1;
        n.earned += due;
        put(&env, &DataKey::Novel(id), &n);
        set_owned(&env, &reader, id);
        wave(&env, Action::Purchase, &n.author, 1);
        Bought { id, reader, paid: due, via_stream: false }.publish(&env);
        due
    }

    // ── views ────────────────────────────────────────────────────────────────
    pub fn config(env: Env) -> Config {
        config(&env)
    }

    pub fn novel_count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::NovelCount).unwrap_or(0)
    }

    pub fn novel(env: Env, id: u32) -> Novel {
        load_novel(&env, id)
    }

    /// Newest first. `before` = 0 starts from the latest novel.
    pub fn list_novels(env: Env, before: u32, limit: u32) -> Vec<Novel> {
        let count: u32 = env.storage().instance().get(&DataKey::NovelCount).unwrap_or(0);
        let mut id = if before == 0 || before > count + 1 { count } else { before - 1 };
        let mut out = Vec::new(&env);
        while id > 0 && out.len() < limit.min(MAX_LIST) {
            if let Some(n) = env.storage().persistent().get::<_, Novel>(&DataKey::Novel(id)) {
                out.push_back(n);
            }
            id -= 1;
        }
        out
    }

    pub fn chapter(env: Env, id: u32, index: u32) -> Chapter {
        let key = DataKey::Chapter(id, index);
        let c: Chapter = env.storage().persistent().get(&key).unwrap_or_else(|| panic_with_error!(&env, Error::ChapterNotFound));
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        c
    }

    pub fn is_owned(env: Env, reader: Address, id: u32) -> bool {
        owned(&env, &reader, id)
    }
}

#[cfg(test)]
mod test;
