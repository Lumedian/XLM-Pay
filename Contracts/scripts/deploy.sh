#!/bin/bash
set -e

log() { echo "[$(date +'%Y-%m-%dT%H:%M:%S%z')] [DEPLOY] $1"; }

# --- Config ---
NETWORK=${STELLAR_NETWORK:-testnet}
RPC_URL=${STELLAR_RPC_URL:-"https://soroban-testnet.stellar.org"}
OUTPUT_FILE="deployed_contracts.env"
DEPLOY_LOG="deploy_$(date +'%Y%m%d_%H%M%S').log"

# --- Guards ---
if [ -z "$STELLAR_SECRET_KEY" ]; then
    log "Error: STELLAR_SECRET_KEY is not set"
    exit 1
fi

# --- Setup ---
log "Network: $NETWORK | RPC: $RPC_URL"
log "Logging to $DEPLOY_LOG"
exec > >(tee -a "$DEPLOY_LOG") 2>&1

# Backup existing deployment before proceeding
./scripts/rollback.sh backup

# Configure network
if ! stellar config network get "$NETWORK" >/dev/null 2>&1; then
    log "Configuring network $NETWORK..."
    stellar config network add \
        --rpc-url "$RPC_URL" \
        --network-passphrase "Test SDF Network ; September 2015" \
        "$NETWORK"
fi

# Add deployer identity
stellar keys add deployer --secret-key "$STELLAR_SECRET_KEY" >/dev/null 2>&1

# --- Build ---
log "Building contracts..."
./build.sh

# --- Pre-deploy validation ---
log "Running pre-deploy validation..."
./scripts/validate.sh

# --- Deploy ---
> "$OUTPUT_FILE"  # Reset output file

deploy_contract() {
    local wasm_path=$1
    local contract_name=$2

    if [ ! -f "$wasm_path" ]; then
        log "Skipping $contract_name — WASM not found"
        return
    fi

    log "Deploying $contract_name..."
    local output
    if ! output=$(stellar contract deploy \
        --wasm "$wasm_path" \
        --source deployer \
        --network "$NETWORK" \
        --no-wait 2>&1); then
        log "Error deploying $contract_name: $output"
        log "Triggering rollback..."
        ./scripts/rollback.sh restore "$NETWORK"
        stellar keys rm deployer 2>/dev/null || true
        exit 1
    fi

    local contract_id
    contract_id=$(echo "$output" | tail -n 1)
    log "$contract_name deployed: $contract_id"
    echo "${contract_name^^}_ID=$contract_id" >> "$OUTPUT_FILE"
}

deploy_contract "target/wasm32-unknown-unknown/release/trading.wasm"      "trading"
deploy_contract "target/wasm32-unknown-unknown/release/token.wasm"         "token"
deploy_contract "target/wasm32-unknown-unknown/release/yield_farming.wasm" "yield_farming"

# --- Post-deploy validation ---
log "Running post-deploy validation..."
# shellcheck disable=SC1091
source "$OUTPUT_FILE"

source ./scripts/validate.sh

for contract_var in TRADING_ID TOKEN_ID YIELD_FARMING_ID; do
    id="${!contract_var}"
    name="${contract_var/_ID/}"
    if [ -n "$id" ]; then
        if ! stellar contract info --id "$id" --network "$NETWORK" >/dev/null 2>&1; then
            log "Post-deploy validation FAILED for $name ($id)"
            log "Triggering rollback..."
            ./scripts/rollback.sh restore "$NETWORK"
            stellar keys rm deployer 2>/dev/null || true
            exit 1
        fi
        log "Post-deploy OK: $name ($id)"
    fi
done

# --- Cleanup ---
stellar keys rm deployer 2>/dev/null || true
log "Deployment complete. Contract IDs saved to $OUTPUT_FILE"
log "Deploy log saved to $DEPLOY_LOG"
cat "$OUTPUT_FILE"