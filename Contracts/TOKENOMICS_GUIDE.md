# Stellara Tokenomics Implementation Guide

## 📋 Overview

This guide documents the sophisticated tokenomics mechanisms implemented for the Stellara ecosystem, including staking, yield farming, automated reward distribution, and governance token functionality.

## 🏗️ Architecture

### Core Components

1. **Staking Contract** - Variable reward staking with vesting options
2. **Yield Farming Contract** - Liquidity provider farming with bonus multipliers
3. **Reward Distributor** - Automated reward distribution with rule-based eligibility
4. **Governance Token** - Voting power and proposal management

### Design Principles

- **Modularity**: Each contract is independent but interoperable
- **Security**: Multi-layer authentication and emergency controls
- **Flexibility**: Configurable parameters and adaptive mechanisms
- **Transparency**: Comprehensive event emission and tracking
- **Scalability**: Efficient storage patterns and batch operations

## 🎯 Staking Contract (`StakingContract`)

### Features

#### Variable Reward System
```rust
pub struct StakingPosition {
    pub user: Address,
    pub amount: i128,
    pub start_time: u64,
    pub last_reward_time: u64,
    pub reward_multiplier: u32,    // 1x-3x based on lock period
    pub lock_period: u64,           // 30-365 days
    pub vesting_schedule: Option<VestingSchedule>,
}
```

#### Reward Calculation
- **Base Rewards**: `amount * rate * time_staked`
- **Bonus Rewards**: Base rewards * (multiplier - 100%)
- **Vesting**: Optional periodic vesting with cliff
- **APR Tracking**: Real-time APR calculation

#### Lock Period Multipliers
- **30 days**: 1.0x multiplier
- **90 days**: 1.5x multiplier
- **180 days**: 2.0x multiplier
- **365 days**: 3.0x multiplier

#### Key Functions
```rust
// Stake tokens with variable rewards
pub fn stake(
    env: Env,
    user: Address,
    amount: i128,
    lock_period: u64,
    vesting_periods: Option<u32>,
) -> Result<(), StakingError>

// Unstake and claim rewards
pub fn unstake(env: Env, user: Address) -> Result<i128, StakingError>

// Claim rewards without unstaking
pub fn claim_rewards(env: Env, user: Address) -> Result<i128, StakingError>
```

#### Security Features
- **Emergency Mode**: Admin-controlled emergency withdrawals
- **Early Withdrawal Fees**: 5% fee for early unstaking
- **Lock Period Enforcement**: Prevents early withdrawal without penalty
- **Position Limits**: One position per user

## 🌾 Yield Farming Contract (`YieldFarmingContract`)

### Features

#### Multi-Pool System
```rust
pub struct FarmingPool {
    pub lp_token: Address,         // Liquidity provider token
    pub reward_token: Address,      // Reward distribution token
    pub total_lp_staked: i128,
    pub reward_rate: i128,         // Per-second reward rate
    pub bonus_rate: i128,          // Additional bonus rate
    pub lock_period: u64,          // Minimum lock period
    pub max_multiplier: u32,        // Maximum bonus multiplier
    pub decay_period: u64,          // Bonus decay over time
    pub emergency_withdrawal: bool, // Emergency withdrawal status
}
```

#### Dynamic Bonus System
- **Time-Based Multipliers**: Higher for longer lock periods
- **Decay Mechanism**: Bonus decreases over time to encourage early adoption
- **Flexible Configuration**: Per-pool customization options

#### Reward Calculation
```rust
pub struct FarmingRewards {
    pub base_rewards: i128,      // Base farming rewards
    pub bonus_rewards: i128,     // Time-based bonus rewards
    pub total_rewards: i128,     // Combined rewards
    pub pending_rewards: i128,   // Claimable rewards
    pub apr: u32,               // Annual Percentage Rate (basis points)
}
```

#### Key Functions
```rust
// Start farming with LP tokens
pub fn start_farming(
    env: Env,
    user: Address,
    pool_id: u32,
    lp_amount: i128,
    lock_period_override: Option<u64>,
) -> Result<(), FarmingError>

// End farming and claim rewards
pub fn end_farming(env: Env, user: Address, pool_id: u32) -> Result<i128, FarmingError>

// Claim rewards without ending farming
pub fn claim_rewards(env: Env, user: Address, pool_id: u32) -> Result<i128, FarmingError>
```

#### Pool Management
- **Multiple Pools**: Support for different token pairs
- **Configurable Parameters**: Custom rates and multipliers per pool
- **Emergency Controls**: Admin-controlled emergency withdrawals

## 🎁 Reward Distributor (`RewardDistributor`)

### Features

