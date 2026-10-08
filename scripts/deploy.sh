#!/usr/bin/env bash
# Deploys InkStream's Soroban contracts and wires them together:
#   writer_wave  (Writing Sprints, points, reward pool)
#   ink_stream   (publish / buy / stream / resell — reports points to writer_wave)
#   escrow       (Safe pay in the Starling wallet)
# Then starts the first Writing Sprint and writes all IDs to frontend/.env.
#
# Needs: Rust + `rustup target add wasm32v1-none`, and the Stellar CLI
#   (cargo install --locked stellar-cli  — or —  brew install stellar-cli)
set -euo pipefail
NETWORK="${NETWORK:-testnet}"
IDENTITY="${IDENTITY:-inkstream-admin}"
SPRINT_NAME="${SPRINT_NAME:-Sprint 1 — Genesis}"
SPRINT_DAYS="${SPRINT_DAYS:-28}"
cd "$(dirname "$0")/.."

say() { printf "\n\033[1;35m▸ %s\033[0m\n" "$*"; }

say "Testing contracts"
(cd contracts && cargo test --quiet)

say "Building wasm"
(cd contracts && stellar contract build)
W=contracts/target/wasm32v1-none/release

if ! stellar keys address "$IDENTITY" >/dev/null 2>&1; then
  say "Creating admin key '$IDENTITY'"
  if [ "$NETWORK" = "testnet" ]; then
    stellar keys generate "$IDENTITY" --network testnet --fund
  else
    stellar keys generate "$IDENTITY"
    echo "Fund $(stellar keys address "$IDENTITY") on $NETWORK, then re-run."; exit 1
  fi
fi
ADMIN=$(stellar keys address "$IDENTITY")
XLM=$(stellar contract id asset --asset native --network "$NETWORK")
TOKEN="${PAY_TOKEN:-$XLM}"
OPTS=(--source-account "$IDENTITY" --network "$NETWORK")

say "Deploying writer_wave"
WAVE=$(stellar contract deploy --wasm "$W/writer_wave.wasm" "${OPTS[@]}" -- --admin "$ADMIN")
say "Deploying ink_stream"
INK=$(stellar contract deploy --wasm "$W/ink_stream.wasm" "${OPTS[@]}" -- --admin "$ADMIN" --token "$TOKEN" --wave "$WAVE")
say "Deploying escrow"
ESCROW=$(stellar contract deploy --wasm "$W/escrow.wasm" "${OPTS[@]}")

say "Allowing ink_stream to record Wave points"
stellar contract invoke --id "$WAVE" "${OPTS[@]}" -- set_reporter --reporter "$INK" --allowed true

NOW=$(date +%s)
say "Starting '$SPRINT_NAME' ($SPRINT_DAYS days)"
stellar contract invoke --id "$WAVE" "${OPTS[@]}" -- start_cycle --name "$SPRINT_NAME" --start "$NOW" --end $((NOW + SPRINT_DAYS * 86400)) --token "$TOKEN"

cat > frontend/.env <<ENV
VITE_STELLAR_NETWORK=$NETWORK
VITE_INK_CONTRACT_ID=$INK
VITE_WAVE_CONTRACT_ID=$WAVE
VITE_ESCROW_CONTRACT_ID=$ESCROW
VITE_READ_ACCOUNT=$ADMIN
VITE_PAY_SYMBOL=${PAY_SYMBOL:-XLM}
ENV

say "Done"
echo "  writer_wave : $WAVE"
echo "  ink_stream  : $INK"
echo "  escrow      : $ESCROW"
echo "  admin       : $ADMIN   (import this key into the app to see the Sprint admin panel:"
echo "                          stellar keys show $IDENTITY)"
echo
echo "Next: cd frontend && npm install && npm run dev"
