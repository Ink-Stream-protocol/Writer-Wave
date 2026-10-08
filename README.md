# ✍️ InkStream: the streaming bookstore

**Reading is streaming.** InkStream is an open-source, decentralized bookstore on **Stellar / Soroban**. Readers pay authors **by the second** while they read, or buy a novel as a permanent on-chain asset. Authors get paid instantly and earn more through **The Writer's Wave**: recurring Writing Sprints with a shared reward pool.

Everything runs on Stellar with **one wallet**. The app has the **Starling** wallet built in, and readers can also connect Freighter, xBull, Albedo, LOBSTR, Hana and others.

---

## 🌊 The problem: the $20 barrier

Most readers won't pay up front for a book they might not finish. InkStream removes that:

| Mode | How it works |
|---|---|
| **Stream to read** | You put down a small refundable deposit, and the author earns per second while you read (for example 1 XLM/hour). When you stop, the rest of the deposit comes back. |
| **Stream-to-own** ✨ | Every second you stream counts toward the price. Once you've streamed the full price, the book is yours. Buying later only costs the difference. |
| **Buy forever** | One payment straight to the author, with ownership recorded on-chain. |
| **Resell** | List your copy for sale. The buyer pays you, and the author's royalty (set by the author, up to 50%) is enforced by the contract. |

## 🏆 The Writer's Wave

InkStream adopts the **Drips Wave** model. Every few weeks a **Writing Sprint** runs with a reward pool that anyone can fund (sponsors, publishers, fans, the ecosystem). Points are recorded **on-chain, automatically**, the moment they're earned:

| Action | Who | Points (default, the admin can tune them) |
|---|---|---|
| Publish a chapter (counts once per novel per day, so it can't be spammed) | Author | **100** |
| Weekly streak: at least one chapter in consecutive weeks | Author | **+50 × streak length** (4 weeks ≈ 800 pts) |
| Sell a copy (buy forever or stream-to-own) | Author | **50** |
| Your book is resold | Author | **25** (plus the royalty) |
| Stream a full hour | Reader | **50** per hour |
| An hour of your book is read | Author | **20** per reader-hour |
| Close a GitHub issue / merged PR | Contributor | **100–1000**, awarded by the admin |

When the sprint ends, everyone claims `pool × your points ÷ total points` straight from the app. No spreadsheets, and no one needs to be trusted to pay out.

```
Readers ──(stream / buy)──► Authors ──(publish chapters)──┐
   │                                                      ▼
   └────(hours read)────► writer_wave contract ◄── ink_stream reports points
                                   ▲                       │
 Sponsors ──(fund pool)────────────┘    Contributors ◄─(admin awards for PRs)
                                   │
                          sprint ends → everyone claims a pro-rata share
```

## 🏗 Architecture

```
Writer-Wave/
├── contracts/                 Rust · soroban-sdk 28
│   ├── ink_stream/            publish · add_chapter · buy · start/stop_stream · settle
│   │                          list_resale · buy_resale · views   → reports Wave points
│   ├── writer_wave/           sprints · fund · record (reporters) · award · claim · standings
│   └── escrow/                "Safe pay" for the Starling wallet
├── frontend/                  React 19 + Vite + TypeScript (website + Chrome extension)
│   └── src/
│       ├── components/ink/    Bookstore · NovelPage (buy/stream/read/resell) · Studio · WavePage
│       ├── components/        Starling wallet: Send · Receive (QR) · Scan to pay · Convert (DEX)
│       │                      Cash in/out (SEP-24 anchors) · Safe pay · Assets · Activity
│       └── lib/               soroban.ts (generic RPC) · ink.ts · wave.ts · escrow.ts · wallets.ts
├── scripts/deploy.sh          build → deploy all contracts → wire up → start Sprint 1 → write .env
└── .github/workflows/         CI (cargo test + clippy + wasm, vitest + builds) · GitHub Pages
```

**Why everything is on Stellar:** the first version planned Drips streams on an EVM chain. That would have meant a second wallet, a bridge, and gas on another network. InkStream now streams natively in a Soroban contract instead: one wallet, roughly 5-second finality, and fees under a cent. The Writer's Wave keeps the Drips Wave idea of rewarding contributors from a shared pool, and puts the points and payouts on-chain.

### Contract highlights

- **Per-second settlement.** `owed = rate × seconds`, capped by the deposit and by the remaining price. Anyone can call `settle` (for example the author, to pull earnings mid-stream).
- **Safe by construction.** Each function authorizes the right party with `require_auth`. Funds only move from reader to author, refunds go back to the reader, and nobody else can touch deposits.
- **Wave reporting is best-effort.** If the Wave isn't configured or no sprint is running, buying and streaming still work.
- **Typed errors, events and storage TTL.** Contracts use `#[contracterror]`, events for indexers, and persistent-storage TTL extension.
- **Tests:** 27 unit and integration tests, including `ink_stream` and `writer_wave` running together.

> Chapter text is stored on-chain, so it's public ledger data. The app gates reading in the interface. Encrypted or IPFS-hosted chapters are on the roadmap.

## 🚀 Getting started

**Prerequisites:**

- Node 20+
- Rust with the wasm target: `rustup target add wasm32v1-none`
- [Stellar CLI](https://developers.stellar.org/docs/tools/cli): `cargo install --locked stellar-cli`

```bash
git clone https://github.com/Ink-Stream-protocol/Writer-Wave.git && cd Writer-Wave

# 1. Contracts: test, build, deploy to testnet, start Sprint 1, write frontend/.env
./scripts/deploy.sh

# 2. App
cd frontend
npm install
npm run dev            # http://localhost:5173
```

In the app:

1. **Start reading**, then **Create a new wallet**.
2. Click **Get free test XLM**.
3. Publish a novel in **Author Studio**, read and stream in the **Bookstore**, and watch your points in **Writer's Wave**.

To see the sprint admin panel (start sprints, award contribution points, tune point values), import the admin key in the app's connect dialog. Get the key with `stellar keys show inkstream-admin`.

### Tests

```bash
cd contracts && cargo test                 # 27 contract tests
cd frontend  && npm test                   # 29 client tests
```

### Chrome extension

`cd frontend && npm run build:extension`. Then open `chrome://extensions`, turn on Developer mode, click **Load unpacked** and choose `frontend/dist-extension`.

## 🗺 Roadmap: open Wave issues

**Contracts**

- Chapter-level pricing
- Encrypted chapters (reader key exchange)
- IPFS/Arweave content with on-chain hashes
- Proof-of-Read badges as NFTs
- Configurable sprint pools in USDC

**Wave**

- A sprint snapshot / indexer service
- Leaderboard history
- Quadratic or multiplier scoring experiments
- Sponsor pages

**Frontend**

- Author analytics charts
- EPUB/PDF export for owners
- Reading progress sync
- Search by author
- i18n (Yoruba, Hausa, Igbo, French…)

**Infra**

- Mainnet deployment guide
- Docker devnet (`stellar container start`)
- Contract upgrade flow

See [WAVE_PLAN.md](WAVE_PLAN.md) for tracks, point values and the sprint cycle, and [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

## 📄 License

MIT. See [LICENSE](LICENSE).

> *"Drips aren't just for software developers — they're for all creators."*
