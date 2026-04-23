import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { RegulatoryChange, RegulatorySource, ChangeType } from '../interfaces/regulatory.interface';
import { RelevanceScoringService } from './relevance-scoring.service';

export interface RegulatoryFeedConfig {
  source: RegulatorySource;
  name: string;
  feedUrl: string;
  apiKey?: string;
  fetchFrequency: number;
  filters?: {
    keywords?: string[];
    jurisdictions?: string[];
    dateRange?: {
      from: Date;
      to: Date;
    };
    changeTypes?: ChangeType[];
  };
}

export interface ParsedRegulatoryItem {
  title: string;
  summary: string;
  content: string;
  sourceUrl: string;
  publicationDate: Date;
  effectiveDate?: Date;
  changeType: ChangeType;
  jurisdictions: string[];
  keywords: string[];
}

@Injectable()
export class RegulatoryAggregationService {
  private readonly logger = new Logger(RegulatoryAggregationService.name);
  private readonly feedConfigs: Map<RegulatorySource, RegulatoryFeedConfig> = new Map();

  constructor(
    private readonly httpService: HttpService,
    private readonly relevanceScoringService: RelevanceScoringService,
  ) {
    this.initializeFeedConfigs();
  }

  private initializeFeedConfigs(): void {
    // SEC RSS Feed
    this.feedConfigs.set(RegulatorySource.SEC, {
      source: RegulatorySource.SEC,
      name: 'SEC Press Releases and Rules',
      feedUrl: 'https://www.sec.gov/news/pressrelease/rss.xml',
      fetchFrequency: 3600, // 1 hour
      filters: {
        keywords: ['cryptocurrency', 'digital assets', 'blockchain', 'defi', 'trading'],
        changeTypes: [ChangeType.NEW_REGULATION, ChangeType.AMENDMENT, ChangeType.ENFORCEMENT],
      },
    });

    // CFTC RSS Feed
    this.feedConfigs.set(RegulatorySource.CFTC, {
      source: RegulatorySource.CFTC,
      name: 'CFTC Enforcement and Regulations',
      feedUrl: 'https://www.cftc.gov/PressReleases/PressRss.xml',
      fetchFrequency: 3600,
      filters: {
        keywords: ['crypto', 'digital assets', 'virtual currency', 'blockchain'],
        changeTypes: [ChangeType.ENFORCEMENT, ChangeType.AMENDMENT],
      },
    });

    // FinCEN RSS Feed
    this.feedConfigs.set(RegulatorySource.FINCEN, {
      source: RegulatorySource.FINCEN,
      name: 'FinCEN Regulations and Guidance',
      feedUrl: 'https://www.fincen.gov/news/rss.xml',
      fetchFrequency: 3600,
      filters: {
        keywords: ['virtual currency', 'digital assets', 'money services', 'aml'],
        changeTypes: [ChangeType.GUIDANCE, ChangeType.NEW_REGULATION],
      },
    });

    // FATF RSS Feed
    this.feedConfigs.set(RegulatorySource.FATF, {
      source: RegulatorySource.FATF,
      name: 'FATF Standards and Guidance',
      feedUrl: 'https://www.fatf-gafi.org/publications/fatfguidance/rss.xml',
      fetchFrequency: 7200, // 2 hours
      filters: {
        keywords: ['virtual assets', 'crypto assets', 'vasps', 'travel rule'],
        changeTypes: [ChangeType.GUIDANCE, ChangeType.NEW_REGULATION],
      },
    });

    // ESMA RSS Feed
    this.feedConfigs.set(RegulatorySource.ESMA, {
      source: RegulatorySource.ESMA,
      name: 'ESMA Regulations and Guidelines',
      feedUrl: 'https://www.esma.europa.eu/press-news/rss-page',
      fetchFrequency: 3600,
      filters: {
        keywords: ['crypto assets', 'dlt', 'distributed ledger', 'digital finance'],
        jurisdictions: ['EU'],
        changeTypes: [ChangeType.NEW_REGULATION, ChangeType.GUIDANCE],
      },
    });
  }

  @Cron(CronExpression.EVERY_HOUR)
  async aggregateRegulatoryChanges(): Promise<RegulatoryChange[]> {
    this.logger.log('Starting regulatory aggregation...');
    const allChanges: RegulatoryChange[] = [];

    for (const [source, config] of this.feedConfigs) {
      try {
        const changes = await this.fetchFromSource(source, config);
        allChanges.push(...changes);
        this.logger.log(`Fetched ${changes.length} changes from ${source}`);
      } catch (error) {
        this.logger.error(`Failed to fetch from ${source}:`, error);
      }
    }

    // Process and score changes
    const processedChanges = await this.processChanges(allChanges);
    this.logger.log(`Processed ${processedChanges.length} regulatory changes`);

    return processedChanges;
  }

