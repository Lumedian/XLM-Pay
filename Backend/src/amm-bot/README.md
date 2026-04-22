# AMM Bot Framework

A comprehensive automated market maker bot framework for providing liquidity on decentralized exchanges with configurable strategies, risk parameters, and performance tracking.

## Features

### Strategy Templates
- **Constant Product**: Traditional AMM strategy with equal token ratios
- **Concentrated Liquidity**: Capital-efficient liquidity provision within price ranges
- **Dynamic Fees**: Adaptive fee strategies based on market conditions

### Risk Management
- **Position Size Limits**: Maximum exposure per position
- **Drawdown Controls**: Automatic position reduction on losses
- **Impermanent Loss Thresholds**: Automated rebalancing when IL exceeds limits
- **Price Deviation Alerts**: Notifications for significant price movements
- **Concentration Limits**: Diversification controls across tokens/DEXes

### Multi-DEX Deployment
- **Uniswap V3**: Full integration with concentrated liquidity
- **Curve**: Stablecoin and correlated asset pools
- **Balancer**: Weighted and smart pool strategies
- **Stellar DEX**: Native Stellar ecosystem support

### Performance Tracking
- **Real-time P&L Dashboard**: Live performance metrics
- **APR Calculations**: Gross, net, fee, and IL breakdown
- **Historical Analytics**: Performance trends and comparisons
- **Fee Revenue vs IL**: Comprehensive profitability analysis

## Architecture

### Core Components

#### Services
- **StrategyService**: Strategy lifecycle management
- **RiskManagementService**: Risk parameter monitoring and enforcement
- **PerformanceTrackingService**: Metrics calculation and storage
- **DexIntegrationService**: Multi-DEX deployment and management
- **ImpermanentLossService**: IL calculation and analysis
- **RebalanceService**: Automated and manual rebalancing

#### Entities
- **BotStrategy**: Strategy configuration and metadata
- **BotPosition**: Individual liquidity positions
- **PerformanceMetric**: Historical performance data
- **RiskParameter**: Risk control settings
- **DexConfiguration**: DEX-specific settings

## API Endpoints

### Strategy Management
- `POST /amm-bot/strategies` - Create new strategy
- `GET /amm-bot/strategies` - List user strategies
- `GET /amm-bot/strategies/:id` - Get strategy details
- `PUT /amm-bot/strategies/:id` - Update strategy
- `POST /amm-bot/strategies/:id/pause` - Pause strategy
- `POST /amm-bot/strategies/:id/resume` - Resume strategy
- `POST /amm-bot/strategies/:id/stop` - Stop strategy
- `DELETE /amm-bot/strategies/:id` - Delete strategy

### Deployment & Operations
- `POST /amm-bot/strategies/:id/deploy` - Deploy to DEXes
- `POST /amm-bot/strategies/:id/rebalance` - Manual rebalance
- `POST /amm-bot/positions/:id/collect-fees` - Collect fees
- `POST /amm-bot/positions/:id/withdraw` - Withdraw liquidity

### Performance & Analytics
- `GET /amm-bot/strategies/:id/performance` - Performance dashboard
- `GET /amm-bot/strategies/:id/impermanent-loss` - IL analysis
- `GET /amm-bot/strategies/:id/rebalance-history` - Rebalance history
- `GET /amm-bot/strategies/:id/next-rebalance` - Next rebalance estimate

### Risk Management
- `POST /amm-bot/strategies/:id/risk-parameters` - Set risk parameters
- `GET /amm-bot/strategies/:id/risk-parameters` - Get risk parameters
- `PUT /amm-bot/risk-parameters/:riskId` - Update risk parameter
- `POST /amm-bot/risk-parameters/:riskId/reset` - Reset triggered risk
- `GET /amm-bot/strategies/:id/risk-history` - Risk event history

### DEX Integration
- `GET /amm-bot/dexes` - Supported DEXes
- `GET /amm-bot/dexes/:dexName/status` - DEX health status

