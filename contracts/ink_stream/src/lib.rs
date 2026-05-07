#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String, token};

// ── Storage Keys ──────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Novel(String),          // NovelMeta by title
    Owned(Address, String), // reader owns title
    Royalty(String),        // resale royalty basis points (default 1000 = 10%)
}

// ── Data Types ────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub struct NovelMeta {
    pub author: Address,
    pub price_full: i128,  // one-time purchase price (stroops / smallest unit)
    pub drip_rate: i128,   // streaming rate: amount per second
    pub title: String,
}

#[contracttype]
#[derive(Clone)]
pub struct PurchaseReceipt {
    pub reader: Address,
    pub title: String,
    pub paid: i128,
    pub timestamp: u64,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct InkStreamContract;

#[contractimpl]
impl InkStreamContract {
    /// Author registers a novel with a full-purchase price and a per-second drip rate.
    pub fn publish(env: Env, author: Address, title: String, price: i128, rate: i128) {
        author.require_auth();
        assert!(price > 0 && rate > 0, "price and rate must be positive");

        let meta = NovelMeta {
            author: author.clone(),
            price_full: price,
            drip_rate: rate,
            title: title.clone(),
        };
        env.storage()
            .instance()
            .set(&DataKey::Novel(title.clone()), &meta);

        // Default resale royalty: 10%
        env.storage()
            .instance()
            .set(&DataKey::Royalty(title), &1000_u32);
    }

    /// Reader permanently buys a novel. Transfers full price to author instantly.
    pub fn buy_full(env: Env, reader: Address, title: String, token_addr: Address) {
        reader.require_auth();

        let meta: NovelMeta = env
            .storage()
            .instance()
            .get(&DataKey::Novel(title.clone()))
            .expect("novel not found");

        token::Client::new(&env, &token_addr).transfer(
            &reader,
            &meta.author,
            &meta.price_full,
        );

        env.storage()
            .persistent()
            .set(&DataKey::Owned(reader.clone(), title.clone()), &true);
    }

    /// Resale: transfer ownership from current owner to buyer, paying author royalty.
    pub fn resell(
        env: Env,
        seller: Address,
        buyer: Address,
        title: String,
        sale_price: i128,
        token_addr: Address,
    ) {
        seller.require_auth();
        buyer.require_auth();

        let owned_key = DataKey::Owned(seller.clone(), title.clone());
        assert!(
            env.storage().persistent().get::<_, bool>(&owned_key).unwrap_or(false),
            "seller does not own this novel"
        );

        let meta: NovelMeta = env
            .storage()
            .instance()
            .get(&DataKey::Novel(title.clone()))
            .expect("novel not found");

        let royalty_bps: u32 = env
            .storage()
            .instance()
            .get(&DataKey::Royalty(title.clone()))
            .unwrap_or(1000);

        let royalty_amount = sale_price * royalty_bps as i128 / 10_000;
        let seller_amount = sale_price - royalty_amount;

        let token = token::Client::new(&env, &token_addr);
        token.transfer(&buyer, &meta.author, &royalty_amount);
        token.transfer(&buyer, &seller, &seller_amount);

        // Transfer ownership
        env.storage().persistent().remove(&owned_key);
        env.storage()
            .persistent()
            .set(&DataKey::Owned(buyer, title), &true);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    pub fn get_novel(env: Env, title: String) -> Option<NovelMeta> {
        env.storage().instance().get(&DataKey::Novel(title))
    }

    pub fn is_owned(env: Env, reader: Address, title: String) -> bool {
        env.storage()
            .persistent()
            .get::<_, bool>(&DataKey::Owned(reader, title))
            .unwrap_or(false)
    }

    pub fn get_drip_rate(env: Env, title: String) -> i128 {
        let meta: NovelMeta = env
            .storage()
            .instance()
            .get(&DataKey::Novel(title))
            .expect("novel not found");
        meta.drip_rate
    }
}
