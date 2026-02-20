#!/bin/bash

# Formal Verification Runner Script
# This script runs all formal verification proofs for the Stellara contracts

set -e  # Exit on any error

echo "🚀 Starting Formal Verification Process"
echo "======================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
CONTRACTS_DIR="../contracts"
VERIFICATION_DIR="."
TOOLS_DIR="$VERIFICATION_DIR/tools"
PROOFS_DIR="$VERIFICATION_DIR/proofs"
REPORTS_DIR="$VERIFICATION_DIR/reports"

# Create reports directory if it doesn't exist
mkdir -p "$REPORTS_DIR"

# Function to run a single proof
run_proof() {
    local proof_name=$1
    local proof_file=$2
    local timeout=$3
    
    echo -e "${BLUE}Running proof: $proof_name${NC}"
    
    # Run Kani with timeout
    if timeout "$timeout"s cargo kani --proof-name "$proof_name" --manifest-path "$proof_file" 2>&1 | tee "$REPORTS_DIR/${proof_name}.log"; then
        echo -e "${GREEN}✓ Proof $proof_name: PASSED${NC}"
        return 0
    else
        echo -e "${RED}✗ Proof $proof_name: FAILED${NC}"
        return 1
    fi
}

# Function to run all proofs
run_all_proofs() {
    echo -e "${YELLOW}Running all formal verification proofs...${NC}"
    
    local failed_proofs=()
    local passed_proofs=()
    
    # Load proof configuration
    if [ -f "$TOOLS_DIR/kani-config.json" ]; then
        # Parse JSON configuration (simplified parsing)
        # In production, use jq or proper JSON parser
        echo "Using proof configuration from $TOOLS_DIR/kani-config.json"
    fi
    
    # Run individual proofs
    echo -e "${BLUE}Testing transfer safety properties...${NC}"
    if run_proof "transfer_non_negative_amount" "$PROOFS_DIR/token-proofs.rs" 30; then
        passed_proofs+=("transfer_non_negative_amount")
    else
        failed_proofs+=("transfer_non_negative_amount")
    fi
    
    if run_proof "transfer_amount_conservation" "$PROOFS_DIR/token-proofs.rs" 60; then
        passed_proofs+=("transfer_amount_conservation")
    else
        failed_proofs+=("transfer_amount_conservation")
    fi
    
    echo -e "${BLUE}Testing approval and allowance properties...${NC}"
    if run_proof "approve_expiration_validation" "$PROOFS_DIR/token-proofs.rs" 30; then
        passed_proofs+=("approve_expiration_validation")
    else
        failed_proofs+=("approve_expiration_validation")
    fi
    
    if run_proof "transfer_from_allowance_check" "$PROOFS_DIR/token-proofs.rs" 45; then
        passed_proofs+=("transfer_from_allowance_check")
    else
        failed_proofs+=("transfer_from_allowance_check")
    fi
    
    echo -e "${BLUE}Testing mint and burn properties...${NC}"
    if run_proof "mint_supply_bounds" "$PROOFS_DIR/token-proofs.rs" 30; then
        passed_proofs+=("mint_supply_bounds")
    else
        failed_proofs+=("mint_supply_bounds")
    fi
    
    if run_proof "burn_balance_sufficiency" "$PROOFS_DIR/token-proofs.rs" 30; then
        passed_proofs+=("burn_balance_sufficiency")
    else
        failed_proofs+=("burn_balance_sufficiency")
    fi
    
    echo -e "${BLUE}Testing arithmetic and authorization safety...${NC}"
    if run_proof "arithmetic_safety_overflow" "$PROOFS_DIR/token-proofs.rs" 20; then
        passed_proofs+=("arithmetic_safety_overflow")
    else
        failed_proofs+=("arithmetic_safety_overflow")
    fi
    
    if run_proof "authorization_enforcement" "$PROOFS_DIR/token-proofs.rs" 25; then
        passed_proofs+=("authorization_enforcement")
    else
        failed_proofs+=("authorization_enforcement")
    fi
    
    if run_proof "total_supply_conservation" "$PROOFS_DIR/token-proofs.rs" 35; then
        passed_proofs+=("total_supply_conservation")
    else
        failed_proofs+=("total_supply_conservation")
    fi
    
    # Generate summary report
    generate_report "${passed_proofs[@]}" "${failed_proofs[@]}"
    
    # Return appropriate exit code
    if [ ${#failed_proofs[@]} -eq 0 ]; then
        echo -e "${GREEN}🎉 All proofs passed! Formal verification successful.${NC}"
        return 0
    else
        echo -e "${RED}❌ ${#failed_proofs[@]} proofs failed. Formal verification incomplete.${NC}"
        echo -e "${YELLOW}Failed proofs: ${failed_proofs[*]}${NC}"
        return 1
    fi
}

# Function to generate verification report
generate_report() {
    local passed_proofs=("$@")
    local failed_proofs=("${passed_proofs[@]:$#}")  # Extract failed proofs
    local total_proofs=$((${#passed_proofs[@]} + ${#failed_proofs[@]} - $#))
    
    # Remove the count from passed_proofs array
    passed_proofs=("${passed_proofs[@]:0:$#}")
    
    echo -e "\n${BLUE}=== FORMAL VERIFICATION REPORT ===${NC}" | tee "$REPORTS_DIR/summary.txt"
    echo "Generated: $(date)" | tee -a "$REPORTS_DIR/summary.txt"
    echo "Total Proofs: $total_proofs" | tee -a "$REPORTS_DIR/summary.txt"
    echo "Passed: ${#passed_proofs[@]}" | tee -a "$REPORTS_DIR/summary.txt"
    echo "Failed: ${#failed_proofs[@]}" | tee -a "$REPORTS_DIR/summary.txt"
    echo "Success Rate: $(((${#passed_proofs[@]} * 100) / total_proofs))%" | tee -a "$REPORTS_DIR/summary.txt"
    
    echo -e "\n${GREEN}✅ Passed Proofs:${NC}" | tee -a "$REPORTS_DIR/summary.txt"
    for proof in "${passed_proofs[@]}"; do
        echo "  • $proof" | tee -a "$REPORTS_DIR/summary.txt"
    done
    
    if [ ${#failed_proofs[@]} -gt 0 ]; then
        echo -e "\n${RED}❌ Failed Proofs:${NC}" | tee -a "$REPORTS_DIR/summary.txt"
        for proof in "${failed_proofs[@]}"; do
            echo "  • $proof" | tee -a "$REPORTS_DIR/summary.txt"
        done
    fi
    
    # Generate JSON report
    cat > "$REPORTS_DIR/verification-report.json" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "total_proofs": $total_proofs,
  "passed_count": ${#passed_proofs[@]},
  "failed_count": ${#failed_proofs[@]},
  "success_rate": $(((${#passed_proofs[@]} * 100) / total_proofs)),
  "passed_proofs": [$(printf '"%s",' "${passed_proofs[@]}" | sed 's/,$//')],
  "failed_proofs": [$(printf '"%s",' "${failed_proofs[@]}" | sed 's/,$//')],
  "environment": {
    "kani_version": "$(kani --version 2>/dev/null || echo 'unknown')",
    "rust_version": "$(rustc --version 2>/dev/null || echo 'unknown')",
    "platform": "$(uname -s 2>/dev/null || echo 'windows')"
  }
}
EOF
}

# Function to install required tools
install_tools() {
    echo -e "${YELLOW}Installing required verification tools...${NC}"
    
    # Check if Kani is installed
    if ! command -v kani &> /dev/null; then
        echo "Installing Kani Rust Verifier..."
        cargo install --locked kani-verifier
    else
        echo "Kani already installed: $(kani --version)"
    fi
    
    # Check if cargo-hack is installed
    if ! command -v cargo-hack &> /dev/null; then
        echo "Installing cargo-hack..."
        cargo install cargo-hack
    else
        echo "cargo-hack already installed"
    fi
    
    echo -e "${GREEN}✓ All tools installed${NC}"
}

# Function to run quick verification (subset of proofs)
run_quick_verification() {
    echo -e "${YELLOW}Running quick verification...${NC}"
    
    local quick_proofs=(
        "transfer_non_negative_amount"
        "arithmetic_safety_overflow"
        "authorization_enforcement"
    )
    
    local failed=0
    for proof in "${quick_proofs[@]}"; do
        if ! run_proof "$proof" "$PROOFS_DIR/token-proofs.rs" 30; then
            failed=1
        fi
    done
    
    if [ $failed -eq 0 ]; then
        echo -e "${GREEN}✓ Quick verification passed${NC}"
    else
        echo -e "${RED}✗ Quick verification failed${NC}"
        return 1
    fi
}

# Main execution
main() {
    case "${1:-full}" in
        "install")
            install_tools
            ;;
        "quick")
            run_quick_verification
            ;;
        "full"|*)
            install_tools
            run_all_proofs
            ;;
        "report")
            if [ -f "$REPORTS_DIR/summary.txt" ]; then
                cat "$REPORTS_DIR/summary.txt"
            else
                echo -e "${RED}No report found. Run verification first.${NC}"
                return 1
            fi
            ;;
        "help")
            echo "Usage: $0 [install|quick|full|report|help]"
            echo "  install  - Install required verification tools"
            echo "  quick    - Run quick verification (subset of proofs)"
            echo "  full     - Run complete formal verification (default)"
            echo "  report   - Display last verification report"
            echo "  help     - Show this help message"
            ;;
        *)
            echo -e "${RED}Unknown command: $1${NC}"
            echo "Use '$0 help' for usage information"
            return 1
            ;;
    esac
}

# Run main function
main "$@"