#### Rule-Based Distribution
```rust
pub struct DistributionRule {
    pub rule_id: u32,
    pub name: Symbol,
    pub condition_type: ConditionType,  // Time/Balance/Activity/Tier/Custom
    pub reward_token: Address,
    pub reward_amount: i128,
    pub max_distributions: u32,
    pub current_distributions: u32,
    pub start_time: u64,
    pub end_time: Option<u64>,
    pub is_active: bool,
}
```

#### Condition Types
1. **TimeBased**: Distribute at specific time intervals
2. **BalanceBased**: Distribute based on user token balance
3. **ActivityBased**: Distribute based on user activity metrics
4. **TierBased**: Distribute based on user tier level
5. **Custom**: External verification for custom conditions

#### Eligibility System
```rust
pub struct UserEligibility {
    pub user: Address,
    pub rule_id: u32,
    pub is_eligible: bool,
    pub last_check_time: u64,
    pub custom_data: Map<Symbol, Val>, // Custom condition data
    pub multiplier: u32,             // Reward multiplier (basis points)
}
```

#### Automated Distribution
```rust
// Create automated distribution batch
pub fn create_batch(
    env: Env,
    admin: Address,
    rule_id: u32,
    recipients: Vec<Address>,
) -> Result<u64, DistributionError>

// Process distribution batch
pub fn process_batch(
    env: Env,
    admin: Address,
    batch_id: u64,
) -> Result<(), DistributionError>

// Manual distribution to specific users
pub fn manual_distribute(
    env: Env,
    admin: Address,
    rule_id: u32,
    recipients: Vec<Address>,
    amounts: Vec<i128>,
) -> Result<(), DistributionError>
```

#### Batch Processing
- **Atomic Execution**: All distributions in batch processed together
- **Partial Failure Handling**: Individual distribution failures tracked
- **Efficient Storage**: Optimized for large-scale distributions
- **Comprehensive Tracking**: Full audit trail maintained

## 🗳️ Governance Token (`GovernanceToken`)

### Features

#### Voting Power System
```rust
pub struct VotingPower {
    pub user: Address,
    pub token_amount: i128,
    pub hold_time: u64,
    pub voting_power: u128,
    pub multiplier: u32,
}
```

#### Power Calculation
- **Base Power**: Direct token amount
- **Time Multiplier**: Increased power for longer holding periods
- **Configurable Multipliers**: Admin-adjustable voting power multipliers
- **Real-time APR**: Dynamic voting power calculation

#### Proposal Management
```rust
pub struct Proposal {
    pub proposal_id: u64,
    pub proposer: Address,
    pub title: String,
    pub description: String,
    pub proposal_type: ProposalType,
    pub target_contract: Option<Address>,
    pub call_data: Option<BytesN<32>>,
    pub value: Option<i128>,
    pub start_time: u64,
    pub end_time: u64,
    pub execution_time: Option<u64>,
    pub for_votes: u128,
    pub against_votes: u128,
    pub abstain_votes: u128,
    pub status: ProposalStatus,
    pub quorum_reached: bool,
}
```

#### Proposal Types
1. **TokenTransfer**: Transfer tokens from treasury
2. **ParameterChange**: Modify governance parameters
3. **ContractUpgrade**: Upgrade system contracts
4. **EmergencyAction**: Emergency council actions
5. **Custom**: Custom proposal with external execution

#### Voting System
```rust
// Create proposal
pub fn create_proposal(
    env: Env,
    proposer: Address,
    title: String,
    description: String,
    proposal_type: ProposalType,
    target_contract: Option<Address>,
    call_data: Option<BytesN<32>>,
    value: Option<i128>,
) -> Result<u64, GovernanceError>

// Vote on proposal
pub fn vote(
    env: Env,
    voter: Address,
    proposal_id: u64,
    vote_type: VoteType,
) -> Result<(), GovernanceError>

// Execute successful proposal
pub fn execute_proposal(
    env: Env,
    executor: Address,
    proposal_id: u64,
) -> Result<(), GovernanceError>
```

#### Governance Controls
- **Proposal Thresholds**: Minimum tokens required to propose
- **Quorum Requirements**: Percentage for decision validity
- **Voting Periods**: Configurable duration for voting
- **Execution Delays**: Security delay before execution
- **Emergency Council**: Special powers for emergency situations

## 🔒 Security Features

### Multi-Layer Authentication
1. **Admin Authorization**: All admin functions require admin authentication
2. **User Authentication**: User actions require signature verification
3. **Role-Based Access**: Different permission levels for different operations
4. **Emergency Controls**: Admin override capabilities for emergency situations

