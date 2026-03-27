import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { 
  SuspiciousActivityType, 
  SuspicionConfidence,
  SARPriority 
} from '@prisma/client';
import { SuspiciousPatternDto } from '../dto';

interface PatternDetectionRule {
  type: SuspiciousActivityType;
  threshold: number;
  timeframe: number; // hours
  confidence: SuspicionConfidence;
  priority: SARPriority;
}

@Injectable()
export class SuspiciousPatternDetectionService {
  private readonly logger = new Logger(SuspiciousPatternDetectionService.name);

  // Pattern detection rules
  private readonly detectionRules: PatternDetectionRule[] = [
    {
      type: SuspiciousActivityType.LARGE_TRANSACTIONS,
      threshold: 10000, // $10,000 threshold
      timeframe: 24,
      confidence: SuspicionConfidence.HIGH,
      priority: SARPriority.HIGH,
    },
    {
      type: SuspiciousActivityType.FREQUENT_SMALL_TRANSACTIONS,
      threshold: 5000, // Multiple transactions under $5,000
      timeframe: 48,
      confidence: SuspicionConfidence.MEDIUM,
      priority: SARPriority.MEDIUM,
    },
    {
      type: SuspiciousActivityType.STRUCTURING,
      threshold: 9999, // Just under $10,000
      timeframe: 72,
      confidence: SuspicionConfidence.HIGH,
      priority: SARPriority.HIGH,
    },
    {
      type: SuspiciousActivityType.UNUSUAL_PATTERN,
      threshold: 3, // Pattern deviation factor
      timeframe: 168, // 1 week
      confidence: SuspicionConfidence.MEDIUM,
      priority: SARPriority.MEDIUM,
    },
  ];

  constructor(private readonly prisma: PrismaService) {}

