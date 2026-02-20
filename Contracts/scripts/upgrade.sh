#!/bin/bash
set -e

log() { echo "[$(date +'%Y-%m-%dT%H:%M:%S%z')] [UPGRADE] $1"; }

source_env() {
    if [ ! -f "deployed_contracts.env" ]; then
        log "Error: deployed_contracts.env not found. Deploy contracts first."
        exit 1
    fi
    # shellcheck disable=SC1091
    source deployed_contracts.env
}

upgrade_contract() {
    local contract_id=$1
    local contract_name=$2
    local wasm_path=$3
    local network=${4:-testnet}

    log "Uploading new WASM for $contract_name..."
    local new_wasm_hash
    new_wasm_hash=$(stellar contract upload \
        --wasm "$wasm_path" \
        --source deployer \
        --network "$network" 2>&1 | tail -n 1)

    log "New WASM hash: $new_wasm_hash"

    log "Invoking upgrade on $contract_name ($contract_id)..."
    stellar contract invoke \
        --id "$contract_id" \
        --source deployer \
        --network "$network" \
        -- upgrade \
        --new_wasm_hash "$new_wasm_hash"

    log "Upgrade complete for $contract_name"
}

NETWORK=${STELLAR_NETWORK:-testnet}

# Backup current state before upgrade
./scripts/rollback.sh backup

source_env

log "Building latest contracts..."
cargo build --release --target wasm32-unknown-unknown

# Validate new binaries before upgrading
./scripts/validate.sh

log "Starting upgrades on $NETWORK..."

# Upgrade each contract — skip if ID not set
[ -n "${TRADING_ID:-}" ] && \
    upgrade_contract "$TRADING_ID" "trading" \
        "target/wasm32-unknown-unknown/release/trading.wasm" "$NETWORK"

[ -n "${TOKEN_ID:-}" ] && \
    upgrade_contract "$TOKEN_ID" "token" \
        "target/wasm32-unknown-unknown/release/token.wasm" "$NETWORK"

[ -n "${YIELD_FARMING_ID:-}" ] && \
    upgrade_contract "$YIELD_FARMING_ID" "yield_farming" \
        "target/wasm32-unknown-unknown/release/yield_farming.wasm" "$NETWORK"

log "All upgrades complete."