### Protective Mechanisms
- **Lock Periods**: Prevent early withdrawal without penalties
- **Withdrawal Fees**: Disincentivize long-term participation
- **Quorum Requirements**: Prevent small group governance attacks
- **Execution Delays**: Time for community review before execution
- **Emergency Modes**: Controlled emergency access with audit trails

### Audit Trails
- **Comprehensive Events**: All major actions emit events
- **Historical Tracking**: Complete record of all operations
- **Transparent State**: All contract state publicly queryable
- **Immutable Records**: Historical data cannot be altered

## 📊 Economic Models

### Staking Economics
```
Reward Rate = Base Rate per second
Bonus Multiplier = 1.0x - 3.0x (based on lock period)
Total Rewards = (Amount × Rate × Time) + Bonus
APR = (Yearly Rewards / Staked Amount) × 10000
```

### Yield Farming Economics
```
Base Rewards = LP Amount × Rate × Time
Bonus Rewards = Base Rewards × (Multiplier - 100%) × Decay
Total Rewards = Base Rewards + Bonus Rewards
APR = (Total Rewards × Seconds_in_Year / LP Amount) × 10000
```

### Distribution Economics
```
Individual Reward = Base Amount × User Multiplier
Batch Total = Σ Individual Rewards
Eligibility = Rule-Based (Time/Balance/Activity/Tier)
Efficiency = Batch Processing / Individual Processing
```

### Governance Economics
```
Voting Power = Token Amount × Time Multiplier
Quorum = Total Supply × Quorum Percentage
Proposal Threshold = Minimum Tokens to Propose
Execution Power = Successful Proposal Execution
```

## 🚀 Integration Patterns

### Cross-Contract Interactions

#### Staking ↔ Yield Farming
```javascript
// Stake governance tokens from yield farming rewards
const governanceToken = "GOV_TOKEN_ADDRESS";
const stakingContract = "STAKING_CONTRACT_ADDRESS";

// Transfer yield farming rewards to staking
await tokenContract.transfer(yieldFarmingContract, stakingContract, rewardAmount);
await stakingContract.stake(user, rewardAmount, 180, 12); // 6 months
```

#### Reward Distributor ↔ All Contracts
```javascript
// Distribute rewards to active participants
const participants = [
    stakingContract.get_all_stakers(),
    yieldFarmingContract.get_all_farmers(),
    governanceToken.get_all_holders()
];

await rewardDistributor.create_batch(
    admin,
    ruleId,
    participants
);
```

#### Governance ↔ Treasury Management
```javascript
// Proposal to transfer treasury funds
await governanceToken.create_proposal(
    proposer,
    "Community Rewards",
    "Distribute rewards to active participants",
    ProposalType.TokenTransfer,
    treasuryContract,
    transferCallData,
    rewardAmount
);
```

### Data Flow Architecture

```
User Actions → Contract Validation → State Updates → Event Emission
     ↓                    ↓                    ↓
Authentication → Permission Check → Operation → Storage Update
     ↓                    ↓                    ↓
Batch Operations → Parallel Processing → Atomic Updates → Batch Events
```

## 📈 Performance Optimizations

### Gas Efficiency
1. **Batch Operations**: Process multiple actions in single transactions
2. **Storage Optimization**: Efficient data structures and access patterns
3. **Event Batching**: Minimize event emission overhead
4. **Lazy Loading**: Load data only when needed
5. **Caching**: Cache frequently accessed data

### Scalability Features
- **Multi-Pool Support**: Parallel processing across different pools
- **Configurable Limits**: Adjustable batch sizes and rates
- **Modular Design**: Independent contract deployment
- **Upgradeable Architecture**: Future-proof contract designs

## 🧪 Testing Strategy

### Unit Testing
```bash
# Test individual contracts
cargo test --package staking
cargo test --package yield_farming
cargo test --package reward_distributor
cargo test --package governance_token

# Test all tokenomics contracts
cargo test --package staking --package yield_farming --package reward_distributor --package governance_token
```

### Integration Testing
- **Cross-Contract**: Test interactions between contracts
- **End-to-End**: Complete user journey testing
- **Load Testing**: High-volume transaction testing
- **Security Testing**: Vulnerability assessment and penetration testing

### Test Coverage Areas
1. **Happy Paths**: Normal operation flows
2. **Edge Cases**: Boundary conditions and error scenarios
3. **Security**: Authentication and authorization testing
4. **Performance**: Gas usage and execution time
5. **Integration**: Cross-contract functionality

## 📚 Usage Examples

