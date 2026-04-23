import { Injectable, Logger } from '@nestjs/common';
import { OpenAI } from 'openai';
import { RelevanceScoreResult } from '../interfaces/regulatory.interface';
import { ParsedRegulatoryItem } from './regulatory-aggregation.service';

@Injectable()
export class RelevanceScoringService {
  private readonly logger = new Logger(RelevanceScoringService.name);
  private readonly openai: OpenAI;

  // Relevance weights for different factors
  private readonly weights = {
    keywordMatch: 0.35,
    jurisdictionRelevance: 0.20,
    complianceAreaMatch: 0.25,
    recency: 0.10,
    sourceAuthority: 0.10,
  };

  // Source authority scores
  private readonly sourceAuthorityScores = {
    SEC: 0.95,
    CFTC: 0.90,
    FINCEN: 0.85,
    FATF: 0.90,
    ESMA: 0.85,
    FCA: 0.80,
    MAS: 0.75,
    HKMA: 0.75,
    JFSA: 0.75,
    OTHER: 0.50,
  };

  // Target jurisdictions for our operations
  private readonly targetJurisdictions = [
    'US', 'USA', 'United States',
    'EU', 'European Union',
    'UK', 'United Kingdom',
    'Singapore', 'Hong Kong',
    'Japan', 'Switzerland'
  ];

  // Relevant compliance areas for our business
  private readonly relevantComplianceAreas = [
    'KYC', 'AML', 'REPORTING', 'LICENSING',
    'PRIVACY', 'DATA_PROTECTION', 'CAPITAL_REQUIREMENTS',
    'RISK_MANAGEMENT', 'CONSUMER_PROTECTION', 'MARKET_INTEGRITY'
  ];

  // High-priority keywords
  private readonly highPriorityKeywords = [
    'cryptocurrency', 'digital assets', 'virtual currency', 'crypto assets',
    'defi', 'decentralized finance', 'smart contracts', 'blockchain',
    'dlt', 'distributed ledger', 'tokens', 'stablecoins', 'cbdc',
    'vasps', 'travel rule', 'custody', 'exchanges', 'trading platforms'
  ];

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async calculateRelevance(item: ParsedRegulatoryItem): Promise<RelevanceScoreResult> {
    try {
      // Calculate individual factor scores
      const keywordMatch = this.calculateKeywordMatch(item);
      const jurisdictionRelevance = this.calculateJurisdictionRelevance(item);
      const complianceAreaMatch = this.calculateComplianceAreaMatch(item);
      const recency = this.calculateRecency(item.publicationDate);
      const sourceAuthority = this.calculateSourceAuthority(item);

      // Calculate weighted total score
      const totalScore = Object.entries(this.weights).reduce((sum, [factor, weight]) => {
        const factorScore = this.getFactorScore(factor, {
          keywordMatch,
          jurisdictionRelevance,
          complianceAreaMatch,
          recency,
          sourceAuthority,
        });
        return sum + (factorScore * weight);
      }, 0);

      // Generate AI-powered explanation and tags
      const aiAnalysis = await this.generateAIAnalysis(item, totalScore);

      return {
        score: Math.min(totalScore, 1.0),
        confidence: this.calculateConfidence(item, {
          keywordMatch,
          jurisdictionRelevance,
          complianceAreaMatch,
        }),
        factors: {
          keywordMatch,
          jurisdictionRelevance,
          complianceAreaMatch,
          recency,
          sourceAuthority,
        },
        explanation: aiAnalysis.explanation,
        suggestedTags: [...item.keywords, ...aiAnalysis.additionalTags],
      };
    } catch (error) {
      this.logger.error('Error calculating relevance:', error);
      // Fallback to basic scoring
      return this.getFallbackScore(item);
    }
  }

  private calculateKeywordMatch(item: ParsedRegulatoryItem): number {
    const text = (item.title + ' ' + item.summary + ' ' + item.keywords.join(' ')).toLowerCase();
    
    // Count high-priority keyword matches
    const highPriorityMatches = this.highPriorityKeywords.filter(keyword =>
      text.includes(keyword.toLowerCase())
    ).length;

    // Count total keyword matches
    const totalMatches = item.keywords.length + highPriorityMatches;

    // Calculate score based on match quality and quantity
    if (highPriorityMatches > 0) {
      return Math.min((highPriorityMatches * 0.3) + (totalMatches * 0.1), 1.0);
    } else if (totalMatches > 0) {
      return Math.min(totalMatches * 0.15, 0.6);
    }

    return 0;
  }

  private calculateJurisdictionRelevance(item: ParsedRegulatoryItem): number {
    if (item.jurisdictions.length === 0) return 0.1;

    const relevantJurisdictions = item.jurisdictions.filter(jurisdiction =>
      this.targetJurisdictions.some(target =>
        jurisdiction.toLowerCase().includes(target.toLowerCase()) ||
        target.toLowerCase().includes(jurisdiction.toLowerCase())
      )
    );

    if (relevantJurisdictions.length > 0) {
      // Higher score for US/EU/UK as primary markets
      const hasPrimaryMarket = relevantJurisdictions.some(jur =>
        ['US', 'USA', 'EU', 'UK'].some(primary =>
          jur.toLowerCase().includes(primary.toLowerCase())
        )
      );

      return hasPrimaryMarket ? 0.9 : 0.7;
    }

    return 0.2; // Low relevance for other jurisdictions
  }

