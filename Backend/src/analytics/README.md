# Privacy-Preserving Analytics Module

This module implements differential privacy techniques to derive insights from user data while providing mathematical guarantees of individual privacy protection.

## Features

- **Differential Privacy Implementation**: Laplace and Gaussian mechanisms for privacy protection
- **Configurable Privacy Budget**: User-defined epsilon parameters (0.1 to 1.0)
- **Aggregate Query Interface**: Support for cohort analysis, funnels, and retention analysis
- **Privacy Budget Tracking**: Per-user budget management with automatic reset
- **Privacy-Utility Tradeoff**: Optimization algorithms for balancing accuracy and privacy
- **GDPR Compliance**: Anonymous-by-design approach preventing re-identification

## Architecture

### Core Components

1. **DifferentialPrivacyService**: Implements privacy mechanisms and noise addition
2. **PrivacyBudgetService**: Manages user privacy budgets and query tracking
3. **AnalyticsService**: Orchestrates queries and applies differential privacy
4. **AnalyticsController**: HTTP API endpoints for analytics queries

### Database Models

- **PrivacyBudget**: Tracks user privacy budget usage
- **PrivacyBudgetQuery**: Records individual query consumption
- **AnalyticsCache**: Caches query results for performance

## API Endpoints

### Analytics Queries

```typescript
POST /analytics/query
```

Execute a privacy-preserving analytics query.

**Request Body:**
```typescript
{
  queryType: 'cohort_analysis' | 'funnel_analysis' | 'retention_analysis' | 'aggregate_count' | 'aggregate_sum' | 'aggregate_average',
  epsilon: number, // 0.1 to 1.0
  startDate?: string, // ISO date
  endDate?: string,   // ISO date
  dataSource?: string,
  filterField?: string,
  filterValue?: string
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    queryId: string,
    result: any,
    privacy: {
      epsilon: number,
      noiseAdded: number,
      isReliable: boolean,
      confidenceInterval?: [number, number]
    },
    metadata: {
      queryType: string,
      timestamp: Date,
      dataSource: string,
      recordCount: number
    }
  }
}
```

### Privacy Budget Management

```typescript
GET /analytics/budget
```

Get current privacy budget status for the authenticated user.

```typescript
GET /analytics/budget/statistics
```

Get system-wide privacy budget statistics (admin only).

```typescript
POST /analytics/budget/reset/:userId
```

Manually reset user's privacy budget (admin only).

## Query Types

### 1. Cohort Analysis

Analyzes user cohorts based on registration time and behavior patterns.

**Typical Use Cases:**
- User onboarding analysis
- Feature adoption by cohort
- Lifetime value analysis

**Privacy Considerations:**
- Splits epsilon across multiple metrics
- Groups users by time periods to reduce re-identification risk

### 2. Funnel Analysis

Tracks user conversion through defined funnel steps.

**Typical Use Cases:**
- User onboarding funnel
- Purchase conversion analysis
- Feature adoption funnel

**Privacy Considerations:**
- Each step gets equal epsilon allocation
- Conversion rates calculated from noisy counts

### 3. Retention Analysis

Measures user retention over different time periods.

**Typical Use Cases:**
- Day 1, 7, 30 retention rates
- Cohort retention comparison
- Churn analysis

**Privacy Considerations:**
- Multiple time periods share epsilon budget
- Large datasets provide better privacy guarantees

### 4. Aggregate Queries

Simple count, sum, and average queries with differential privacy.

**Typical Use Cases:**
- User demographics
- Platform statistics
- Performance metrics

**Privacy Considerations:**
- Lower epsilon requirements for simple queries
- Data clipping reduces sensitivity

## Differential Privacy Mechanisms

### Laplace Mechanism

Used for count queries and bounded numerical queries.

**Formula:**
```
noisy_value = true_value + Laplace(sensitivity/epsilon)
```

**Properties:**
- Pure epsilon-differential privacy
- Optimal for real-valued queries
- Symmetric noise distribution

### Gaussian Mechanism

Used for (epsilon, delta)-differential privacy.

**Formula:**
```
sigma = (sensitivity * sqrt(2*ln(1.25/delta))) / epsilon
noisy_value = true_value + Gaussian(0, sigma^2)
```

**Properties:**
- Approximate differential privacy
- Better for complex queries
- Tighter confidence intervals

## Privacy Budget Management

### Budget Allocation

- **Default Budget**: 1.0 epsilon per user per year
- **Query Costs**: Vary by complexity (0.1x to 1.5x base epsilon)
- **Data Size Adjustment**: Larger datasets consume less budget
- **Automatic Reset**: Annual budget reset on anniversary

### Budget Tracking

- **Reservation System**: Budget reserved before query execution
- **Consumption Tracking**: Actual usage recorded after completion
- **Release Mechanism**: Failed queries release reserved budget
- **Query History**: Complete audit trail of all queries

