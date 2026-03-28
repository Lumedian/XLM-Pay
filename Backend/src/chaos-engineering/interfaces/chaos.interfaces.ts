export interface ChaosExperimentConfig {
  id: string;
  name: string;
  description: string;
  type: ChaosExperimentType;
  target: ChaosTarget;
  schedule?: ChaosSchedule;
  blastRadius: BlastRadiusConfig;
  safeAbort: SafeAbortConfig;
  metrics: ChaosMetricsConfig;
}

export enum ChaosExperimentType {
  CHAOS_MONKEY = 'chaos_monkey',
  LATENCY_INJECTION = 'latency_injection',
  DATABASE_FAILURE = 'database_failure',
  MEMORY_STRESS = 'memory_stress',
  CPU_STRESS = 'cpu_stress',
  NETWORK_PARTITION = 'network_partition',
  DISK_IO_STRESS = 'disk_io_stress'
}

export interface ChaosTarget {
  services: string[];
  instances?: string[];
  dependencies?: string[];
  regions?: string[];
}

export interface ChaosSchedule {
  enabled: boolean;
  cron?: string;
  duration: number; // in seconds
  timezone?: string;
}

export interface BlastRadiusConfig {
  maxAffectedServices: number;
  maxAffectedUsers: number;
  excludeCriticalServices: boolean;
  customExclusions: string[];
}

export interface SafeAbortConfig {
  enabled: boolean;
  triggers: AbortTrigger[];
  rollbackStrategy: RollbackStrategy;
}

export interface AbortTrigger {
  type: 'error_rate' | 'latency' | 'cpu_usage' | 'memory_usage' | 'custom';
  threshold: number;
  window: number; // in seconds
}

export enum RollbackStrategy {
  IMMEDIATE = 'immediate',
  GRACEFUL = 'graceful',
  MANUAL = 'manual'
}

export interface ChaosMetricsConfig {
  collectBefore: boolean;
  collectDuring: boolean;
  collectAfter: boolean;
  metrics: string[];
}

export interface ExperimentResult {
  experimentId: string;
  status: ExperimentStatus;
  startTime: Date;
  endTime?: Date;
  metrics: ExperimentMetrics;
  incidents: ChaosIncident[];
  resilienceScore: number;
  recommendations: string[];
}

export enum ExperimentStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  ABORTED = 'aborted',
  FAILED = 'failed'
}

export interface ExperimentMetrics {
  before: MetricsSnapshot;
  during: MetricsSnapshot;
  after: MetricsSnapshot;
}

export interface MetricsSnapshot {
  timestamp: Date;
  errorRate: number;
  avgLatency: number;
  p95Latency: number;
  p99Latency: number;
  throughput: number;
  cpuUsage: number;
  memoryUsage: number;
  activeConnections: number;
}

export interface ChaosIncident {
  id: string;
  type: IncidentType;
  severity: IncidentSeverity;
  timestamp: Date;
  description: string;
  affectedServices: string[];
  resolved: boolean;
}

export enum IncidentType {
  SERVICE_UNAVAILABLE = 'service_unavailable',
  HIGH_ERROR_RATE = 'high_error_rate',
  HIGH_LATENCY = 'high_latency',
  RESOURCE_EXHAUSTION = 'resource_exhaustion',
  DATABASE_CONNECTION_FAILED = 'database_connection_failed'
}

export enum IncidentSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface ResilienceReport {
  experimentId: string;
  overallScore: number;
  categoryScores: {
    availability: number;
    performance: number;
    errorHandling: number;
    recovery: number;
  };
  weaknesses: string[];
  strengths: string[];
  recommendations: ResilienceRecommendation[];
}

export interface ResilienceRecommendation {
  priority: 'high' | 'medium' | 'low';
  category: string;
  description: string;
  implementation: string;
  estimatedImpact: number;
}
