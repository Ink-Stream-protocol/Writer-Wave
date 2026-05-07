# ✍️ InkStream — The Streaming Bookstore

> **Reading is Streaming.** InkStream is the first publishing platform where readers pay authors by the second — or buy a novel as a permanent on-chain asset. Built on **Soroban (Stellar)** and **Drips Network**.

[![License: MIT](https://img.shields.io/badge/License-MIT-indigo.svg)](LICENSE)
[![Drips Wave](https://img.shields.io/badge/Drips-Wave%20Project-teal)](https://drips.network)
[![Built on Stellar](https://img.shields.io/badge/Built%20on-Stellar-blue)](https://stellar.org)

---

## 🌊 What is InkStream?

InkStream is an open-source, decentralized bookstore that solves the biggest problem in digital publishing: **the $20 barrier**.

Most readers won't pay upfront for a book they might not finish. InkStream removes that friction entirely. A reader can open any novel and start paying `$0.0001 per second` — roughly `$0.36 per hour`. If they love it, one click upgrades them to permanent ownership via a Soroban smart contract. If they stop reading, they stop paying. Zero risk, zero middlemen.

### The Hybrid Protocol

| Mode | Technology | What happens |
|------|-----------|--------------|
| **Buy Forever** | Soroban smart contract | Lump-sum payment → author instantly. NFT-like ownership stored on-chain. |
| **Stream to Read** | Drips Network | Funds drip wallet → author per second. Pauses when you switch tabs. |
| **Resell** | Soroban smart contract | Transfer ownership to another reader. Author earns 10% royalty automatically. |

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        InkStream Stack                          │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Frontend  (Next.js 14 + Tailwind)           │  │
│  │                                                          │  │
│  │   /                  → Bookstore listing                 │  │
│  │   /novel/[title]     → Buy or Stream modal               │  │
│  │   <BuyButton />      → Calls Soroban buy_full()          │  │
│  │   <ReadingStream />  → Manages Drips stream lifecycle    │  │
│  └──────────────┬───────────────────────┬───────────────────┘  │
│                 │                       │                       │
│        Stellar SDK                 Drips SDK                    │
│                 │                       │                       │
│  ┌──────────────▼──────────┐  ┌────────▼──────────────────┐   │
│  │  Soroban Smart Contract  │  │   Drips Protocol (EVM)    │   │
│  │  contracts/ink_stream    │  │   streaming/src/          │   │
│  │                          │  │                           │   │
│  │  publish()               │  │  createStream()           │   │
│  │  buy_full()              │  │  stream.pause()           │   │
│  │  resell()                │  │  stream.resume()          │   │
│  │  is_owned()              │  │  upsertDripList()         │   │
│  └──────────────────────────┘  └───────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              shared/  (types + config)                   │  │
│  │   Novel · ReadSession · WavePoints · SOROBAN_NETWORK     │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
Writer-Wave/
├── contracts/
│   ├── Cargo.toml                  # Workspace manifest
│   └── ink_stream/
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs              # Contract: publish, buy_full, resell
│           └── test.rs             # Unit tests (soroban testutils)
├── streaming/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── streamClient.ts         # Start/pause/stop Drips streams
│       ├── authorList.ts           # Manage author support lists
│       └── index.ts
├── frontend/
│   ├── package.json
│   ├── next.config.js
│   └── src/
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── page.tsx            # Bookstore home
│       │   └── novel/[title]/
│       │       └── page.tsx        # Buy / Stream modal
│       ├── components/
│       │   ├── BuyButton.tsx       # Soroban tx flow
│       │   └── ReadingStream.tsx   # Drips stream UI
│       └── lib/
│           └── sorobanClient.ts    # Contract call helpers
└── shared/
    ├── types.ts                    # Novel, ReadSession, WavePoints
    └── config.ts                   # Network constants
```

---

## 🔗 The Soroban Contract

The contract lives in `contracts/ink_stream/src/lib.rs`. It handles three things: publishing, buying, and reselling.

### Data Model

```rust
#[contracttype]
#[derive(Clone)]
pub struct NovelMeta {
    pub author: Address,
    pub price_full: i128,  // one-time purchase price (stroops)
    pub drip_rate: i128,   // per-second rate for Drips integration
    pub title: String,
}
```

### Publishing a Novel

```rust
pub fn publish(env: Env, author: Address, title: String, price: i128, rate: i128) {
    author.require_auth(); // Freighter wallet signs this
    let meta = NovelMeta { author, price_full: price, drip_rate: rate, title: title.clone() };
    env.storage().instance().set(&DataKey::Novel(title), &meta);
}
```

### Buying Permanently

```rust
pub fn buy_full(env: Env, reader: Address, title: String, token_addr: Address) {
    reader.require_auth();
    let meta: NovelMeta = env.storage().instance()
        .get(&DataKey::Novel(title.clone())).expect("novel not found");

    // Atomic: transfer price → author, then mark owned
    token::Client::new(&env, &token_addr)
        .transfer(&reader, &meta.author, &meta.price_full);

    env.storage().persistent()
        .set(&DataKey::Owned(reader, title), &true);
}
```

### Resale with Automatic Royalties

```rust
pub fn resell(env: Env, seller: Address, buyer: Address, title: String,
              sale_price: i128, token_addr: Address) {
    // 10% royalty to author, 90% to seller — enforced on-chain
    let royalty_amount = sale_price * royalty_bps as i128 / 10_000;
    token.transfer(&buyer, &meta.author, &royalty_amount);
    token.transfer(&buyer, &seller, &sale_price - royalty_amount);
    // Transfer ownership atomically
}
```

### Deploy

```bash
# Build
cd contracts
cargo build --target wasm32-unknown-unknown --release

# Deploy to testnet
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/ink_stream.wasm \
  --source <YOUR_SECRET_KEY> \
  --network testnet
```

---

## 🌊 The Drips Integration

When a reader chooses "Stream to Read", the frontend calls `startReadingStream()` from `streaming/src/streamClient.ts`.

```typescript
import { startReadingStream } from "../streaming/src/streamClient";

const stream = await startReadingStream(walletSigner, {
  receiverAddress: novel.authorEvm,
  tokenAddress: USDC_ADDRESS,
  amountPerSecond: novel.dripRateRaw, // e.g. 100n (100 wei/s)
});

// Stream auto-pauses when reader switches tabs (visibilitychange listener)
// Stop it when they navigate away:
await stream.stop();
```

### DripList — Supporting Multiple Authors

Readers can build a curated list of authors they support continuously:

```typescript
import { upsertDripList } from "../streaming/src/authorList";

await upsertDripList(signer, {
  name: "My Favorite Authors",
  entries: [
    { authorAddress: "0xAuthor1...", weight: 600_000 }, // 60%
    { authorAddress: "0xAuthor2...", weight: 400_000 }, // 40%
  ],
});
// Weights must sum to 1_000_000
```

---

## 🏆 The Writer's Wave

InkStream is designed to participate in the **Drips Wave** open-source funding program. Here's how the circular economy works:

```
  Readers ──(stream USDC)──► Authors
     │                          │
     │                          └──(fund)──► Developer Wave Pool
     │                                              │
     └──────────────────────────────────────────────┘
              Contributors earn Wave Points
              Points → share of reward pool
```

### Wave Point Sources

| Action | Points |
|--------|--------|
| Author publishes a chapter per week for 4 weeks | 500 pts |
| Reader streams > 1 hour on a novel | 50 pts |
| Developer closes a GitHub issue | 100–500 pts |
| Novel gets resold (secondary market activity) | 25 pts |

### For Contributors

This repo will have **~125 open issues** across these tracks:

- **`track: contract`** — Soroban contract features (royalty config, chapter-level access, NFT metadata)
- **`track: drips`** — Drips integration (real SDK wiring, stream analytics, DripList UI)
- **`track: frontend`** — UI features (dark mode, PDF export, reading progress, search)
- **`track: wave`** — Wave mechanics (point tracking, leaderboard, reward distribution)
- **`track: infra`** — CI/CD, contract deployment scripts, testnet faucet integration

---

## 🚀 Getting Started

### Prerequisites

- [Rust + wasm32 target](https://www.rust-lang.org/tools/install): `rustup target add wasm32-unknown-unknown`
- [Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools/cli/install-stellar-cli): `cargo install stellar-cli`
- Node.js 20+

### 1. Clone & Install

```bash
git clone https://github.com/your-org/Writer-Wave.git
cd Writer-Wave

# Frontend deps
cd frontend && npm install && cd ..

# Drips deps
cd drips && npm install && cd ..
```

### 2. Configure Environment

```bash
cp frontend/.env.example frontend/.env.local
# Fill in NEXT_PUBLIC_CONTRACT_ID after deploying the contract
```

### 3. Build & Deploy the Contract

```bash
cd contracts
cargo build --target wasm32-unknown-unknown --release
stellar contract deploy \
  --wasm ink_stream/target/wasm32-unknown-unknown/release/ink_stream.wasm \
  --source <YOUR_SECRET_KEY> \
  --network testnet
```

### 4. Run the Frontend

```bash
cd frontend
npm run dev
# → http://localhost:3000
```

### 5. Run Contract Tests

```bash
cd contracts
cargo test
```

---

## 🗺 Roadmap (Open Issues)

The following are planned as GitHub issues for Wave contributors:

- [ ] Freighter wallet integration in `BuyButton.tsx`
- [ ] Real Drips SDK wiring in `ReadingStream.tsx`
- [ ] Chapter-level access control in Soroban contract
- [ ] On-chain novel registry fetch for homepage
- [ ] Wave points leaderboard page
- [ ] PDF/EPUB export feature
- [ ] Dark mode toggle
- [ ] Author dashboard (earnings, reader stats)
- [ ] Proof-of-Read badge system (stream duration → NFT)
- [ ] Mobile-responsive reading UI
- [ ] Testnet faucet integration for new readers
- [ ] CI/CD pipeline (GitHub Actions)

---

## 🤝 Contributing

1. Browse open issues labeled `good first issue` or `wave-bounty`
2. Comment on the issue to claim it
3. Fork → branch → PR
4. Earn Wave Points for merged contributions

All contributors who merge a PR before the Wave cycle ends share the reward pool proportional to their points.

---

## 📄 License

MIT — see [LICENSE](LICENSE).

---

> *"Drips aren't just for software developers — they're for all creators."*