## Configuration

### Environment Variables

```bash
# Privacy Analytics Configuration
PRIVACY_DEFAULT_BUDGET=1.0
PRIVACY_RESET_INTERVAL_DAYS=365
PRIVACY_CACHE_TTL_HOURS=1
PRIVACY_MIN_EPSILON=0.1
PRIVACY_MAX_EPSILON=1.0
```

### Epsilon Guidelines

| Epsilon Range | Privacy Level | Accuracy Level | Use Case |
|---------------|---------------|-----------------|----------|
| 0.1 - 0.2     | High          | Low             | Sensitive data exploration |
| 0.3 - 0.5     | Medium        | Medium          | General analytics |
| 0.6 - 1.0     | Low           | High            | Business critical metrics |

## Security Considerations

### Threat Mitigation

1. **Re-identification Attacks**: Prevented by noise addition and aggregation
2. **Composition Attacks**: Mitigated by budget tracking and epsilon limits
3. **Membership Inference**: Addressed by calibrated noise levels
4. **Background Knowledge**: Handled by robust privacy mechanisms

### Access Control

- **Role-Based Access**: Analyst and admin roles only
- **JWT Authentication**: Secure user identification
- **Rate Limiting**: Prevents budget exhaustion attacks
- **Audit Logging**: Complete query history tracking

## Performance Optimization

### Caching Strategy

- **Query Result Caching**: 1-hour TTL for identical queries
- **Budget Status Caching**: Real-time budget information
- **Aggregate Precomputation**: Common queries pre-computed offline

### Query Optimization

- **Batch Processing**: Multiple queries processed together
- **Parallel Execution**: Independent queries run in parallel
- **Result Streaming**: Large results streamed to client

## Compliance

### GDPR Compliance

- **Data Minimization**: Only aggregate data accessed
- **Privacy by Design**: Built-in privacy protections
- **Right to Explanation**: Clear privacy impact documentation
- **Audit Trail**: Complete query history for compliance

### Data Protection

- **Anonymous by Design**: No individual data ever exposed
- **Mathematical Guarantees**: Provable privacy protection
- **Transparent Reporting**: Privacy impact included in results
- **User Control**: Users can view and manage their budget

## Testing

### Unit Tests

```bash
npm test -- analytics/differential-privacy.service.spec.ts
npm test -- analytics/privacy-budget.service.spec.ts
npm test -- analytics/analytics.service.spec.ts
```

### Integration Tests

```bash
npm test -- analytics/analytics.controller.spec.ts
```

### Privacy Tests

```bash
npm test -- analytics/privacy-tests.spec.ts
```

## Monitoring

### Key Metrics

- **Budget Utilization**: Percentage of users near budget limits
- **Query Success Rate**: Failed vs completed queries
- **Average Epsilon Usage**: Typical epsilon per query
- **System Health**: Overall analytics system status

### Alerts

- **Budget Exhaustion**: Users approaching budget limits
- **High Failure Rate**: System-wide query failures
- **Privacy Violations**: Potential privacy issues detected

## Usage Examples

### Cohort Analysis

```typescript
const cohortQuery = {
  queryType: 'cohort_analysis',
  epsilon: 0.5,
  startDate: '2024-01-01',
  endDate: '2024-03-31',
  granularity: 'weekly'
};

const result = await analyticsService.executeQuery(userId, cohortQuery);
```

### Funnel Analysis

```typescript
const funnelQuery = {
  queryType: 'funnel_analysis',
  epsilon: 0.4,
  dataSource: 'user_activity'
};

const result = await analyticsService.executeQuery(userId, funnelQuery);
```

### Simple Count

```typescript
const countQuery = {
  queryType: 'aggregate_count',
  epsilon: 0.3,
  filterField: 'status',
  filterValue: 'active'
};

const result = await analyticsService.executeQuery(userId, countQuery);
```

## Troubleshooting

### Common Issues

1. **Insufficient Budget**: User has exhausted privacy budget
2. **Invalid Epsilon**: Epsilon outside allowed range
3. **Query Timeout**: Complex queries taking too long
4. **Cache Miss**: No cached result available

### Debug Information

- Query IDs for tracking
- Detailed error messages
- Budget status information
- Performance metrics

## Future Enhancements

### Planned Features

1. **Advanced Mechanisms**: More sophisticated privacy mechanisms
2. **Machine Learning**: Privacy-preserving ML algorithms
3. **Real-time Analytics**: Live data streaming with privacy
4. **Cross-platform Integration**: Multi-dataset analysis

### Research Areas

1. **Local Differential Privacy**: Client-side privacy protection
2. **Synthetic Data Generation**: Privacy-preserving synthetic datasets
3. **Federated Learning**: Distributed privacy-preserving learning
4. **Homomorphic Encryption**: Encrypted data processing
