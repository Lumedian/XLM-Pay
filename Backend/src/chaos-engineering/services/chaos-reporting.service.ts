import { Injectable } from '@nestjs/common';
import { 
  ExperimentResult, 
  ResilienceReport, 
  ResilienceRecommendation,
  ExperimentMetrics,
  MetricsSnapshot
} from '../interfaces/chaos.interfaces';
import { StructuredLoggerService } from '../../logging/structured-logger.service';

@Injectable()
export class ChaosReportingService {
  constructor(
    private readonly logger: StructuredLoggerService,
  ) {}

  async generateResilienceReport(experimentResult: ExperimentResult): Promise<ResilienceReport> {
    this.logger.log(
      `Generating resilience report for experiment: ${experimentResult.experimentId}`,
      'ChaosReporting'
    );

    const categoryScores = await this.calculateCategoryScores(experimentResult);
    const overallScore = this.calculateOverallScore(categoryScores);
    const weaknesses = await this.identifyWeaknesses(experimentResult);
    const strengths = await this.identifyStrengths(experimentResult);
    const recommendations = await this.generateDetailedRecommendations(experimentResult, categoryScores);

    const report: ResilienceReport = {
      experimentId: experimentResult.experimentId,
      overallScore,
      categoryScores,
      weaknesses,
      strengths,
      recommendations
    };

    this.logger.log(
      `Resilience report generated with score: ${overallScore}`,
      'ChaosReporting',
      { report }
    );

    return report;
  }

  async generateSummaryReport(experimentResults: ExperimentResult[]): Promise<any> {
    const summary = {
      totalExperiments: experimentResults.length,
      averageResilienceScore: this.calculateAverageScore(experimentResults),
      experimentsByType: this.groupExperimentsByType(experimentResults),
      commonWeaknesses: this.identifyCommonWeaknesses(experimentResults),
      trends: this.analyzeTrends(experimentResults),
      recommendations: this.generateSystemWideRecommendations(experimentResults)
    };

    this.logger.log(
      `Generated summary report for ${experimentResults.length} experiments`,
      'ChaosReporting',
      { summary }
    );

    return summary;
  }