  private calculateComplianceAreaMatch(item: ParsedRegulatoryItem): number {
    const text = (item.title + ' ' + item.summary + ' ' + item.keywords.join(' ')).toLowerCase();
    
    const matchedAreas = this.relevantComplianceAreas.filter(area =>
      text.includes(area.toLowerCase().replace('_', ' ')) ||
      text.includes(area.toLowerCase())
    );

    if (matchedAreas.length === 0) return 0;

    // Higher score for critical compliance areas
    const criticalAreas = ['AML', 'KYC', 'LICENSING', 'REPORTING'];
    const hasCriticalArea = matchedAreas.some(area => criticalAreas.includes(area));

    if (hasCriticalArea) {
      return Math.min(0.5 + (matchedAreas.length * 0.1), 1.0);
    }

    return Math.min(matchedAreas.length * 0.2, 0.7);
  }

  private calculateRecency(publicationDate: Date): number {
    const now = new Date();
    const daysDiff = (now.getTime() - publicationDate.getTime()) / (1000 * 60 * 60 * 24);

    if (daysDiff <= 7) return 1.0; // Very recent
    if (daysDiff <= 30) return 0.8; // Recent
    if (daysDiff <= 90) return 0.6; // This quarter
    if (daysDiff <= 365) return 0.4; // This year
    return 0.2; // Older
  }

  private calculateSourceAuthority(source: string): number {
    return this.sourceAuthorityScores[source] || 0.5;
  }

  private getFactorScore(factor: string, scores: any): number {
    return scores[factor] || 0;
  }

  private calculateConfidence(item: ParsedRegulatoryItem, factorScores: any): number {
    let confidence = 0.5; // Base confidence

    // Higher confidence with more data
    if (item.keywords.length > 3) confidence += 0.1;
    if (item.jurisdictions.length > 0) confidence += 0.1;
    if (item.summary.length > 100) confidence += 0.1;

    // Higher confidence with consistent scoring
    const avgScore = (factorScores.keywordMatch + factorScores.jurisdictionRelevance + 
                     factorScores.complianceAreaMatch) / 3;
    if (avgScore > 0.7) confidence += 0.2;

    return Math.min(confidence, 1.0);
  }

  private async generateAIAnalysis(item: ParsedRegulatoryItem, score: number): Promise<{
    explanation: string;
    additionalTags: string[];
  }> {
    try {
      const prompt = `
Analyze the following regulatory change for relevance to a cryptocurrency/DeFi trading platform:

Title: ${item.title}
Summary: ${item.summary}
Keywords: ${item.keywords.join(', ')}
Jurisdictions: ${item.jurisdictions.join(', ')}
Calculated Relevance Score: ${score.toFixed(2)}

Provide:
1. A brief explanation (1-2 sentences) of why this is relevant or not relevant
2. 3-5 additional relevant tags that weren't already captured

Focus on: crypto assets, DeFi, trading, compliance, AML/KYC, licensing, and financial regulations.
`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a regulatory compliance expert specializing in cryptocurrency and DeFi regulations. Provide concise, accurate analysis.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 200,
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content || '';
      
      // Parse the response
      const lines = content.split('\n').filter(line => line.trim());
      const explanation = lines[0] || 'Relevance determined by keyword and jurisdiction matching';
      
      // Extract additional tags (assuming they're listed after the explanation)
      const additionalTags = lines.slice(1)
        .join(' ')
        .replace(/[^\w\s,-]/g, '')
        .split(/[\s,]+/)
        .filter(tag => tag.length > 2 && tag.length < 30)
        .slice(0, 5);

      return {
        explanation,
        additionalTags,
      };
    } catch (error) {
      this.logger.warn('AI analysis failed, using fallback:', error);
      return {
        explanation: 'Relevance determined by keyword matching and jurisdiction analysis',
        additionalTags: [],
      };
    }
  }

  private getFallbackScore(item: ParsedRegulatoryItem): RelevanceScoreResult {
    const keywordMatch = this.calculateKeywordMatch(item);
    const jurisdictionRelevance = this.calculateJurisdictionRelevance(item);
    const complianceAreaMatch = this.calculateComplianceAreaMatch(item);
    const recency = this.calculateRecency(item.publicationDate);
    const sourceAuthority = 0.7; // Default authority score

    const totalScore = (keywordMatch * this.weights.keywordMatch) +
                      (jurisdictionRelevance * this.weights.jurisdictionRelevance) +
                      (complianceAreaMatch * this.weights.complianceAreaMatch) +
                      (recency * this.weights.recency) +
                      (sourceAuthority * this.weights.sourceAuthority);

    return {
      score: Math.min(totalScore, 1.0),
      confidence: 0.6, // Moderate confidence for fallback
      factors: {
        keywordMatch,
        jurisdictionRelevance,
        complianceAreaMatch,
        recency,
        sourceAuthority,
      },
      explanation: 'Relevance calculated using keyword matching and basic rules',
      suggestedTags: item.keywords,
    };
  }

  // Batch processing for multiple items
  async calculateBatchRelevance(items: ParsedRegulatoryItem[]): Promise<RelevanceScoreResult[]> {
    const results: RelevanceScoreResult[] = [];
    
    // Process in batches to avoid rate limits
    const batchSize = 5;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchPromises = batch.map(item => this.calculateRelevance(item));
      
      try {
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      } catch (error) {
        this.logger.error(`Batch processing failed for items ${i}-${i + batchSize}:`, error);
        // Add fallback scores for failed batch
        const fallbackResults = batch.map(item => this.getFallbackScore(item));
        results.push(...fallbackResults);
      }

      // Small delay between batches to respect rate limits
      if (i + batchSize < items.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  // Update scoring weights based on feedback
  updateWeights(newWeights: Partial<typeof this.weights>): void {
    Object.assign(this.weights, newWeights);
    this.logger.log('Updated relevance scoring weights:', this.weights);
  }

  // Get current weights for debugging
  getWeights(): typeof this.weights {
    return { ...this.weights };
  }
}
