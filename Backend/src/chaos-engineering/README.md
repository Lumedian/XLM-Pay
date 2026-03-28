# Chaos Engineering Framework

A comprehensive chaos engineering platform for the Stellara Network that enables controlled failure injection testing to identify system weaknesses before they cause production incidents.

## Overview

The Chaos Engineering Framework provides a systematic approach to testing system resilience by simulating various failure scenarios in a controlled manner. This helps identify weaknesses, validate recovery mechanisms, and improve overall system reliability.

## Features

### 🎯 Core Capabilities

- **Chaos Monkey**: Random instance termination to test service redundancy
- **Latency Injection**: Network and dependency delay simulation
- **Database Failure**: Connection failure and timeout simulation
- **Resource Stress**: Memory and CPU stress testing
- **Safe Abort Mechanisms**: Automatic experiment termination based on thresholds
- **Experiment Scheduling**: Automated chaos experiments with cron-based scheduling
- **Comprehensive Reporting**: Resilience scoring and actionable recommendations

### 🔒 Safety Features

- **Blast Radius Control**: Limit impact of experiments to specific services
- **Safe Abort Triggers**: Automatic termination on error rate, latency, or resource thresholds
- **Rollback Strategies**: Immediate, graceful, or manual rollback options
- **Business Hour Protection**: Prevent experiments during peak hours
- **Critical Service Exclusion**: Protect essential services from chaos experiments

### 📊 Monitoring & Reporting

- **Real-time Metrics**: Error rate, latency, throughput, resource usage
- **Resilience Scoring**: Quantitative assessment of system resilience
- **Trend Analysis**: Track resilience improvements over time
- **Export Options**: JSON, CSV, and PDF report formats
- **Historical Tracking**: Complete experiment history and results

## Architecture

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│   Chaos Controller  │    │   Chaos Engine      │    │   Chaos Reporter    │
│                     │    │                     │    │                     │
│ • REST API          │◄──►│ • Experiment        │◄──►│ • Resilience        │
│ • Templates         │    │   Execution         │    │   Scoring           │
│ • Runbooks          │    │ • Abort Monitoring  │    │ • Recommendations   │
│ • Health Checks     │    │ • Metrics Collection│    │ • Export            │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
           │                           │                           │
           └───────────────────────────┼───────────────────────────┘
                                       │
                              ┌─────────────────────┐
                              │  Chaos Scheduler     │
                              │                     │
                              │ • Cron Scheduling   │
                              │ • Runbook Execution │
                              │ • Safety Windows    │
                              └─────────────────────┘
```

## Quick Start

### 1. Installation

The Chaos Engineering Framework is integrated into the Stellara backend. Ensure you have the required dependencies:

```bash
npm install @nestjs/schedule @nestjs/event-emitter cron
```

### 2. Basic Usage

#### Start a Simple Chaos Experiment

```bash
curl -X POST http://localhost:3000/api/v1/chaos-engineering/experiments \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test-chaos-monkey",
    "name": "Test Chaos Monkey",
    "description": "Random instance termination test",
    "type": "chaos_monkey",
    "target": {
      "services": ["api-service", "worker-service"]
    },
    "blastRadius": {
      "maxAffectedServices": 2,
      "maxAffectedUsers": 1000,
      "excludeCriticalServices": true,
      "customExclusions": ["auth", "database"]
    },
    "safeAbort": {
      "enabled": true,
      "triggers": [
        {
          "type": "error_rate",
          "threshold": 10,
          "window": 30
        }
      ],
      "rollbackStrategy": "immediate"
    },
    "metrics": {
      "collectBefore": true,
      "collectDuring": true,
      "collectAfter": true,
      "metrics": ["error_rate", "latency", "throughput"]
    }
  }'
