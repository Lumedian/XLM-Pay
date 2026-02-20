#!/bin/bash
set -e

# Validation script for Stellara contract deployments

log() { echo "[$(date +'%Y-%m-%dT%H:%M:%S%z')] [VALIDATE] $1"; }

validate_environment() {
    log "Validating environment..."
    
    if ! command -v stellar &>/dev/null; then
        log "Error: stellar CLI not found"
        exit 1
    fi

    if ! command -v cargo &>/dev/null; then
        log "Error: cargo not found"
        exit 1
    fi

    if [ -z "$STELLAR_SECRET_KEY" ]; then
        log "Error: STELLAR_SECRET_KEY is not set"
        exit 1
    fi

    log "Environment OK"
}

validate_wasm_binaries() {
    log "Validating WASM binaries..."
    local contracts=("trading" "token" "yield_farming")
    local missing=0

    for contract in "${contracts[@]}"; do
        local path="target/wasm32-unknown-unknown/release/${contract}.wasm"
        if [ ! -f "$path" ]; then
            log "Error: Missing WASM binary: $path"
            missing=1
        else
            local size
            size=$(du -k "$path" | cut -f1)
            if [ "$size" -gt 100 ]; then
                log "Warning: $contract.wasm is ${size}KB — consider optimizing"
            fi
            log "OK: $path (${size}KB)"
        fi
    done

    if [ "$missing" -eq 1 ]; then
        log "Error: Missing WASM binaries. Run build.sh first."
        exit 1
    fi
}

validate_contract_live() {
    local contract_id=$1
    local contract_name=$2
    local network=$3

    log "Validating live contract: $contract_name ($contract_id)..."

    local info
    if ! info=$(stellar contract info --id "$contract_id" --network "$network" 2>&1); then
        log "Error: Contract $contract_name ($contract_id) is not reachable on $network"
        log "Details: $info"
        return 1
    fi

    log "OK: $contract_name is live on $network"
    return 0
}

validate_account_balance() {
    local network=$1
    log "Validating deployer account balance..."

    local info
    if ! info=$(stellar keys address deployer 2>/dev/null); then
        log "Warning: Could not retrieve deployer address"
        return
    fi

    log "Deployer address: $info"
    log "Ensure account is funded before deploying to $network"
}

# Run all validations
validate_environment
validate_wasm_binaries