# Universal Cross-Chain Router

This document describes the universal blockchain router implementation for Stellara, enabling:

- Arbitrary message passing across 10+ blockchains
- Trust-minimized cross-chain verification via light clients
- Atomic asset transfers with lock-and-mint or burn-and-release models
- Economic security through validator staking and slashing
- <10 minute round-trip latency for cross-chain operations
- Support for: Ethereum, Stellar, Solana, Cosmos, Polkadot, Avalanche, Arbitrum, Optimism, Polygon, Base

## Architecture

### Components

#### 1. Light Client Verification (`light-client.service.ts`)
- Maintains light clients for each supported blockchain
- Verifies headers through 2/3+ validator signatures (BFT-based)
- Supports multiple finality models:
  - **Probabilistic**: Requires N confirmations (Bitcoin-like)
  - **Absolute**: Epoch/slot completion (PoS chains)
  - **Instant**: BFT finality (Tendermint, Polkadot)
- Header proofs include Merkle membership verification

#### 2. Validator Management (`validator.service.ts`)
- Validator registration with minimum staking requirement (1 token)
- Slashing for misbehavior:
  - Double signing
  - Missed attestations
  - Equivocation
- Economic security through configurable slash percentages (typically 10-32%)
- Status tracking: ACTIVE, INACTIVE, SLASHED, EXITED

#### 3. Message Router (`message-router.service.ts`)
- Routes messages through RabbitMQ for async processing
- Supports three message types:
  - **Generic messages**: Arbitrary data passing
  - **Contract calls**: Cross-chain function invocation
  - **Asset transfers**: Lock-and-mint or burn-and-release

#### 4. Asset Bridge (`asset-bridge.service.ts`)
- Lock assets on source chain
- Mint equivalent assets on destination chain
- Burn on source or release on destination
- Tracks total locked and minted amounts per asset

#### 5. Chain Adapters (`chain-adapter.service.ts`)
- Abstracts blockchain-specific logic
- Supports RPC and WebSocket endpoints
- Health monitoring and finality detection
- Configurable block time and finality thresholds

#### 6. Finality Detector (`finalization-detector.service.ts`)
- Polls for transaction finality
- Configurable timeouts (default 10 minutes for <10min SLA)
- Supports different finality models per blockchain
- Emits events when finality is achieved

#### 7. Router Health Monitor (`router-health-monitor.service.ts`)
- Continuous health checks every 30 seconds
- Metrics: latency, throughput, error rates
- Failed message detection and logging
- Per-chain status reporting

### Message Flow

```
1. User initiates message
   ↓
2. Message locked on source chain
   ↓
3. Light client verifies headers
   ↓
4. Validators sign attestation
   ↓
5. Message verified (2/3+ required)
   ↓
6. Assets transferred (if applicable)
   ↓
7. Finality confirmed on both chains
   ↓
8. Status: RELEASED (complete)
```

### Data Models (Prisma)

**Core Tables:**
- `ChainAdapter` - Blockchain configuration (RPC, finality params)
- `LightClient` - Light client state per chain
- `HeaderProof` - Verified block headers with signatures
- `CrossChainMessage` - Message tracking from initiation to finality
- `MessageReceipt` - Transaction receipts per chain
- `Validator` - Validator stake and status
- `SlashingEvent` - Validator slashing history
- `BridgedAsset` - Asset bridge configuration
- `CrossChainRoute` - Route metadata and metrics
- `RouterEvent` - Audit trail of router events
- `RouterStatus` - Health metrics per chain

## API Endpoints

### Messages
- `POST /cross-chain-router/messages` - Initiate message
- `GET /cross-chain-router/messages/:messageId` - Query status
- `GET /cross-chain-router/history/:address` - Address transaction history

### Routes
- `POST /cross-chain-router/routes/query` - Query route details
- `GET /cross-chain-router/routes` - List all active routes

### Chains
- `GET /cross-chain-router/chains/supported` - List supported blockchains
- `POST /cross-chain-router/chains/register` - Register chain adapter

### Validators
- `POST /validators/register` - Register validator
- `POST /validators/stake/add` - Increase stake
- `POST /validators/exit` - Begin exit
- `POST /validators/slash` - Slash misbehaving validator
- `GET /validators/set/:chainId` - Get validator set
- `GET /validators/:address/:chainId` - Get validator details

### Health
- `GET /cross-chain-router/health` (via health monitor)

## Supported Blockchains

1. **Ethereum** - EVM, ~13s blocks, 95+ blocks (~20min) for economic finality
2. **Stellar** - Native, 3-5s blocks, instant finality (Byzantine)
3. **Solana** - Proof-of-History, ~400ms slots, 32 slots (~2.5s) for finality
4. **Cosmos** - Tendermint BFT, ~7s blocks, 1 block for finality
5. **Polkadot** - GRANDPA finality, ~6s slots, 2 epochs (~4min) for finality
6. **Avalanche** - Consensus, ~2s blocks, 63 blocks (~3s) for finality
7. **Arbitrum** - EVM L2, ~0.3s blocks, parent chain finality required
8. **Optimism** - EVM L2, ~2s blocks, 7-day challenge period minimum
9. **Polygon** - EVM, ~2s blocks, 256+ blocks for economic finality
10. **Base** - EVM L2, ~2s blocks, parent chain finality required

## Configuration

```typescript
// Chain adapter registration example
const adapter = await chainAdapterService.registerChainAdapter({
  blockchain: SupportedBlockchain.ETHEREUM,
  rpcEndpoint: 'https://eth-mainnet.g.alchemy.com/v2/...',
  chainId: '1',
  avgBlockTime: 12000, // milliseconds
  finalityBlocks: 7200, // ~20 minutes at 12s average
});
```

## Performance Characteristics

- **Latency SLA**: <10 minutes round-trip (99% cases)
- **Throughput**: Scales with validator set (typically 100+/min per chain pair)
- **Message relay**: RabbitMQ with exponential backoff retry (max 5 attempts)
- **Health check interval**: 30 seconds per chain
- **Finality poll interval**: 5 seconds (configurable)

## Security Considerations

1. **Validator Economic Security**: Min stake + slash percentage
2. **BFT 2/3+ Majority**: Requires Byzantine majority for verification
3. **Light Client Sync**: Headers validated through signatures
4. **Finality Confirmation**: Waits for blockchain finality before considering complete
5. **Slashing Conditions**: Misbehavior results in stake loss
6. **Asset Escrow**: Locked assets held in smart contracts

## Testing

Run cross-chain router tests:

```bash
npm test -- cross-chain-router
```

Integration tests verify:
- Message initiation and tracking
- Light client updates and verification
- Validator registration and slashing
- Asset locking and minting
- Route querying and health monitoring
- Finality detection accuracy
- RabbitMQ message queuing

## Future Enhancements

1. IBC integration for Cosmos chains
2. XCM protocol support for Polkadot ecosystem
3. MEV-resistant transaction ordering
4. Liquidity incentives for relayers
5. Cross-chain DEX aggregation
6. Sidechain/rollup support
7. Interop with Wormhole/LayerZero ecosystems