```

#### Monitor Experiment Progress

```bash
curl http://localhost:3000/api/v1/chaos-engineering/experiments/{experimentId}
```

#### Generate Resilience Report

```bash
curl http://localhost:3000/api/v1/chaos-engineering/experiments/{experimentId}/report
```

### 3. Using Predefined Templates

Get available templates:

```bash
curl http://localhost:3000/api/v1/chaos-engineering/templates
```

Use a template:

```bash
curl -X POST http://localhost:3000/api/v1/chaos-engineering/experiments \
  -H "Content-Type: application/json" \
  -d '{
    "id": "chaos-monkey-from-template",
    "name": "Chaos Monkey Test",
    "description": "Using predefined template",
    "type": "chaos_monkey",
    "target": {
      "services": ["test-service"]
    },
    "blastRadius": {
      "maxAffectedServices": 1,
      "maxAffectedUsers": 100,
      "excludeCriticalServices": true,
      "customExclusions": []
    },
    "safeAbort": {
      "enabled": true,
      "triggers": [
        {
          "type": "error_rate",
          "threshold": 10,
          "window": 30
        }
      ],
      "rollbackStrategy": "immediate"
    },
    "metrics": {
      "collectBefore": true,
      "collectDuring": true,
      "collectAfter": true,
      "metrics": ["error_rate", "latency"]
    }
  }'
```

## Experiment Types

### 1. Chaos Monkey

Randomly terminates service instances to test redundancy and failover mechanisms.

```json
{
  "type": "chaos_monkey",
  "target": {
    "services": ["api", "worker", "cache"]
  },
  "schedule": {
    "enabled": true,
    "duration": 60
  }
}
```

**Use Cases:**
- Test service redundancy
- Validate load balancer failover
- Verify automatic recovery

### 2. Latency Injection

Injects delays into external dependencies to test timeout handling and circuit breakers.

```json
{
  "type": "latency_injection",
  "target": {
    "dependencies": ["database", "external-api", "cache"]
  },
  "schedule": {
    "enabled": true,
    "duration": 120
  }
}
```

**Use Cases:**
- Test timeout configurations
- Validate circuit breaker patterns
- Measure performance degradation

### 3. Database Failure

Simulates database connection issues to test failover and retry mechanisms.

```json
{
  "type": "database_failure",
  "target": {
    "services": ["api", "worker"],
    "dependencies": ["database"]
  },
  "schedule": {
    "enabled": true,
    "duration": 30
  }
}
```

**Use Cases:**
- Test database failover
- Validate connection pooling
- Test retry logic

### 4. Memory Stress

Allocates memory to stress test the system and test memory management.

```json
{
  "type": "memory_stress",
  "target": {
    "services": ["api"]
  },
  "schedule": {
    "enabled": true,
    "duration": 90
  }
}
```

**Use Cases:**
- Test memory limits
- Validate garbage collection
- Monitor memory leaks

### 5. CPU Stress

Performs CPU-intensive operations to test system under load.

```json
{
  "type": "cpu_stress",
  "target": {
    "services": ["worker"]
  },
  "schedule": {
    "enabled": true,
    "duration": 60
  }
}
```

**Use Cases:**
- Test CPU scaling
- Validate load distribution
- Monitor performance bottlenecks

## Configuration

### Blast Radius Control

Control the impact scope of chaos experiments:

```json
{
  "blastRadius": {
    "maxAffectedServices": 3,
    "maxAffectedUsers": 5000,
    "excludeCriticalServices": true,
    "customExclusions": ["payment", "auth"]
  }
}
```

### Safe Abort Configuration

Configure automatic termination triggers:

```json
{
  "safeAbort": {
    "enabled": true,
    "triggers": [
      {
        "type": "error_rate",
        "threshold": 10,
        "window": 30
      },
      {
        "type": "latency",
        "threshold": 2000,
        "window": 30
      },
      {
        "type": "cpu_usage",
        "threshold": 80,
        "window": 60
      },
      {
        "type": "memory_usage",
        "threshold": 85,
        "window": 60
      }
    ],
    "rollbackStrategy": "immediate"
  }
}
```

### Rollback Strategies

Choose how to handle experiment termination:

- **Immediate**: Stop all chaos activities immediately
- **Graceful**: Allow in-flight requests to complete
- **Manual**: Require human intervention

## Scheduling

### Cron-based Scheduling

Schedule recurring chaos experiments:

```json
{
  "schedule": {
    "enabled": true,
    "cron": "0 2 * * *", // Daily at 2 AM
    "duration": 300,
    "timezone": "UTC"
  }
}
```

### Runbooks

Create comprehensive execution plans:

```bash
# Create a runbook
curl -X POST http://localhost:3000/api/v1/chaos-engineering/runbooks \
  -H "Content-Type: application/json" \
  -d '{...experiment config...}'

