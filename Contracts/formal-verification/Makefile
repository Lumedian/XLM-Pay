# Makefile for Formal Verification
# This Makefile provides convenient commands for running formal verification

.PHONY: help install verify quick clean report

# Default target
help:
	@echo "Formal Verification Commands:"
	@echo "  make install     - Install required verification tools"
	@echo "  make verify      - Run full formal verification"
	@echo "  make quick       - Run quick verification (subset of proofs)"
	@echo "  make report      - Generate and display verification report"
	@echo "  make clean       - Clean verification artifacts"
	@echo "  make help        - Show this help message"

# Install required tools
install:
	@echo "Installing formal verification tools..."
	cd tools && ./run-verification.sh install

# Run full verification
verify:
	@echo "Running full formal verification..."
	cd tools && ./run-verification.sh full

# Run quick verification
quick:
	@echo "Running quick verification..."
	cd tools && ./run-verification.sh quick

# Generate and display report
report:
	@echo "Generating verification report..."
	cd tools && ./run-verification.sh report

# Clean verification artifacts
clean:
	@echo "Cleaning verification artifacts..."
	rm -rf reports/
	rm -rf target/
	cargo clean

# Additional convenience targets

.PHONY: verify-token verify-academy verify-trading

# Verify specific contract families
verify-token:
	@echo "Verifying token contracts..."
	cd ../contracts/token && cargo kani

verify-academy:
	@echo "Verifying academy contracts..."
	cd ../contracts/academy && cargo kani

verify-trading:
	@echo "Verifying trading contracts..."
	cd ../contracts/trading && cargo kani

# Continuous verification
.PHONY: watch

watch:
	@echo "Starting continuous verification..."
	@echo "Press Ctrl+C to stop"
	while true; do \
		make quick; \
		sleep 300; \
	done

# Generate documentation
.PHONY: docs

docs:
	@echo "Generating verification documentation..."
	@echo "Specifications: formal-verification/specifications/"
	@echo "Proofs: formal-verification/proofs/"
	@echo "Reports: formal-verification/reports/"

# Check verification status
.PHONY: status

status:
	@echo "Formal Verification Status:"
	@echo "=========================="
	@if [ -f "reports/verification-report.json" ]; then \
		echo "Last verification: $$(jq -r '.timestamp' reports/verification-report.json)"; \
		echo "Success rate: $$(jq -r '.success_rate' reports/verification-report.json)%"; \
		echo "Passed proofs: $$(jq -r '.passed_count' reports/verification-report.json)"; \
		echo "Failed proofs: $$(jq -r '.failed_count' reports/verification-report.json)"; \
	else \
		echo "No verification report found. Run 'make verify' first."; \
	fi

# Integration with existing build system
.PHONY: build-all test-all

build-all:
	@echo "Building all contracts..."
	cd ../.. && cargo build --workspace

test-all:
	@echo "Running all tests..."
	cd ../.. && cargo test --workspace

# Security audit
.PHONY: audit

audit:
	@echo "Running security audit..."
	cd ../.. && cargo audit
	cd ../.. && cargo deny check

# Performance analysis
.PHONY: perf

perf:
	@echo "Running performance analysis..."
	@echo "This will run verification with timing measurements"
	# Add performance measurement commands here