  async exportExperimentResults(experimentId: string, format: 'json' | 'csv' | 'pdf'): Promise<any> {
    // Implementation for exporting experiment results in different formats
    this.logger.log(
      `Exporting experiment results: ${experimentId} in format: ${format}`,
      'ChaosReporting'
    );

    switch (format) {
      case 'json':
        return this.exportAsJson(experimentId);
      case 'csv':
        return this.exportAsCsv(experimentId);
      case 'pdf':
        return this.exportAsPdf(experimentId);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  private async calculateCategoryScores(experimentResult: ExperimentResult): Promise<any> {
    const metrics = experimentResult.metrics;
    
    return {
      availability: await this.calculateAvailabilityScore(experimentResult),
      performance: await this.calculatePerformanceScore(metrics),
      errorHandling: await this.calculateErrorHandlingScore(experimentResult),
      recovery: await this.calculateRecoveryScore(experimentResult)
    };
  }

  private async calculateAvailabilityScore(experimentResult: ExperimentResult): Promise<number> {
    let score = 100;
    
    // Check for service availability incidents
    const availabilityIncidents = experimentResult.incidents.filter(
      i => i.type === 'service_unavailable'
    );
    
    score -= availabilityIncidents.length * 15; // Deduct 15 points per availability incident
    
    // Check if services recovered
    const unresolvedIncidents = availabilityIncidents.filter(i => !i.resolved);
    score -= unresolvedIncidents.length * 10; // Additional deduction for unresolved incidents
    
    return Math.max(0, score);
  }

  private async calculatePerformanceScore(metrics: ExperimentMetrics): Promise<number> {
    let score = 100;
    
    if (!metrics.during) return score;
    
    // Compare performance during experiment vs baseline
    const latencyIncrease = (metrics.during.avgLatency - metrics.before.avgLatency) / metrics.before.avgLatency;
    
    if (latencyIncrease > 0.5) score -= 20; // 50%+ latency increase
    else if (latencyIncrease > 0.25) score -= 10; // 25-50% latency increase
    
    const errorIncrease = metrics.during.errorRate - metrics.before.errorRate;
    if (errorIncrease > 5) score -= 15; // 5%+ error rate increase
    else if (errorIncrease > 2) score -= 8; // 2-5% error rate increase
    
    return Math.max(0, score);
  }

  private async calculateErrorHandlingScore(experimentResult: ExperimentResult): Promise<number> {
    let score = 100;
    
    // Check how well the system handled errors
    const criticalIncidents = experimentResult.incidents.filter(i => i.severity === 'critical');
    const highIncidents = experimentResult.incidents.filter(i => i.severity === 'high');
    
    score -= criticalIncidents.length * 25;
    score -= highIncidents.length * 15;
    
    // Bonus points for proper error handling (if incidents were resolved)
    const resolvedIncidents = experimentResult.incidents.filter(i => i.resolved);
    score += resolvedIncidents.length * 5;
    
    return Math.max(0, Math.min(100, score));
  }

  private async calculateRecoveryScore(experimentResult: ExperimentResult): Promise<number> {
    let score = 100;
    
    if (!experimentResult.endTime) return 0;
    
    // Calculate recovery time
    const recoveryTime = experimentResult.endTime.getTime() - experimentResult.startTime.getTime();
    
    // Deduct points for slow recovery
    if (recoveryTime > 300000) score -= 30; // More than 5 minutes
    else if (recoveryTime > 120000) score -= 20; // More than 2 minutes
    else if (recoveryTime > 60000) score -= 10; // More than 1 minute
    
    // Bonus points for quick recovery
    if (recoveryTime < 30000) score += 10; // Less than 30 seconds
    
    return Math.max(0, Math.min(100, score));
  }

  private calculateOverallScore(categoryScores: any): number {
    const weights = {
      availability: 0.3,
      performance: 0.25,
      errorHandling: 0.25,
      recovery: 0.2
    };
    
    return Object.entries(categoryScores).reduce((total, [category, score]) => {
      return total + (score as number) * weights[category as keyof typeof weights];
    }, 0);
  }

  private async identifyWeaknesses(experimentResult: ExperimentResult): Promise<string[]> {
    const weaknesses: string[] = [];
    
    // Analyze incidents to identify weaknesses
    const incidentTypes = [...new Set(experimentResult.incidents.map(i => i.type))];
    
    if (incidentTypes.includes('service_unavailable')) {
      weaknesses.push('Service availability - lack of redundancy');
    }
    
    if (incidentTypes.includes('database_connection_failed')) {
      weaknesses.push('Database resilience - missing failover mechanisms');
    }
    
    if (incidentTypes.includes('high_error_rate')) {
      weaknesses.push('Error handling - insufficient retry logic');
    }
    
    if (incidentTypes.includes('high_latency')) {
      weaknesses.push('Performance - lack of caching and optimization');
    }
    
    // Analyze metrics for additional weaknesses
    if (experimentResult.metrics.during) {
      if (experimentResult.metrics.during.errorRate > 10) {
        weaknesses.push('High error rate under stress');
      }
      
      if (experimentResult.metrics.during.avgLatency > 2000) {
        weaknesses.push('Poor performance under load');
      }
    }
    
    return weaknesses;
  }

  private async identifyStrengths(experimentResult: ExperimentResult): Promise<string[]> {
    const strengths: string[] = [];
    
    // If no critical incidents, that's a strength
    const criticalIncidents = experimentResult.incidents.filter(i => i.severity === 'critical');
    if (criticalIncidents.length === 0) {
      strengths.push('No critical system failures');
    }
    
    // If all incidents were resolved, that's good
    const unresolvedIncidents = experimentResult.incidents.filter(i => !i.resolved);
    if (unresolvedIncidents.length === 0 && experimentResult.incidents.length > 0) {
      strengths.push('All incidents resolved successfully');
    }
    
    // If recovery was fast
    if (experimentResult.endTime) {
      const recoveryTime = experimentResult.endTime.getTime() - experimentResult.startTime.getTime();
      if (recoveryTime < 60000) {
        strengths.push('Quick recovery time');
      }
    }
    
    // If resilience score is high
    if (experimentResult.resilienceScore > 80) {
      strengths.push('High overall resilience score');
    }
    
    return strengths;
  }

  private async generateDetailedRecommendations(
    experimentResult: ExperimentResult, 
    categoryScores: any
  ): Promise<ResilienceRecommendation[]> {
    const recommendations: ResilienceRecommendation[] = [];
    
    // Availability recommendations
    if (categoryScores.availability < 70) {
      recommendations.push({
        priority: 'high',
        category: 'availability',
        description: 'Implement service redundancy and load balancing',
        implementation: 'Set up multiple instances behind a load balancer with health checks',
        estimatedImpact: 25
      });
    }
    
    // Performance recommendations
    if (categoryScores.performance < 70) {
      recommendations.push({
        priority: 'medium',
        category: 'performance',
        description: 'Add caching layer and optimize database queries',
        implementation: 'Implement Redis caching and review slow queries',
        estimatedImpact: 20
      });
    }
    
    // Error handling recommendations
    if (categoryScores.errorHandling < 70) {
      recommendations.push({
        priority: 'high',
        category: 'error_handling',
        description: 'Implement circuit breakers and retry mechanisms',
        implementation: 'Add circuit breaker pattern with exponential backoff',
        estimatedImpact: 30
      });
    }
    
    // Recovery recommendations
    if (categoryScores.recovery < 70) {
      recommendations.push({
        priority: 'medium',
        category: 'recovery',
        description: 'Implement automated recovery procedures',
        implementation: 'Set up health checks and auto-restart mechanisms',
        estimatedImpact: 15
      });
    }
    
    return recommendations;
  }

  private calculateAverageScore(experimentResults: ExperimentResult[]): number {
    if (experimentResults.length === 0) return 0;
    
    const totalScore = experimentResults.reduce((sum, result) => sum + result.resilienceScore, 0);
    return Math.round(totalScore / experimentResults.length);
  }

  private groupExperimentsByType(experimentResults: ExperimentResult[]): any {
    const grouped: Record<string, number> = {};
    
    experimentResults.forEach(result => {
      // Extract experiment type from experimentId
      const type = result.experimentId.split('_')[0];
      grouped[type] = (grouped[type] || 0) + 1;
    });
    
    return grouped;
  }

  private identifyCommonWeaknesses(experimentResults: ExperimentResult[]): string[] {
    const weaknessCount: Record<string, number> = {};
    
    experimentResults.forEach(result => {
      result.recommendations.forEach(recommendation => {
        weaknessCount[recommendation] = (weaknessCount[recommendation] || 0) + 1;
      });
    });
    
    // Return weaknesses that appear in multiple experiments
    return Object.entries(weaknessCount)
      .filter(([, count]) => count > 1)
      .sort(([, a], [, b]) => b - a)
      .map(([weakness]) => weakness);
  }

  private analyzeTrends(experimentResults: ExperimentResult[]): any {
    if (experimentResults.length < 2) return { message: 'Insufficient data for trend analysis' };
    
    const sortedResults = experimentResults.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    
    const scores = sortedResults.map(result => result.resilienceScore);
    const recentScores = scores.slice(-5); // Last 5 experiments
    const olderScores = scores.slice(0, 5); // First 5 experiments
    
    const recentAverage = recentScores.reduce((sum, score) => sum + score, 0) / recentScores.length;
    const olderAverage = olderScores.reduce((sum, score) => sum + score, 0) / olderScores.length;
    
    return {
      trend: recentAverage > olderAverage ? 'improving' : 'declining',
      recentAverage: Math.round(recentAverage),
      olderAverage: Math.round(olderAverage),
      change: Math.round(recentAverage - olderAverage)
    };
  }

  private generateSystemWideRecommendations(experimentResults: ExperimentResult[]): string[] {
    const recommendations = new Set<string>();
    
    experimentResults.forEach(result => {
      result.recommendations.forEach(rec => recommendations.add(rec));
    });
    
    return Array.from(recommendations);
  }

  private async exportAsJson(experimentId: string): Promise<any> {
    // Implementation for JSON export
    return {
      format: 'json',
      experimentId,
      exportedAt: new Date(),
      data: {} // Would fetch actual experiment data
    };
  }

  private async exportAsCsv(experimentId: string): Promise<any> {
    // Implementation for CSV export
    return {
      format: 'csv',
      experimentId,
      exportedAt: new Date(),
      data: 'csv,data,would,go,here'
    };
  }

  private async exportAsPdf(experimentId: string): Promise<any> {
    // Implementation for PDF export
    return {
      format: 'pdf',
      experimentId,
      exportedAt: new Date(),
      data: 'pdf,data,would,go,here'
    };
  }
}
