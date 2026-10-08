# Contributing to InkStream

Thanks for helping build the streaming bookstore! Merged PRs earn **Wave Points**, which are paid out from each Writing Sprint's reward pool (see [WAVE_PLAN.md](WAVE_PLAN.md)).

## Workflow

1. Find an issue labelled `wave-bounty` (or `good first issue`) and comment to claim it.
2. Fork the repo, then create a branch: `track/<track>-<short-desc>`, for example `track/frontend-reading-progress`.
3. Make your change and add tests.
4. Open a PR that links the issue. Include your Stellar address (`G…`) in the PR description so points can be awarded on-chain.

## Before you push

```bash
cd contracts && cargo test && cargo clippy --all-targets -- -D warnings
cd frontend  && npm test && npm run build
```

CI runs the same checks on every PR.

## Conventions

- **Contracts:** return typed errors (`#[contracterror]`), never `panic!` with strings. Use `require_auth` on the acting party, publish events for state changes, and extend persistent TTL on writes.
- **Frontend:** contract calls go through `src/lib/soroban.ts` (`readContract` / `invokeContract`) so built-in and external wallets both work. Show friendly errors through the per-contract error tables.
- Keep PRs focused. One issue per PR is ideal.

## Point values

| Size | Points |
|---|---|
| Small (bug fix, docs, tests) | 100 |
| Medium (component, SDK wiring, CI) | 250 |
| Large (contract feature, full page) | 500 |
| Epic | 1000 |