  async detectSuspiciousPatterns(startDate: Date, endDate: Date): Promise<SuspiciousPatternDto[]> {
    this.logger.log(`Detecting suspicious patterns from ${startDate} to ${endDate}`);

    const patterns: SuspiciousPatternDto[] = [];

    // Get trade records within the date range
    const tradeRecords = await this.prisma.tradeReportRecord.findMany({
      where: {
        tradeDate: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    this.logger.log(`Analyzing ${tradeRecords.length} trade records for patterns`);

    // Apply each detection rule
    for (const rule of this.detectionRules) {
      const detectedPatterns = await this.applyDetectionRule(tradeRecords, rule);
      patterns.push(...detectedPatterns);
    }

    // Detect circular transactions
    const circularPatterns = await this.detectCircularTransactions(tradeRecords);
    patterns.push(...circularPatterns);

    // Detect rapid-fire trading
    const rapidFirePatterns = await this.detectRapidFireTrading(tradeRecords);
    patterns.push(...rapidFirePatterns);

    // Detect wash trading
    const washTradingPatterns = await this.detectWashTrading(tradeRecords);
    patterns.push(...washTradingPatterns);

    this.logger.log(`Detected ${patterns.length} suspicious patterns`);
    return patterns;
  }

  private async applyDetectionRule(
    tradeRecords: any[],
    rule: PatternDetectionRule
  ): Promise<SuspiciousPatternDto[]> {
    const patterns: SuspiciousPatternDto[] = [];

    switch (rule.type) {
      case SuspiciousActivityType.LARGE_TRANSACTIONS:
        patterns.push(...this.detectLargeTransactions(tradeRecords, rule));
        break;
      case SuspiciousActivityType.FREQUENT_SMALL_TRANSACTIONS:
        patterns.push(...this.detectFrequentSmallTransactions(tradeRecords, rule));
        break;
      case SuspiciousActivityType.STRUCTURING:
        patterns.push(...this.detectStructuring(tradeRecords, rule));
        break;
      case SuspiciousActivityType.UNUSUAL_PATTERN:
        patterns.push(...this.detectUnusualPatterns(tradeRecords, rule));
        break;
    }

    return patterns;
  }

  private detectLargeTransactions(
    tradeRecords: any[],
    rule: PatternDetectionRule
  ): SuspiciousPatternDto[] {
    const patterns: SuspiciousPatternDto[] = [];

    const largeTransactions = tradeRecords.filter(
      trade => trade.totalValue >= rule.threshold
    );

    // Group by address
    const addressGroups = this.groupByAddress(largeTransactions);

    for (const [address, transactions] of Object.entries(addressGroups)) {
      if (transactions.length >= 1) {
        const totalAmount = transactions.reduce((sum, t) => sum + parseFloat(t.totalValue), 0);
        
        patterns.push({
          patternType: 'LARGE_TRANSACTIONS',
          addresses: [address],
          confidence: rule.confidence,
          timeframe: {
            start: new Date(Math.min(...transactions.map(t => new Date(t.tradeDate).getTime()))),
            end: new Date(Math.max(...transactions.map(t => new Date(t.tradeDate).getTime()))),
          },
          details: {
            totalTransactions: transactions.length,
            totalAmount,
            averageTransactionAmount: totalAmount / transactions.length,
            threshold: rule.threshold,
          },
        });
      }
    }

    return patterns;
  }

  private detectFrequentSmallTransactions(
    tradeRecords: any[],
    rule: PatternDetectionRule
  ): SuspiciousPatternDto[] {
    const patterns: SuspiciousPatternDto[] = [];

    const smallTransactions = tradeRecords.filter(
      trade => trade.totalValue < rule.threshold
    );

    // Group by address and time windows
    const addressGroups = this.groupByAddress(smallTransactions);

    for (const [address, transactions] of Object.entries(addressGroups)) {
      // Check for frequent transactions within timeframe
      const timeWindows = this.groupByTimeWindow(transactions, rule.timeframe);

      for (const window of timeWindows) {
        if (window.transactions.length >= 5) { // 5+ transactions in timeframe
          const totalAmount = window.transactions.reduce((sum, t) => sum + parseFloat(t.totalValue), 0);
          
          patterns.push({
            patternType: 'FREQUENT_SMALL_TRANSACTIONS',
            addresses: [address],
            confidence: rule.confidence,
            timeframe: window.timeframe,
            details: {
              totalTransactions: window.transactions.length,
              totalAmount,
              averageTransactionAmount: totalAmount / window.transactions.length,
              frequency: window.transactions.length / (rule.timeframe / 24), // transactions per day
            },
          });
        }
      }
    }

    return patterns;
  }

  private detectStructuring(
    tradeRecords: any[],
    rule: PatternDetectionRule
  ): SuspiciousPatternDto[] {
    const patterns: SuspiciousPatternDto[] = [];

    // Look for transactions just under reporting threshold
    const suspiciousTransactions = tradeRecords.filter(
      trade => trade.totalValue >= rule.threshold * 0.9 && trade.totalValue <= rule.threshold
    );

    const addressGroups = this.groupByAddress(suspiciousTransactions);

    for (const [address, transactions] of Object.entries(addressGroups)) {
      if (transactions.length >= 3) { // 3+ structured transactions
        const totalAmount = transactions.reduce((sum, t) => sum + parseFloat(t.totalValue), 0);
        
        patterns.push({
          patternType: 'STRUCTURING_BELOW_THRESHOLD',
          addresses: [address],
          confidence: rule.confidence,
          timeframe: {
            start: new Date(Math.min(...transactions.map(t => new Date(t.tradeDate).getTime()))),
            end: new Date(Math.max(...transactions.map(t => new Date(t.tradeDate).getTime()))),
          },
          details: {
            totalTransactions: transactions.length,
            totalAmount,
            averageTransactionAmount: totalAmount / transactions.length,
            structuringIndicator: totalAmount > rule.threshold,
            threshold: rule.threshold,
          },
        });
      }
    }

    return patterns;
  }

  private detectUnusualPatterns(
    tradeRecords: any[],
    rule: PatternDetectionRule
  ): SuspiciousPatternDto[] {
    const patterns: SuspiciousPatternDto[] = [];

    // Analyze trading patterns by symbol
    const symbolGroups = this.groupBySymbol(tradeRecords);

    for (const [symbol, transactions] of Object.entries(symbolGroups)) {
      const volumes = transactions.map(t => parseFloat(t.totalValue));
      const avgVolume = volumes.reduce((sum, v) => sum + v, 0) / volumes.length;
      const stdDev = this.calculateStandardDeviation(volumes, avgVolume);

      // Look for transactions that are significantly above average
      const unusualTransactions = transactions.filter(
        t => parseFloat(t.totalValue) > avgVolume + (rule.threshold * stdDev)
      );

      if (unusualTransactions.length > 0) {
        const addresses = [...new Set(unusualTransactions.map(t => [t.buyerAddress, t.sellerAddress]).flat())];
        
        patterns.push({
          patternType: 'UNUSUAL_VOLUME_PATTERN',
          addresses,
          confidence: rule.confidence,
          timeframe: {
            start: new Date(Math.min(...unusualTransactions.map(t => new Date(t.tradeDate).getTime()))),
            end: new Date(Math.max(...unusualTransactions.map(t => new Date(t.tradeDate).getTime()))),
          },
          details: {
            symbol,
            averageVolume: avgVolume,
            standardDeviation: stdDev,
            unusualTransactions: unusualTransactions.length,
            totalUnusualVolume: unusualTransactions.reduce((sum, t) => sum + parseFloat(t.totalValue), 0),
          },
        });
      }
    }

    return patterns;
  }

  private async detectCircularTransactions(tradeRecords: any[]): Promise<SuspiciousPatternDto[]> {
    const patterns: SuspiciousPatternDto[] = [];

    // Build transaction graph
    const graph = this.buildTransactionGraph(tradeRecords);

    // Detect cycles in the graph
    const cycles = this.detectCycles(graph);

    for (const cycle of cycles) {
      const cycleTransactions = tradeRecords.filter(
        t => cycle.has(t.buyerAddress) && cycle.has(t.sellerAddress)
      );

      if (cycleTransactions.length >= 3) {
        patterns.push({
          patternType: 'CIRCULAR_TRANSACTIONS',
          addresses: Array.from(cycle),
          confidence: SuspicionConfidence.HIGH,
          timeframe: {
            start: new Date(Math.min(...cycleTransactions.map(t => new Date(t.tradeDate).getTime()))),
            end: new Date(Math.max(...cycleTransactions.map(t => new Date(t.tradeDate).getTime()))),
          },
          details: {
            totalTransactions: cycleTransactions.length,
            cycleLength: cycle.size,
            totalVolume: cycleTransactions.reduce((sum, t) => sum + parseFloat(t.totalValue), 0),
          },
        });
      }
    }

    return patterns;
  }

  private async detectRapidFireTrading(tradeRecords: any[]): Promise<SuspiciousPatternDto[]> {
    const patterns: SuspiciousPatternDto[] = [];

    // Group by symbol and look for rapid succession
    const symbolGroups = this.groupBySymbol(tradeRecords);

    for (const [symbol, transactions] of Object.entries(symbolGroups)) {
      // Sort by timestamp
      transactions.sort((a, b) => new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime());

      // Look for multiple trades within short timeframes
      for (let i = 0; i < transactions.length - 2; i++) {
        const window = transactions.slice(i, i + 3);
        const timeSpan = new Date(window[2].tradeDate).getTime() - new Date(window[0].tradeDate).getTime();
        
        if (timeSpan < 5 * 60 * 1000) { // 5 minutes
          const addresses = [...new Set(window.map(t => [t.buyerAddress, t.sellerAddress]).flat())];
          
          patterns.push({
            patternType: 'RAPID_FIRE_TRADING',
            addresses,
            confidence: SuspicionConfidence.MEDIUM,
            timeframe: {
              start: new Date(window[0].tradeDate),
              end: new Date(window[2].tradeDate),
            },
            details: {
              symbol,
              transactionCount: window.length,
              timeSpanMinutes: timeSpan / (60 * 1000),
              totalVolume: window.reduce((sum, t) => sum + parseFloat(t.totalValue), 0),
            },
          });
        }
      }
    }

    return patterns;
  }

  private async detectWashTrading(tradeRecords: any[]): Promise<SuspiciousPatternDto[]> {
    const patterns: SuspiciousPatternDto[] = [];

    // Look for trades where buyer and seller are related or same entity
    const suspiciousTrades = tradeRecords.filter(trade => {
      // Simple heuristic: similar addresses or known relationships
      return this.areAddressesRelated(trade.buyerAddress, trade.sellerAddress);
    });

    if (suspiciousTrades.length > 0) {
      const addresses = [...new Set(suspiciousTrades.map(t => [t.buyerAddress, t.sellerAddress]).flat())];
      
      patterns.push({
        patternType: 'WASH_TRADING',
        addresses,
        confidence: SuspicionConfidence.HIGH,
        timeframe: {
          start: new Date(Math.min(...suspiciousTrades.map(t => new Date(t.tradeDate).getTime()))),
          end: new Date(Math.max(...suspiciousTrades.map(t => new Date(t.tradeDate).getTime()))),
        },
        details: {
          totalTransactions: suspiciousTrades.length,
          totalVolume: suspiciousTrades.reduce((sum, t) => sum + parseFloat(t.totalValue), 0),
        },
      });
    }

    return patterns;
  }

  // Helper methods
  private groupByAddress(transactions: any[]): Record<string, any[]> {
    const groups: Record<string, any[]> = {};
    
    for (const trade of transactions) {
      if (!groups[trade.buyerAddress]) groups[trade.buyerAddress] = [];
      if (!groups[trade.sellerAddress]) groups[trade.sellerAddress] = [];
      
      groups[trade.buyerAddress].push(trade);
      groups[trade.sellerAddress].push(trade);
    }
    
    return groups;
  }

  private groupBySymbol(transactions: any[]): Record<string, any[]> {
    const groups: Record<string, any[]> = {};
    
    for (const trade of transactions) {
      if (!groups[trade.symbol]) groups[trade.symbol] = [];
      groups[trade.symbol].push(trade);
    }
    
    return groups;
  }

  private groupByTimeWindow(transactions: any[], windowHours: number): Array<{transactions: any[], timeframe: {start: Date, end: Date}}> {
    const windows: Array<{transactions: any[], timeframe: {start: Date, end: Date}}> = [];
    const sortedTransactions = transactions.sort((a, b) => new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime());
    
    for (let i = 0; i < sortedTransactions.length; i++) {
      const windowStart = new Date(sortedTransactions[i].tradeDate);
      const windowEnd = new Date(windowStart.getTime() + windowHours * 60 * 60 * 1000);
      
      const windowTransactions = sortedTransactions.filter(
        t => new Date(t.tradeDate) >= windowStart && new Date(t.tradeDate) <= windowEnd
      );
      
      if (windowTransactions.length >= 2) {
        windows.push({
          transactions: windowTransactions,
          timeframe: { start: windowStart, end: windowEnd }
        });
      }
    }
    
    return windows;
  }

  private calculateStandardDeviation(values: number[], mean: number): number {
    const squaredDifferences = values.map(value => Math.pow(value - mean, 2));
    const avgSquaredDiff = squaredDifferences.reduce((sum, diff) => sum + diff, 0) / values.length;
    return Math.sqrt(avgSquaredDiff);
  }

  private buildTransactionGraph(transactions: any[]): Map<string, Set<string>> {
    const graph = new Map<string, Set<string>>();
    
    for (const trade of transactions) {
      if (!graph.has(trade.buyerAddress)) {
        graph.set(trade.buyerAddress, new Set());
      }
      if (!graph.has(trade.sellerAddress)) {
        graph.set(trade.sellerAddress, new Set());
      }
      
      graph.get(trade.buyerAddress)!.add(trade.sellerAddress);
      graph.get(trade.sellerAddress)!.add(trade.buyerAddress);
    }
    
    return graph;
  }

  private detectCycles(graph: Map<string, Set<string>>): Set<string>[] {
    const cycles: Set<string>[] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        const path: string[] = [];
        this.dfsCycleDetection(node, graph, visited, recursionStack, path, cycles);
      }
    }
    
    return cycles;
  }

  private dfsCycleDetection(
    node: string,
    graph: Map<string, Set<string>>,
    visited: Set<string>,
    recursionStack: Set<string>,
    path: string[],
    cycles: Set<string>[]
  ): void {
    visited.add(node);
    recursionStack.add(node);
    path.push(node);
    
    for (const neighbor of graph.get(node) || new Set()) {
      if (!visited.has(neighbor)) {
        this.dfsCycleDetection(neighbor, graph, visited, recursionStack, path, cycles);
      } else if (recursionStack.has(neighbor)) {
        // Found a cycle
        const cycleStart = path.indexOf(neighbor);
        const cycle = new Set(path.slice(cycleStart));
        if (cycle.size > 2) { // Only consider cycles with 3+ nodes
          cycles.push(cycle);
        }
      }
    }
    
    recursionStack.delete(node);
    path.pop();
  }

  private areAddressesRelated(address1: string, address2: string): boolean {
    // Simple heuristic - in production, this would use more sophisticated analysis
    // such as known entity relationships, clustering analysis, etc.
    
    // Check if addresses are similar (possible typo variations)
    if (address1.substring(0, 8) === address2.substring(0, 8)) {
      return true;
    }
    
    // Check if addresses have known relationships (mock implementation)
    // In production, this would query a relationship database
    return false;
  }
}