### Basic Staking Flow
```javascript
// 1. Initialize staking contract
await stakingContract.initialize(
    admin,
    tokenAddress,
    1000000,        // Reward rate per second
    200,             // Bonus multiplier (2x)
    1000,            // Min stake amount
    1000000           // Max stake amount
);

// 2. User stakes tokens
await stakingContract.stake(
    user,
    1000,            // Amount to stake
    180 * 24 * 60 * 60,  // 180 days lock
    12                // 12 month vesting
);

// 3. Claim rewards
const rewards = await stakingContract.claim_rewards(user);
console.log(`Claimed ${rewards} tokens`);
```

### Yield Farming Flow
```javascript
// 1. Create farming pool
await yieldFarmingContract.add_pool(
    admin,
    lpTokenAddress,
    rewardTokenAddress,
    500000,           // Reward rate
    100000,           // Bonus rate
    30 * 24 * 60 * 60, // 30 day lock
    30000              // 3x max multiplier
    90 * 24 * 60 * 60  // 90 day decay
);

// 2. User starts farming
await yieldFarmingContract.start_farming(
    user,
    0,                 // Pool ID
    500,               // LP amount
    180 * 24 * 60 * 60  // 180 day lock for 2x multiplier
);

// 3. End farming and claim rewards
const rewards = await yieldFarmingContract.end_farming(user, 0);
console.log(`Farming rewards: ${rewards}`);
```

### Reward Distribution Flow
```javascript
// 1. Create distribution rule
await rewardDistributor.create_rule(
    admin,
    "Monthly Rewards",
    ConditionType.TimeBased,
    rewardTokenAddress,
    100,               // Reward amount per user
    1000,              // Max distributions
    startTime,
    endTime
);

// 2. Update user eligibility
await rewardDistributor.update_eligibility(
    admin,
    user,
    ruleId,
    true,               // User is eligible
    null,               // No custom data
    12000               // 1.2x multiplier
);

// 3. Create and process batch
const batchId = await rewardDistributor.create_batch(
    admin,
    ruleId,
    [user1, user2, user3]  // Eligible users
);

await rewardDistributor.process_batch(admin, batchId);
```

### Governance Flow
```javascript
// 1. Initialize governance token
await governanceToken.initialize(
    admin,
    underlyingTokenAddress,
    15000,             // 1.5x voting power multiplier
    7 * 24 * 60 * 60, // 7 day minimum hold
    1000,               // 10% proposal threshold
    5000,                // 50% quorum
    7 * 24 * 60 * 60,  // 7 day voting period
    2 * 24 * 60 * 60    // 2 day execution delay
);

// 2. Mint governance tokens to user
await governanceToken.mint(
    admin,
    user,
    1000,
    "Initial governance token distribution"
);

// 3. Create proposal
const proposalId = await governanceToken.create_proposal(
    proposer,
    "Community Reward Fund",
    "Establish reward fund for community incentives",
    ProposalType.TokenTransfer,
    treasuryContract,
    transferCallData,
    10000               // Transfer 10,000 tokens
);

// 4. Vote on proposal
await governanceToken.vote(
    voter,
    proposalId,
    VoteType.For
);

// 5. Execute successful proposal
await governanceToken.execute_proposal(
    executor,
    proposalId
);
```

## 🔮 Future Enhancements

### Advanced Features
1. **Cross-Chain Staking**: Support for multi-chain assets
2. **Dynamic Reward Rates**: Market-adjusted reward mechanisms
3. **Liquid Staking**: Non-locking staking with lower rewards
4. **NFT Integration**: NFT-based reward multipliers
5. **AI-Driven Distribution**: Machine learning for optimal rewards

### Governance Evolution
1. **Delegated Voting**: Vote delegation system
2. **Quadratic Voting**: Alternative voting mechanisms
3. **Timelock Proposals**: Delayed proposal execution
4. **Multi-Signature**: Multi-sig requirement for critical actions
5. **Snapshot Voting**: Voting power based on historical snapshots

### Integration Improvements
1. **Unified Dashboard**: Single interface for all tokenomics
2. **Mobile SDK**: Mobile-first development tools
3. **Analytics Platform**: Advanced analytics and insights
4. **API Gateway**: RESTful API for external integration
5. **Cross-Protocol Bridges**: Interoperability with other DeFi protocols

## 🛠️ Development Guidelines

### Best Practices
1. **Security First**: Prioritize security in all implementations
2. **Gas Optimization**: Minimize transaction costs
3. **User Experience**: Simplify complex interactions
4. **Modular Design**: Build for maintainability
5. **Comprehensive Testing**: Test all scenarios thoroughly

### Code Standards
- **Documentation**: Comprehensive inline documentation
- **Error Handling**: Graceful failure management
- **Event Emission**: Transparent operation tracking
- **Storage Efficiency**: Optimized data structures
- **Upgrade Safety**: Secure upgrade mechanisms

---

**Last Updated**: February 20, 2026
**Version**: 1.0.0
**Status**: Production Ready
