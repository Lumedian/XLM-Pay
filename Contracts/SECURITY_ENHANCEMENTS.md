# Contract Upgrade Security Enhancements

## Overview

This document describes the security enhancements added to the Stellara smart contract upgrade governance system. These enhancements provide comprehensive validation, emergency halt mechanisms, cooling-off periods, and approval revocation capabilities to prevent accidental or malicious upgrades.

## New Features

### 1. Comprehensive Validation

All upgrade proposals are now validated before creation:

- **Hash Format Validation**: Contract hash must not be empty
- **Contract Address Validation**: Target contract address must be valid
- **Threshold Validation**: Approval threshold must be > 0 and ≤ number of approvers
- **Timelock Validation**: Minimum 1 hour (3600 seconds) timelock enforced
- **Approver Uniqueness**: All approver addresses must be unique
- **Version Validation**: Proposed version must be greater than current version

**Error Codes:**
- `InvalidHashFormat` (2009): Contract hash is empty or malformed
- `InvalidContractAddress` (2010): Target contract address is invalid
- `InvalidThreshold` (2006): Threshold is zero or exceeds approver count
- `TimelockTooShort` (2011): Timelock delay is below minimum
- `DuplicateApprover` (2012): Approver list contains duplicates
- `VersionNotIncreasing` (2014): Proposed version not greater than current

### 2. Emergency Halt Mechanism

Administrators can immediately halt problematic proposals:

```bash
# Halt an approved proposal
stellar contract invoke \
  --id $CONTRACT_ID \
  --source $ADMIN \
  -- halt_upgrade \
  --proposal_id 1 \
  --admin "$ADMIN" \
  --reason "Security issue detected"
```

**Features:**
- Halted proposals cannot be executed even if timelock expired
- Only admins can halt proposals
- Halt reason is recorded on-chain
- Emits `ProposalHaltedEvent` for audit trail

**Error Codes:**
- `ProposalHalted` (2015): Attempted to execute a halted proposal
- `CannotHaltExecuted` (2016): Cannot halt already executed proposals

### 3. Resume Halted Proposals

Halted proposals can be resumed with a new timelock:

```bash
# Resume a halted proposal
stellar contract invoke \
  --id $CONTRACT_ID \
  --source $ADMIN \
  -- resume_upgrade \
  --proposal_id 1 \
  --admin "$ADMIN" \
  --new_timelock_delay 7200
```

**Features:**
- Requires admin authorization
- Sets new timelock period for safety
- Restores proposal to previous status (Approved or Pending)
- Emits `ProposalResumedEvent`

**Error Codes:**
- `NotHalted` (2017): Attempted to resume non-halted proposal

### 4. Cooling-Off Period

Proposals have a mandatory cooling-off period before first approval:

**Default:** 1 hour (3600 seconds)

**Purpose:** Prevents rushed approvals by requiring time for review

```bash
# Approval will fail if cooling-off period not expired
stellar contract invoke \
  --id $CONTRACT_ID \
  --source $APPROVER \
  -- approve_upgrade \
  --proposal_id 1 \
  --approver "$APPROVER"
# Error: CoolingOffNotExpired
```

**Error Codes:**
- `CoolingOffNotExpired` (2018): Approval attempted before cooling-off period

### 5. Approval Revocation

Approvers can revoke their approval before threshold is reached:

```bash
# Revoke an approval
stellar contract invoke \
  --id $CONTRACT_ID \
  --source $APPROVER \
  -- revoke_approval_upgrade \
  --proposal_id 1 \
  --approver "$APPROVER"
```

**Features:**
- Allows approvers to change their mind
- Only works before threshold is reached
- Decrements approval count
- Emits `ApprovalRevokedEvent`

**Error Codes:**
- `ApprovalNotFound` (2019): No approval to revoke
- `CannotRevokeAfterThreshold` (2020): Cannot revoke after threshold reached

### 6. Time-to-Execution Query

Query how much time remains until a proposal can be executed:

```bash
# Get time remaining
stellar contract invoke \
  --id $CONTRACT_ID \
  -- get_time_to_execution \
  --proposal_id 1
# Returns: seconds remaining (0 if can execute now)
```

### 7. Enhanced Metadata

Proposals now include additional metadata:

- `cooling_off_period`: Minimum time before first approval
- `current_version`: Current contract version
- `proposed_version`: Proposed contract version
- `simulation_passed`: Whether simulation tests passed
- `simulation_metadata`: Simulation results summary
- `breaking_change`: Whether this is a breaking change
- `halt_reason`: Reason if halted
- `halted_at`: Timestamp when halted

### 8. Comprehensive Event Emission

All governance actions emit events for audit trail:

- `ProposalCreatedEvent`: When proposal is created
- `ProposalApprovedEvent`: When approval is recorded
- `ProposalHaltedEvent`: When proposal is halted
- `ProposalResumedEvent`: When proposal is resumed
- `ApprovalRevokedEvent`: When approval is revoked
- `ValidationFailedEvent`: When validation fails
- `ProposalExecutedEvent`: When proposal is executed

## Usage Examples

### Example 1: Create Proposal with Validation

