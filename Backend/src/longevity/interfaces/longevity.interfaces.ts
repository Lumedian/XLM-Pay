export interface PubMedArticle {
  uid: string;
  title: string;
  authors: Array<{ name: string }>;
  fulljournalname?: string;
  sortdate?: string;
  doi?: string;
  abstracttext?: string;
  pubdate?: string;
}

export interface BioRxivArticle {
  doi: string;
  title: string;
  authors: string;
  abstract: string;
  date: string;
  server: string;
  category?: string;
  jatsxml?: string;
}

export interface ClinicalTrialRecord {
  nctId: string;
  briefTitle: string;
  officialTitle?: string;
  overallStatus: string;
  phase?: string;
  conditions: string[];
  interventions: Array<{ type: string; name: string }>;
  startDate?: string;
  completionDate?: string;
  enrollment?: number;
  sponsor?: string;
  primaryOutcomes?: Array<{ measure: string; description?: string }>;
}

export interface MarketPriceResult {
  yesPrice: number;
  noPrice: number;
  yesShares: number;
  noShares: number;
}

export interface LongevityStats {
  totalResearchPapers: number;
  openAccessPapers: number;
  totalClinicalTrials: number;
  activeTrials: number;
  totalMarkets: number;
  openMarkets: number;
  totalFundingAllocated: string;
  totalDiscussions: number;
}
