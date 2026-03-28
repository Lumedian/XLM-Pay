# Chaos Engineering Framework

A minimal chaos engineering framework for testing backend resilience in the Stellara Network.

## Features

### Core Experiments
- **Latency Injection**: Adds network delays (500-1500ms)
- **Memory Stress**: Allocates memory to test garbage collection
- **CPU Stress**: Runs intensive operations for load testing
- **Failure Simulation**: Injects random failures in network calls

### Safety Controls
- **Blast Radius Control**: Small, medium, large impact levels
- **Safe Mode**: Automatic termination on threshold breaches
- **Business Hours Protection**: Prevents experiments during peak hours (9AM-5PM)
- **Max Concurrent Experiments**: Limit simultaneous chaos tests

### Monitoring & Metrics
- **Real-time System Metrics**: CPU, memory, response times, error rates
- **Resilience Scoring**: 0-100 scale with category breakdowns
- **Experiment History**: Track all chaos experiments and their results
- **Trend Analysis**: Monitor resilience improvements over time

## API Endpoints

### Configuration
- `GET /chaos/config` - Get current chaos configuration
- `POST /chaos/config` - Update chaos settings

### Experiments
- `POST /chaos/experiment` - Run a chaos experiment
- `DELETE /chaos/experiment` - Stop all active experiments
- `GET /chaos/experiments` - Get experiment history
- `GET /chaos/experiments/active` - Get active experiments

### Monitoring
- `GET /chaos/status` - Get system health status
- `GET /chaos/metrics/resilience` - Get resilience scores and trends
- `GET /chaos/metrics/history` - Get metrics history

## Usage Examples

### Enable Chaos Engineering
```bash
curl -X POST http://localhost:3000/chaos/config \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "blastRadius": "small"}'
```

### Run Latency Experiment
```bash
curl -X POST http://localhost:3000/chaos/experiment \
  -H "Content-Type: application/json" \
  -d '{"type": "latency", "duration": 30000, "intensity": 1000}'
```

### Check System Health
```bash
curl http://localhost:3000/chaos/status
```

## Configuration Options

- `enabled`: Enable/disable chaos engineering
- `blastRadius`: Impact level ('small', 'medium', 'large')
- `safeMode`: Enable automatic safety aborts
- `businessHoursOnly`: Restrict experiments to non-business hours
- `maxExperiments`: Maximum concurrent experiments

## Safety Features

- **Automatic Abort**: Stops experiments if error rate exceeds 10%
- **Memory Protection**: Stops if memory usage exceeds 90%
- **CPU Protection**: Stops if CPU usage is excessive
- **Business Hours**: No experiments during 9AM-5PM by default

## Integration

The chaos module is automatically integrated into the main application. All experiments are isolated and include comprehensive monitoring.

## Monitoring Dashboard

Access real-time metrics and experiment results through the API endpoints. The system provides:

- Live system health status
- Resilience scoring (0-100)
- Experiment results and trends
- Performance impact analysis

## Best Practices

1. Start with small blast radius
2. Run experiments during off-peak hours
3. Monitor system health closely
4. Always have rollback procedures ready
5. Document experiment results for future reference
