# InkStream — Drips Wave Program Plan

## What is InkStream?

InkStream is a decentralized bookstore built entirely on Soroban (Stellar). Readers pay authors by the second while reading (stream-to-own), or buy a novel permanently as an on-chain asset. The project is open-source and designed for community contribution through the Drips Wave program — and runs its own on-chain Writer's Wave for authors and readers (`contracts/writer_wave`).

---

## How We Use the Wave

InkStream runs sprint cycles of **4 weeks**. Each cycle opens a batch of scoped GitHub issues across five tracks. Contributors pick up issues, submit PRs, and earn Wave Points. Merged-PR points are awarded on-chain by the sprint admin (`writer_wave.award`), alongside the points authors and readers earn automatically. At the end of each cycle, everyone claims a proportional share of the reward pool from the app's **Writer's Wave** page.

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
Per-second streaming lives in `contracts/ink_stream` (`start_stream`, `settle`, `stop_stream`) and its client in `frontend/src/lib/ink.ts`.

**Examples:**
- Add an optional keeper script that calls `settle` for long-running streams
- Auto-stop streams after N minutes of reader inactivity (UI prompt + `stop_stream`)
- Stream analytics: total streamed per novel/session, charts in Author Studio
- Support a USDC payment token deployment alongside XLM
- Explore Drips (EVM) interoperability for authors who also have Drips lists

**Skill level:** Intermediate TypeScript and/or Rust

---

### `track: frontend`
React 19 + Vite UI work in `frontend/src/` (website + Chrome extension). These issues improve the reader and author experience.

**Examples:**
- Build an author dashboard page showing earnings, reader count, and stream history
- Implement a reading progress bar that persists across sessions via `localStorage`
- Build a search and filter UI for the bookstore homepage
- Add PDF/EPUB export for owned novels
- Make the reading UI fully mobile-responsive
- Add a "Proof-of-Read" badge display for readers who streamed > 1 hour

**Skill level:** Beginner–Intermediate React + TypeScript

---

### `track: wave`
Wave mechanics — point tracking, leaderboard, and reward distribution logic.

**Examples:**
- Leaderboard history across sprints (indexer reading `wave/points` events)
- A GitHub Action that proposes `award` transactions from merged PRs' `wave-bounty` labels
- Sponsor page: who funded each pool, with links
- Experiment with multipliers (e.g. first-time authors) via `set_points`
- Sweep unclaimed dust into the next sprint's pool

**Skill level:** Intermediate full-stack, some smart contract knowledge

---

### `track: infra`
DevOps, CI/CD, and developer tooling.

**Examples:**
- Mainnet deployment guide and checklist
- Contract upgrade flow (`update_current_contract_wasm`) with admin
- Add Prettier + ESLint config across the frontend and streaming packages
- Add Vitest coverage reporting for `frontend/src/lib`
- Local devnet with `stellar container start` + seeded demo novels

**Skill level:** Beginner–Intermediate DevOps/CI

---

### `track: docs`
Documentation, guides, and content.

**Examples:**
- Write a "How to Publish Your First Novel" guide for authors
- Add JSDoc comments to all exported functions in `frontend/src/lib/`
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