## Usage Examples

### Creating a Strategy

```typescript
const strategy = await ammBotService.createStrategy(userId, {
  name: 'ETH/USDC LP Strategy',
  strategyType: StrategyType.CONCENTRATED_LIQUIDITY,
  configuration: {
    totalLiquidity: '10000',
    rebalanceThreshold: 5,
    maxSlippage: 2,
    priceRange: {
      lowerBound: '1800',
      upperBound: '2200'
    },
    rebalanceTriggers: {
      priceDeviation: 10,
      timeInterval: 3600,
      impermanentLossThreshold: 8
    }
  },
  dexConfigurations: [{
    dexName: 'uniswap_v3',
    poolAddress: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
    tokenPair: {
      tokenA: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
      tokenB: '0xa0b86a33e6441b8e8c7c7b0b8e8e8e8e8e8e8e8e'
    },
    allocation: 100
  }]
});
```

### Setting Risk Parameters

```typescript
const riskParam = await ammBotService.createRiskParameter(userId, strategyId, {
  riskType: RiskType.IMPERMANENT_LOSS_LIMIT,
  threshold: '0.1', // 10%
  parameters: {
    rebalanceAction: 'reduce_position',
    tokens: ['ETH', 'USDC']
  },
  alertConfig: {
    enabled: true,
    channels: ['email', 'webhook'],
    cooldownPeriod: 3600
  }
});
```

### Deploying to Multiple DEXes

```typescript
const deployment = await ammBotService.deployStrategy(userId, strategyId, [
  {
    dexName: 'uniswap_v3',
    amountA: '5000',
    amountB: '5000'
  },
  {
    dexName: 'curve',
    amountA: '3000',
    amountB: '3000'
  }
]);
```

## Configuration

### Environment Variables

```env
# Stellar Configuration
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/stellara

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Risk Management
DEFAULT_MAX_DRAWDOWN=0.2
DEFAULT_IL_THRESHOLD=0.1
DEFAULT_REBALANCE_INTERVAL=3600
```

## Monitoring & Alerts

### Performance Metrics
- Total Value Locked (TVL)
- Annual Percentage Rate (APR)
- Fee Revenue
- Impermanent Loss
- Net P&L

### Risk Alerts
- Position size breaches
- Drawdown exceedances
- IL threshold triggers
- Price deviation warnings

### Health Monitoring
- DEX connectivity status
- Transaction success rates
- Gas price monitoring
- API response times

## Security Considerations

### Private Key Management
- Use hardware security modules (HSM) for private keys
- Implement key rotation policies
- Multi-signature requirements for large positions

### Smart Contract Risks
- Regular contract audits
- Upgradeable proxy patterns
- Emergency pause mechanisms

### Front-end Protection
- Rate limiting on API endpoints
- Input validation and sanitization
- CORS and CSP headers

## Development

### Running Tests

```bash
# Unit tests
npm run test

# Integration tests
npm run test:e2e

# Coverage
npm run test:cov
```

### Database Migrations

```bash
# Generate migration
npm run db:migrate:create

# Run migrations
npm run db:migrate

# Reset database
npm run db:migrate:reset
```

### Docker Setup

```bash
# Build image
docker build -t stellara-amm-bot .

# Run with docker-compose
docker-compose up -d
```

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions:
- Create an issue on GitHub
- Join our Discord community
- Email: support@stellara.network

## Roadmap

### Q2 2024
- [ ] Additional DEX integrations (SushiSwap, PancakeSwap)
- [ ] Advanced strategy templates (grid trading, TWAP)
- [ ] Mobile app for strategy monitoring

### Q3 2024
- [ ] Machine learning optimization
- [ ] Cross-chain strategies
- [ ] Governance token integration

### Q4 2024
- [ ] Social trading features
- [ ] Advanced analytics dashboard
- [ ] Institutional-grade risk tools
