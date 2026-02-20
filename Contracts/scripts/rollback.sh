#!/bin/bash
set -e

log() { echo "[$(date +'%Y-%m-%dT%H:%M:%S%z')] [ROLLBACK] $1"; }

BACKUP_FILE="deployed_contracts.env.backup"
CURRENT_FILE="deployed_contracts.env"

# Save current state as backup before any deployment
backup_deployment_state() {
    if [ -f "$CURRENT_FILE" ]; then
        cp "$CURRENT_FILE" "$BACKUP_FILE"
        log "Backup saved to $BACKUP_FILE"
    else
        log "No existing deployment state to backup"
    fi
}

# Restore previous state from backup
rollback_deployment_state() {
    if [ ! -f "$BACKUP_FILE" ]; then
        log "Error: No backup file found at $BACKUP_FILE. Cannot rollback."
        exit 1
    fi

    log "Rolling back to previous deployment state..."
    cp "$BACKUP_FILE" "$CURRENT_FILE"
    log "Restored $BACKUP_FILE -> $CURRENT_FILE"
    cat "$CURRENT_FILE"
}

# Upgrade a contract back to a previous WASM (on-chain rollback)
rollback_contract_wasm() {
    local contract_id=$1
    local contract_name=$2
    local previous_wasm=$3
    local network=${4:-testnet}

    if [ ! -f "$previous_wasm" ]; then
        log "Error: Previous WASM not found at $previous_wasm"
        exit 1
    fi

    log "Rolling back $contract_name ($contract_id) to $previous_wasm on $network..."

    stellar contract upload \
        --wasm "$previous_wasm" \
        --source deployer \
        --network "$network"

    log "Rollback complete for $contract_name"
    log "Note: You must invoke the contract's migrate() function if state migration is needed"
}

# Full rollback entry point
full_rollback() {
    local network=${1:-testnet}
    log "Starting full rollback on $network..."

    rollback_deployment_state

    # Source backup to get old IDs
    # shellcheck disable=SC1090
    source "$BACKUP_FILE"

    log "Previous contract IDs restored:"
    cat "$CURRENT_FILE"

    log "Full rollback complete. Validate contracts manually:"
    log "  ./scripts/validate.sh"
}

# Parse arguments
case "${1:-}" in
    backup)  backup_deployment_state ;;
    restore) full_rollback "${2:-testnet}" ;;
    wasm)    rollback_contract_wasm "$2" "$3" "$4" "${5:-testnet}" ;;
    *)
        echo "Usage:"
        echo "  $0 backup                             # Save current state"
        echo "  $0 restore [network]                  # Restore previous state"
        echo "  $0 wasm <id> <name> <wasm> [network]  # Rollback specific contract WASM"
        ;;
esac