# Customer Data Platform (CDP)

A comprehensive Customer Data Platform that unifies customer data from all touchpoints, enabling 360-degree customer view, segmentation, and personalized experiences.

## Features

### 🎯 Core Capabilities

- **Event Ingestion**: Collect events from web, mobile, and backend sources
- **Identity Resolution**: Merge anonymous and known user identities
- **Segment Builder**: Create segments using SQL queries or visual builder
- **User Profiles**: Unified 360-degree customer profiles
- **Consent Tracking**: GDPR-compliant consent management
- **Real-time Updates**: Live segment membership updates
- **Integration Hub**: Connect with email, push, SMS, and analytics tools

### 🔧 Technical Features

- **Scalable Architecture**: Built on NestJS with PostgreSQL and Redis
- **Real-time Processing**: WebSocket and Redis pub/sub for live updates
- **Type-safe**: Full TypeScript support with Prisma ORM
- **GDPR Compliant**: Built-in consent tracking and data export/deletion
- **Multi-tenant**: Support for multiple organizations
- **Performance Optimized**: Caching and efficient query patterns

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Client    │    │   Mobile App    │    │   Backend API   │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────▼─────────────┐
                    │   Event Ingestion API    │
                    └─────────────┬─────────────┘
                                 │
                    ┌─────────────▼─────────────┐
                    │   Identity Resolution     │
                    └─────────────┬─────────────┘
                                 │
                    ┌─────────────▼─────────────┐
                    │   Event Processing        │
                    └─────────────┬─────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
┌─────────▼─────────┐ ┌──────────▼──────────┐ ┌─────────▼─────────┐
│  User Profiles    │ │   Segment Builder   │ │  Consent Tracker  │
└───────────────────┘ └─────────────────────┘ └───────────────────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────▼─────────────┐
                    │   Integration Hub       │
                    └─────────────┬─────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
    ┌─────▼─────┐        ┌───────▼───────┐      ┌──────▼──────┐
    │   Email   │        │     Push      │      │    SMS     │
    └───────────┘        └───────────────┘      └─────────────┘
```

## Data Models

### Events
```typescript
interface CdpEvent {
  id: string;
  anonymousId?: string;
  userId?: string;
  type: EventType;
  source: EventSource;
  eventName: string;
  properties: Record<string, any>;
  timestamp: DateTime;
  // ... additional metadata
}
```

### Segments
```typescript
interface CdpSegment {
  id: string;
  name: string;
  type: SegmentType; // SQL, VISUAL, BEHAVIORAL, DEMOGRAPHIC
  sqlQuery?: string;
  visualConfig?: Record<string, any>;
  conditions?: Array<Condition>;
  isActive: boolean;
}
```

### User Profiles
```typescript
interface UnifiedProfile {
  id: string;
  email?: string;
  phone?: string;
  walletAddress?: string;
  profileData: Record<string, any>;
  eventCount: number;
  lastActivity?: DateTime;
  segments: UserSegment[];
  consent: UserConsent;
}
```

## API Endpoints

### Event Ingestion
- `POST /cdp/events` - Ingest events from any source

### User Profiles
- `GET /cdp/users/:userId/profile` - Get unified user profile
- `GET /cdp/users/:userId/consent` - Get user consent preferences
- `POST /cdp/users/:userId/consent` - Update consent preferences

### Segments
- `GET /cdp/segments` - List all segments
- `POST /cdp/segments` - Create new segment
- `GET /cdp/segments/:segmentId/users` - Get users in segment
- `POST /cdp/segments/:segmentId/evaluate` - Evaluate segment membership
- `POST /cdp/segments/:segmentId/activate` - Activate for integrations

### Identity Resolution
- `GET /cdp/events/anonymous/:anonymousId/resolve` - Resolve anonymous identity

## Usage Examples

### Event Ingestion
```typescript
// Web tracking
await fetch('/api/v1/cdp/events', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    anonymousId: 'anon_123',
    type: 'PAGE_VIEW',
    source: 'WEB',
    eventName: 'homepage_visit',
    properties: {
      page: '/home',
      referrer: 'https://google.com',
      userAgent: navigator.userAgent,
    },
  }),
});

// Backend tracking
await cdpService.ingestEvent({
  userId: 'user_123',
  type: 'PURCHASE',
  source: 'BACKEND',
  eventName: 'order_completed',
  properties: {
    orderId: 'order_456',
    amount: 99.99,
    currency: 'USD',
  },
});
```

### Segment Creation
```typescript
// Visual segment builder
const segment = await cdpService.createSegment({
  name: 'Active Customers',
  type: 'VISUAL',
  conditions: [
    {
      field: 'eventCount',
      operator: 'greater_than',
      value: 10,
    },
    {
      field: 'lastActivity',
      operator: 'greater_than',
      value: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      logicalOperator: 'AND',
    },
  ],
});

