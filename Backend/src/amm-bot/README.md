# AMM Bot Framework

A comprehensive automated market maker (AMM) bot framework for providing liquidity on decentralized exchanges (DEXs) with configurable strategies, risk parameters, and performance tracking.

## Features

### Strategy Templates
- **Constant Product**: Traditional 50/50 liquidity provision across full price range
- **Concentrated Liquidity**: Focused liquidity around current price for higher fee generation
- **Dynamic Fees**: Adaptive fee adjustment based on market volatility

### Multi-DEX Support
- **Uniswap V3**: Full integration with concentrated liquidity
- **Curve Finance**: Stable coin and crypto pool support
- **Balancer**: Weighted pool integration

### Risk Management
- Configurable position sizes and stop-loss/take-profit levels
- Price range monitoring and automatic rebalancing
- Impermanent loss calculation and tracking
- Risk profile templates (Conservative, Moderate, Aggressive)

### Performance Analytics
- Real-time P&L dashboard
- Fee revenue vs impermanent loss comparison
- Strategy performance attribution
- Historical performance tracking

### Automation
- Auto-rebalancing when price moves out of range
- One-click strategy deployment
- Scheduled rebalancing triggers
- Alert system for risk events

## Architecture

### Core Components

#### 1. Strategy System
- `BaseStrategy`: Abstract base class for all strategies
- `ConstantProductStrategyService`: Implements constant product AMM logic
- `ConcentratedLiquidityStrategyService`: Implements concentrated liquidity strategies
- `DynamicFeesStrategyService`: Implements dynamic fee adjustment strategies
- `StrategyFactory`: Factory pattern for strategy instantiation

#### 2. DEX Integration
- `BaseDexIntegration`: Abstract base for DEX integrations
- `UniswapV3Integration`: Uniswap V3 specific implementation
- `CurveIntegration`: Curve Finance integration
- `BalancerIntegration`: Balancer integration
- `DexFactory`: Factory for DEX integration management

#### 3. Risk Management
- `RiskConfigService`: Risk parameter configuration and validation
- Pre-defined risk profiles with customizable parameters
- Risk scoring and adjustment algorithms

#### 4. Analytics & Monitoring
- `ImpermanentLossService`: IL calculation and tracking
- `PerformanceAnalyticsService`: Performance metrics and comparisons
- `DashboardService`: Real-time dashboard data aggregation
- `RebalancingService`: Automated rebalancing logic

#### 5. Deployment & Management
- `DeploymentService`: One-click deployment functionality
- `AmmBotService`: Core bot management operations
- REST API endpoints for bot control and monitoring

## API Endpoints

### Bot Management
- `POST /amm-bots` - Create new bot
- `GET /amm-bots` - List bots with filtering
- `GET /amm-bots/:id` - Get specific bot details
- `PUT /amm-bots/:id` - Update bot configuration
- `DELETE /amm-bots/:id` - Delete bot

### Bot Control
- `POST /amm-bots/:id/start` - Start bot
- `POST /amm-bots/:id/stop` - Stop bot
- `POST /amm-bots/:id/rebalance` - Manual rebalancing

### Analytics
- `GET /amm-bots/:id/performance` - Get performance metrics
- `GET /amm-bots/:id/dashboard` - Bot dashboard data
- `GET /amm-bots/dashboard` - Overall dashboard
- `GET /amm-bots/analytics/performance` - Performance analytics
- `GET /amm-bots/analytics/strategies` - Strategy comparison

### Deployment
- `POST /amm-bots/deploy` - Full deployment configuration
- `POST /amm-bots/quick-deploy` - Quick deployment
- `GET /amm-bots/deployment/templates` - Available templates

## Usage Examples

### Create a New Bot

```typescript
const createBotDto = {
  name: "ETH/USDC Liquidity Bot",
  strategy: {
    type: StrategyType.CONCENTRATED_LIQUIDITY,
    name: "Concentrated Liquidity Strategy",
    description: "Focused liquidity around current price",
    riskParameters: {
      maxPositionSize: 100000,
      stopLossPercentage: 10,
      takeProfitPercentage: 25,
      priceRange: {
        lower: 0.95,
        upper: 1.05
      },
      rebalanceTrigger: 10,
      maxSlippage: 1.0
    },
    specificParams: {
      tickLower: -60,
      tickUpper: 60,
      feeTier: 3000
    }
  },
  targetDexes: [DexType.UNISWAP_V3],
  initialCapital: 50000,
  autoStart: true
};

const bot = await ammBotService.createBot(createBotDto);
```

### Quick Deploy

```typescript
const result = await deploymentService.quickDeploy(
  'user-123',
  StrategyType.CONSTANT_PRODUCT,
  'MODERATE',
  25000,
  {
    token0: '0xA0b86a33E6441E6C7D3E5E5C5F5C5F5F5F5F5F5',
    token1: '0xB0b86a33E6441E6C7D3E5E5C5F5C5F5F5F5F5F5'
  }
);
```

### Monitor Performance

```typescript
const dashboardData = dashboardService.getDashboardData('user-123');
const performance = performanceAnalytics.calculatePerformanceComparison('bot-456', '7d');
```

## Database Schema

The framework uses the following database models:

- `AmmBot`: Main bot configuration and status
- `LiquidityPosition`: Individual liquidity positions
- `RebalanceSignal`: Rebalancing triggers and actions
- `PerformanceSnapshot`: Historical performance data
- `FeeRevenueRecord`: Fee revenue tracking
- `ImpermanentLossHistory`: IL calculation history
- `DexPoolData`: DEX pool information cache
- `BotAlert`: Alert and notification system

## Configuration

### Risk Profiles

#### Conservative
- Max position size: $100k
- Stop loss: 5%
- Take profit: 10%
- Price range: ±15%
- Rebalance trigger: 15%

#### Moderate
- Max position size: $250k
- Stop loss: 10%
- Take profit: 25%
- Price range: ±25%
- Rebalance trigger: 10%

#### Aggressive
- Max position size: $500k
- Stop loss: 15%
- Take profit: 50%
- Price range: ±40%
- Rebalance trigger: 5%

## Monitoring & Alerts

The system provides automated alerts for:
- High impermanent loss vs fee revenue
- Low APR performance
- Bot error states
- Price movements outside configured ranges
- Rebalancing opportunities

## Security Considerations

- Private key management for DEX interactions
- Slippage protection for all transactions
- Gas price optimization
- Transaction monitoring and retry logic
- Access control for bot management

## Performance Optimization

- Efficient price monitoring with caching
- Batch transaction processing
- Optimized gas usage
- Parallel DEX operations
- Real-time data streaming

## Future Enhancements

- Additional DEX integrations (PancakeSwap, SushiSwap)
- Advanced strategy types (grid trading, arbitrage)
- Machine learning optimization
- Social trading features
- Mobile app integration
- Advanced analytics and reporting

## Testing

Run the test suite:

```bash
npm test -- amm-bot
```

Run specific tests:

```bash
npm test -- amm-bot.service.spec.ts
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Implement your changes
4. Add tests for new functionality
5. Submit a pull request

## License

This project is licensed under the MIT License.