  async fetchFromSource(source: RegulatorySource, config: RegulatoryFeedConfig): Promise<RegulatoryChange[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(config.feedUrl, {
          headers: config.apiKey ? {
            'Authorization': `Bearer ${config.apiKey}`,
            'User-Agent': 'Stellara-Regulatory-Aggregator/1.0'
          } : {
            'User-Agent': 'Stellara-Regulatory-Aggregator/1.0'
          },
          timeout: 30000,
        })
      );

      const parsedItems = this.parseRSSFeed(response.data, source);
      const filteredItems = this.filterItems(parsedItems, config.filters);

      return await this.convertToRegulatoryChanges(filteredItems, source);
    } catch (error) {
      this.logger.error(`Error fetching from ${source}:`, error);
      throw error;
    }
  }

  private parseRSSFeed(xmlData: string, source: RegulatorySource): ParsedRegulatoryItem[] {
    const items: ParsedRegulatoryItem[] = [];
    
    try {
      // Simple XML parsing (in production, use a proper XML parser)
      const itemMatches = xmlData.match(/<item>(.*?)<\/item>/gs) || [];
      
      for (const itemXml of itemMatches) {
        const titleMatch = itemXml.match(/<title>(.*?)<\/title>/);
        const linkMatch = itemXml.match(/<link>(.*?)<\/link>/);
        const descriptionMatch = itemXml.match(/<description>(.*?)<\/description>/);
        const pubDateMatch = itemXml.match(/<pubDate>(.*?)<\/pubDate>/);

        if (titleMatch && linkMatch && descriptionMatch && pubDateMatch) {
          const title = this.cleanHTML(titleMatch[1]);
          const sourceUrl = linkMatch[1];
          const summary = this.cleanHTML(descriptionMatch[1]);
          const publicationDate = new Date(pubDateMatch[1]);

          // Extract keywords and jurisdictions from title and summary
          const keywords = this.extractKeywords(title + ' ' + summary);
          const jurisdictions = this.extractJurdictions(title + ' ' + summary);

          items.push({
            title,
            summary,
            content: summary, // In a real implementation, fetch full content
            sourceUrl,
            publicationDate,
            changeType: this.inferChangeType(title, summary),
            jurisdictions,
            keywords,
          });
        }
      }
    } catch (error) {
      this.logger.error('Error parsing RSS feed:', error);
    }

    return items;
  }

  private filterItems(items: ParsedRegulatoryItem[], filters?: any): ParsedRegulatoryItem[] {
    if (!filters) return items;

    return items.filter(item => {
      // Keyword filtering
      if (filters.keywords && filters.keywords.length > 0) {
        const hasKeyword = filters.keywords.some((keyword: string) =>
          item.title.toLowerCase().includes(keyword.toLowerCase()) ||
          item.summary.toLowerCase().includes(keyword.toLowerCase()) ||
          item.keywords.some(k => k.toLowerCase().includes(keyword.toLowerCase()))
        );
        if (!hasKeyword) return false;
      }

      // Jurisdiction filtering
      if (filters.jurisdictions && filters.jurisdictions.length > 0) {
        const hasJurisdiction = filters.jurisdictions.some((jur: string) =>
          item.jurisdictions.some(j => j.toLowerCase().includes(jur.toLowerCase()))
        );
        if (!hasJurisdiction) return false;
      }

      // Change type filtering
      if (filters.changeTypes && filters.changeTypes.length > 0) {
        if (!filters.changeTypes.includes(item.changeType)) return false;
      }

      // Date range filtering
      if (filters.dateRange) {
        if (item.publicationDate < filters.dateRange.from || 
            item.publicationDate > filters.dateRange.to) {
          return false;
        }
      }

      return true;
    });
  }

  private async convertToRegulatoryChanges(items: ParsedRegulatoryItem[], source: RegulatorySource): Promise<RegulatoryChange[]> {
    const changes: RegulatoryChange[] = [];

    for (const item of items) {
      // Calculate relevance score
      const relevanceResult = await this.relevanceScoringService.calculateRelevance(item);

      const regulatoryChange: RegulatoryChange = {
        id: this.generateId(),
        title: item.title,
        summary: item.summary,
        content: item.content,
        source,
        sourceUrl: item.sourceUrl,
        changeType: item.changeType,
        publicationDate: item.publicationDate,
        effectiveDate: item.effectiveDate,
        relevanceScore: relevanceResult.score,
        jurisdictions: item.jurisdictions,
        complianceAreas: this.inferComplianceAreas(item),
        aiTags: relevanceResult.suggestedTags,
        isProcessed: false,
        isAssessed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      changes.push(regulatoryChange);
    }

    return changes;
  }

  private async processChanges(changes: RegulatoryChange[]): Promise<RegulatoryChange[]> {
    // Sort by relevance score
    changes.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Mark high-relevance changes for immediate assessment
    changes.forEach(change => {
      if (change.relevanceScore > 0.8) {
        change.isProcessed = true; // Mark for immediate processing
      }
    });

    return changes;
  }

  private cleanHTML(text: string): string {
    return text
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }

  private extractKeywords(text: string): string[] {
    const cryptoKeywords = [
      'cryptocurrency', 'bitcoin', 'ethereum', 'defi', 'nft', 'web3',
      'blockchain', 'digital assets', 'virtual currency', 'crypto assets',
      'smart contracts', 'dlt', 'distributed ledger', 'vasps', 'travel rule',
      'stablecoins', 'central bank digital currency', 'cbdc', 'tokens'
    ];

    const regulatoryKeywords = [
      'regulation', 'compliance', 'enforcement', 'guidance', 'policy',
      'framework', 'legislation', 'rule', 'amendment', 'directive'
    ];

    const textLower = text.toLowerCase();
    const foundKeywords: string[] = [];

    [...cryptoKeywords, ...regulatoryKeywords].forEach(keyword => {
      if (textLower.includes(keyword.toLowerCase())) {
        foundKeywords.push(keyword);
      }
    });

    return foundKeywords;
  }

  private extractJurdictions(text: string): string[] {
    const jurisdictions = [
      'US', 'USA', 'United States', 'EU', 'European Union', 'UK', 'United Kingdom',
      'Japan', 'Singapore', 'Hong Kong', 'Switzerland', 'Canada', 'Australia',
      'Germany', 'France', 'Italy', 'Spain', 'Netherlands', 'Belgium'
    ];

    const textLower = text.toLowerCase();
    const foundJurisdictions: string[] = [];

    jurisdictions.forEach(jurisdiction => {
      if (textLower.includes(jurisdiction.toLowerCase())) {
        foundJurisdictions.push(jurisdiction);
      }
    });

    return foundJurisdictions;
  }

  private inferChangeType(title: string, summary: string): ChangeType {
    const text = (title + ' ' + summary).toLowerCase();

    if (text.includes('enforcement') || text.includes('action') || text.includes('penalty')) {
      return ChangeType.ENFORCEMENT;
    } else if (text.includes('guidance') || text.includes('interpretation') || text.includes('faq')) {
      return ChangeType.GUIDANCE;
    } else if (text.includes('repeal') || text.includes('rescind') || text.includes('withdraw')) {
      return ChangeType.REPEAL;
    } else if (text.includes('amendment') || text.includes('amend') || text.includes('modify')) {
      return ChangeType.AMENDMENT;
    } else if (text.includes('policy') || text.includes('procedure')) {
      return ChangeType.POLICY_UPDATE;
    } else {
      return ChangeType.NEW_REGULATION;
    }
  }

  private inferComplianceAreas(item: ParsedRegulatoryItem): any[] {
    const text = (item.title + ' ' + item.summary + ' ' + item.keywords.join(' ')).toLowerCase();
    const areas = [];

    if (text.includes('kyc') || text.includes('know your customer') || text.includes('customer due diligence')) {
      areas.push('KYC');
    }
    if (text.includes('aml') || text.includes('anti-money laundering') || text.includes('money laundering')) {
      areas.push('AML');
    }
    if (text.includes('reporting') || text.includes('disclosure') || text.includes('transparency')) {
      areas.push('REPORTING');
    }
    if (text.includes('license') || text.includes('registration') || text.includes('permit')) {
      areas.push('LICENSING');
    }
    if (text.includes('privacy') || text.includes('data protection') || text.includes('gdpr')) {
      areas.push('PRIVACY');
    }
    if (text.includes('capital') || text.includes('capital requirements') || text.includes('basel')) {
      areas.push('CAPITAL_REQUIREMENTS');
    }
    if (text.includes('risk') || text.includes('risk management') || text.includes('risk assessment')) {
      areas.push('RISK_MANAGEMENT');
    }
    if (text.includes('consumer') || text.includes('investor protection') || text.includes('customer protection')) {
      areas.push('CONSUMER_PROTECTION');
    }
    if (text.includes('market') || text.includes('market integrity') || text.includes('market abuse')) {
      areas.push('MARKET_INTEGRITY');
    }

    return areas;
  }

  private generateId(): string {
    return 'reg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  // Manual trigger for testing
  async triggerAggregation(): Promise<RegulatoryChange[]> {
    return this.aggregateRegulatoryChanges();
  }

  getFeedConfigs(): RegulatoryFeedConfig[] {
    return Array.from(this.feedConfigs.values());
  }

  updateFeedConfig(source: RegulatorySource, config: Partial<RegulatoryFeedConfig>): void {
    const existing = this.feedConfigs.get(source);
    if (existing) {
      this.feedConfigs.set(source, { ...existing, ...config });
    }
  }
}