// SQL segment
const sqlSegment = await cdpService.createSegment({
  name: 'High Value Customers',
  type: 'SQL',
  sqlQuery: `
    SELECT u.id 
    FROM users u 
    JOIN cdp_events e ON u.id = e.userId 
    WHERE e.type = 'PURCHASE' 
    AND e.properties->>'amount' > '100'
    GROUP BY u.id 
    HAVING COUNT(*) >= 3
  `,
});
```

### Integration Activation
```typescript
// Activate segment for email and push
await cdpService.activateSegment('segment_123', ['sendgrid', 'onesignal']);
```

## Configuration

### Environment Variables
```env
# Email Integration
SENDGRID_API_KEY=your_sendgrid_key
SENDGRID_FROM_EMAIL=noreply@yourapp.com

# Push Notifications
ONESIGNAL_API_KEY=your_onesignal_key
ONESIGNAL_APP_ID=your_app_id

# SMS
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_FROM_NUMBER=+1234567890

# Analytics
GA_MEASUREMENT_ID=GA-XXXXXXXXX
GA_API_SECRET=your_ga_secret

# Webhooks
CDP_WEBHOOK_URL=https://your-webhook-endpoint.com
CDP_WEBHOOK_AUTH_TOKEN=your_auth_token
```

## GDPR Compliance

### Consent Management
The CDP provides built-in GDPR compliance features:

- **Explicit Consent Tracking**: Track consent for marketing, analytics, and personalization
- **Granular Control**: Separate consent by channel (email, push, SMS)
- **Audit Trail**: Complete history of consent changes
- **Data Export**: Export all user data on request
- **Right to Deletion**: Complete removal of user data

### Consent Types
- `MARKETING` - Promotional communications
- `ANALYTICS` - Data analysis and reporting
- `PERSONALIZATION` - Personalized experiences
- `ESSENTIAL` - Required for service operation

### Example Consent Management
```typescript
// Update user consent
await cdpService.updateConsent('user_123', {
  type: 'MARKETING',
  granted: true,
  channel: 'email',
  purpose: 'Weekly newsletter and promotions',
});

// Check consent before sending
const hasConsent = await consentService.hasConsent('user_123', 'MARKETING', 'email');
if (hasConsent) {
  await emailService.sendCampaign('user_123', campaign);
}

// Export user data (GDPR request)
const userData = await consentService.exportUserConsentData('user_123');

// Delete user data (Right to be forgotten)
await consentService.deleteConsentData('user_123');
```

## Performance Considerations

### Caching Strategy
- **User Profiles**: Cached for 30 minutes
- **Segment Memberships**: Cached for 30 minutes
- **Consent Data**: Cached for 30 minutes
- **Event Data**: Cached for 1 hour

### Database Optimization
- **Indexes**: Optimized indexes on frequently queried fields
- **Partitioning**: Events partitioned by timestamp
- **Batch Processing**: Bulk operations for segment evaluation

### Real-time Updates
- **WebSocket**: Live updates to connected clients
- **Redis Pub/Sub**: Cross-service communication
- **Event Queues**: Background processing for heavy operations

## Monitoring and Analytics

### Key Metrics
- Event ingestion rate
- Segment evaluation performance
- Identity resolution accuracy
- Consent compliance rate
- Integration success rates

### Health Checks
- Database connectivity
- Redis connectivity
- External integration status
- Queue processing health

## Security

### Data Protection
- **Encryption**: Sensitive data encrypted at rest
- **PII Handling**: Personal information properly secured
- **Access Control**: Role-based access to CDP features
- **Audit Logging**: Complete audit trail of all operations

### API Security
- **Authentication**: JWT-based authentication
- **Rate Limiting**: Prevent abuse and ensure fair usage
- **Input Validation**: Comprehensive input sanitization
- **CORS**: Proper cross-origin resource sharing

## Development

### Running Tests
```bash
# Run all tests
npm test

# Run with coverage
npm run test:cov

# Run specific test file
npm test -- cdp.service.spec.ts
```

### Database Migrations
```bash
# Generate migration
npm run db:migrate:create -- add_cdp_tables

# Apply migration
npm run db:migrate

# Reset database
npm run db:migrate:reset
```

### Local Development
```bash
# Start development server
npm run start:dev

# Start with Docker
docker-compose up

# View database
npm run db:studio
```

## Contributing

1. Follow the existing code style and patterns
2. Add comprehensive tests for new features
3. Update documentation for API changes
4. Ensure GDPR compliance for all user data handling
5. Consider performance implications of changes

## License

This project is licensed under the MIT License - see the LICENSE file for details.