```bash
# All parameters are validated
stellar contract invoke \
  --id $CONTRACT_ID \
  --source $ADMIN \
  -- propose_upgrade \
  --admin "$ADMIN" \
  --new_contract_hash "QmNewContractHash" \
  --description "Add new features" \
  --approvers '["'"$APPROVER1"'", "'"$APPROVER2"'", "'"$APPROVER3"'"]' \
  --approval_threshold 2 \
  --timelock_delay 3600

# If validation fails, specific error code is returned
# Example errors:
# - InvalidHashFormat: if hash is empty
# - InvalidThreshold: if threshold > 3
# - TimelockTooShort: if delay < 3600
# - DuplicateApprover: if approvers list has duplicates
```

### Example 2: Halt and Resume Workflow

```bash
# 1. Create and approve proposal
PROPOSAL_ID=1

# 2. Detect issue and halt
stellar contract invoke \
  --id $CONTRACT_ID \
  --source $ADMIN \
  -- halt_upgrade \
  --proposal_id $PROPOSAL_ID \
  --admin "$ADMIN" \
  --reason "Bug detected"

# 3. Fix issue, then resume with new timelock
stellar contract invoke \
  --id $CONTRACT_ID \
  --source $ADMIN \
  -- resume_upgrade \
  --proposal_id $PROPOSAL_ID \
  --admin "$ADMIN" \
  --new_timelock_delay 7200
```

### Example 3: Approval with Revocation

```bash
# 1. Wait for cooling-off period (1 hour)
sleep 3600

# 2. Approve
stellar contract invoke \
  --id $CONTRACT_ID \
  --source $APPROVER1 \
  -- approve_upgrade \
  --proposal_id 1 \
  --approver "$APPROVER1"

# 3. Change mind and revoke (before threshold reached)
stellar contract invoke \
  --id $CONTRACT_ID \
  --source $APPROVER1 \
  -- revoke_approval_upgrade \
  --proposal_id 1 \
  --approver "$APPROVER1"
```

## Security Considerations

### Attack Vectors Prevented

1. **Invalid Proposals**: Comprehensive validation prevents malformed proposals
2. **Rushed Approvals**: Cooling-off period ensures time for review
3. **Malicious Upgrades**: Halt mechanism provides emergency stop
4. **Version Downgrades**: Version validation prevents downgrades
5. **Duplicate Approvers**: Uniqueness check prevents Sybil attacks

### Best Practices

1. **Always Review**: Use cooling-off period to thoroughly review proposals
2. **Monitor Events**: Set up alerts for halt and revocation events
3. **Test First**: Use testnet to validate upgrade procedures
4. **Document Changes**: Include detailed descriptions in proposals
5. **Coordinate**: Ensure all approvers are available during upgrade window

### Threat Model

**Protected Against:**
- Invalid proposal parameters ✓
- Premature approvals ✓
- Execution of problematic upgrades ✓
- Version downgrades ✓
- Approval manipulation ✓

**Still Requires External Measures:**
- All approvers colluding
- Compromise of admin keys
- Social engineering
- Network-level attacks

## Error Code Reference

| Code | Error | Description |
|------|-------|-------------|
| 2001 | Unauthorized | Caller lacks required role |
| 2002 | InvalidProposal | Proposal in invalid state |
| 2003 | InsufficientApprovals | Not enough approvals |
| 2004 | TimelockNotExpired | Timelock period not passed |
| 2005 | ProposalNotApproved | Proposal not approved |
| 2006 | InvalidThreshold | Invalid approval threshold |
| 2007 | DuplicateApproval | Approver already approved |
| 2008 | ProposalNotFound | Proposal doesn't exist |
| 2009 | InvalidHashFormat | Contract hash is invalid |
| 2010 | InvalidContractAddress | Contract address is invalid |
| 2011 | TimelockTooShort | Timelock below minimum |
| 2012 | DuplicateApprover | Duplicate in approver list |
| 2013 | InvalidVersion | Version number malformed |
| 2014 | VersionNotIncreasing | Version not greater than current |
| 2015 | ProposalHalted | Proposal is halted |
| 2016 | CannotHaltExecuted | Cannot halt executed proposal |
| 2017 | NotHalted | Proposal is not halted |
| 2018 | CoolingOffNotExpired | Cooling-off period not passed |
| 2019 | ApprovalNotFound | No approval to revoke |
| 2020 | CannotRevokeAfterThreshold | Cannot revoke after threshold |

## Testing

Comprehensive tests are included in `shared/src/governance_tests.rs`:

- Validation module tests
- Proposal lifecycle tests
- Halt and resume workflow tests
- Cooling-off period enforcement tests
- Approval revocation tests

Run tests:
```bash
cargo test --lib -p shared
```

## Migration Guide

### For Existing Contracts

1. Update shared library dependency
2. Existing proposals will have default values for new fields
3. No breaking changes to existing functionality
4. New features are opt-in

### For New Contracts

1. Use enhanced `propose_upgrade` with validation
2. Implement halt/resume handlers
3. Add approval revocation support
4. Monitor new events for audit trail

---

**Version**: 1.0  
**Last Updated**: February 25, 2026  
**Status**: Production Ready