# Execute a runbook
curl -X POST http://localhost:3000/api/v1/chaos-engineering/runbooks/{runbookId}/execute
```

## Monitoring

### Real-time Metrics

Track key metrics during experiments:

- Error Rate
- Response Time (avg, p95, p99)
- Throughput
- CPU Usage
- Memory Usage
- Active Connections

### Health Checks

Monitor system health:

```bash
curl http://localhost:3000/api/v1/chaos-engineering/health
```

## Best Practices

### 1. Start Small

Begin with low-impact experiments and gradually increase complexity:
- Start with non-critical services
- Use short durations
- Monitor closely

### 2. Define Success Criteria

Establish clear success metrics before running experiments:
- Maximum acceptable error rate
- Recovery time objectives
- Performance thresholds

### 3. Document Everything

Maintain detailed records of:
- Experiment configurations
- Results and outcomes
- Lessons learned
- Improvement actions

### 4. Schedule During Off-Peak Hours

Run experiments during low-traffic periods:
- Use cron scheduling for regular tests
- Avoid business hours unless specifically testing peak load scenarios
- Coordinate with stakeholders

### 5. Have Rollback Plans

Always prepare for worst-case scenarios:
- Test rollback procedures
- Document emergency contacts
- Prepare communication templates

## API Reference

### Experiments

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/experiments` | Start a chaos experiment |
| GET | `/experiments` | List all experiments |
| GET | `/experiments/active` | Get active experiments |
| GET | `/experiments/{id}` | Get experiment details |
| POST | `/experiments/{id}/abort` | Abort an experiment |

### Reports

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/experiments/{id}/report` | Generate resilience report |
| GET | `/reports/summary` | Get summary report |
| GET | `/experiments/{id}/export` | Export experiment results |

### Scheduling

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/schedule` | Schedule experiment |
| DELETE | `/schedule/{id}` | Unschedule experiment |
| GET | `/schedule` | Get scheduled experiments |
| POST | `/scheduler/pause` | Pause scheduler |
| POST | `/scheduler/resume` | Resume scheduler |

### Runbooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/runbooks` | Create runbook |
| POST | `/runbooks/{id}/execute` | Execute runbook |

## Security Considerations

### Access Control

- Chaos engineering endpoints are protected by admin guards
- Only authorized personnel can execute experiments
- Audit logging tracks all chaos activities

### Blast Radius Limits

- Maximum affected services and users are enforced
- Critical services can be excluded
- Custom exclusion lists supported

### Safe Defaults

- Experiments disabled by default
- Conservative thresholds for abort triggers
- Immediate rollback on critical errors

## Troubleshooting

### Common Issues

1. **Experiment won't start**
   - Check blast radius configuration
   - Verify no conflicting experiments running
   - Ensure system health is acceptable

2. **Experiment aborts immediately**
   - Review abort trigger thresholds
   - Check system metrics
   - Verify target services exist

3. **No metrics collected**
   - Ensure metrics collection is enabled
   - Check monitoring configuration
   - Verify service dependencies

### Debug Mode

Enable detailed logging:

```bash
LOG_LEVEL=debug npm run start:dev
```

## Contributing

When contributing to the Chaos Engineering Framework:

1. Add comprehensive tests for new features
2. Update documentation for API changes
3. Follow existing code patterns and conventions
4. Ensure safety mechanisms are in place
5. Add appropriate error handling and logging

## License

This Chaos Engineering Framework is part of the Stellara Network project and follows the same licensing terms.
