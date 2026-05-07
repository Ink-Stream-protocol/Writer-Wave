# InkStream — Drips Wave Program Plan

## What is InkStream?

InkStream is a decentralized bookstore built on Soroban (Stellar) and Drips Network. Readers pay authors by the second while reading, or buy a novel permanently as an on-chain asset. The project is open-source and designed for community contribution through the Drips Wave program.

---

## How We Use the Wave

InkStream runs sprint cycles of **4 weeks**. Each cycle opens a batch of scoped GitHub issues across five tracks. Contributors pick up issues, submit PRs, and earn Wave Points. At the end of each cycle, points are tallied and contributors receive a proportional share of the reward pool.

---

## Issue Tracks & Types of Work

### `track: contract`
Soroban smart contract work in Rust. These issues touch `contracts/ink_stream/src/lib.rs`.

**Examples:**
- Implement chapter-level access control so readers only unlock chapters they've paid for
- Add configurable royalty basis points per novel (author sets their own resale %)
- Emit contract events for `publish`, `buy_full`, and `resell` for indexing
- Write fuzz tests for the `resell` function edge cases
- Add a `withdraw` function for authors to pull accumulated streaming escrow

**Skill level:** Intermediate–Advanced Rust, Soroban SDK familiarity

---

### `track: streaming`
TypeScript work in `streaming/src/`. These issues wire up the real Drips SDK and improve stream reliability.

**Examples:**
- Replace the mock `DripsClient` stub with real `@drips-network/sdk` calls in `streamClient.ts`
- Add stream analytics: track total USDC streamed per session and expose it to the UI
- Implement retry logic when a stream fails to start due to network error
- Write unit tests for `authorList.ts` weight validation
- Add a `getStreamStatus()` helper that returns live stream state

**Skill level:** Intermediate TypeScript, some Web3/EVM knowledge helpful

---

### `track: frontend`
Next.js 14 + Tailwind UI work in `frontend/src/`. These issues improve the reader and author experience.

**Examples:**
- Integrate Freighter wallet in `BuyButton.tsx` to sign real Soroban transactions
- Build an author dashboard page showing earnings, reader count, and stream history
- Add dark mode toggle with `next-themes`
- Implement a reading progress bar that persists across sessions via `localStorage`
- Build a search and filter UI for the bookstore homepage
- Add PDF/EPUB export for owned novels
- Make the reading UI fully mobile-responsive
- Add a "Proof-of-Read" badge display for readers who streamed > 1 hour

**Skill level:** Beginner–Intermediate React/Next.js, Tailwind

---

### `track: wave`
Wave mechanics — point tracking, leaderboard, and reward distribution logic.

**Examples:**
- Build a Wave Points leaderboard page (`/leaderboard`) showing top contributors and readers
- Implement on-chain point tracking: emit events when a reader streams > 1 hour
- Create an author "Consistency Points" tracker (chapter published per week = 500 pts)
- Build the reward pool distribution UI showing each contributor's share
- Write the Wave cycle reset script that snapshots points at end of sprint

**Skill level:** Intermediate full-stack, some smart contract knowledge

---

### `track: infra`
DevOps, CI/CD, and developer tooling.

**Examples:**
- Set up GitHub Actions to build and test the Soroban contract on every PR
- Add a testnet faucet integration so new readers can get XLM to try the app
- Write a contract deployment script with environment variable injection
- Add Prettier + ESLint config across the frontend and streaming packages
- Set up Vitest for the streaming package with coverage reporting
- Write a `docker-compose.yml` for local development

**Skill level:** Beginner–Intermediate DevOps/CI

---

### `track: docs`
Documentation, guides, and content.

**Examples:**
- Write a "How to Publish Your First Novel" guide for authors
- Add JSDoc comments to all exported functions in `streaming/src/`
- Create a CONTRIBUTING.md with branch naming conventions and PR checklist
- Document the Wave Points system with examples in the README
- Write a architecture deep-dive blog post for the Drips ecosystem

**Skill level:** Beginner — great for first-time open-source contributors

---

## Point Values

| Issue Size | Points | Examples |
|------------|--------|---------|
| Small | 100 pts | Bug fix, doc update, adding tests |
| Medium | 250 pts | New UI component, SDK wiring, CI setup |
| Large | 500 pts | New contract feature, full page build, leaderboard |
| Epic | 1000 pts | Freighter integration, full author dashboard |

---

## Sprint Cycle

- **Week 1–2:** Issues open, contributors claim by commenting
- **Week 3:** PRs submitted and reviewed
- **Week 4:** Merges finalized, points tallied, reward pool distributed

All issues are labeled `wave-bounty` with their point value. First-time contributors should look for `good first issue`.
