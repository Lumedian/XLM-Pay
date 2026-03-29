import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../prisma.service';
import { ResearchSource } from '@prisma/client';
import { PubMedArticle, BioRxivArticle } from './interfaces/longevity.interfaces';

const LONGEVITY_KEYWORDS = [
  'aging',
  'longevity',
  'lifespan extension',
  'senolytics',
  'senescence',
  'metformin aging',
  'rapamycin aging',
  'NAD+ aging',
  'telomere aging',
  'anti-aging',
  'caloric restriction',
  'mTOR aging',
  'AMPK aging',
  'sirtuins',
  'epigenetic clock',
];

/** Handles aggregation of longevity research from PubMed and bioRxiv */
@Injectable()
export class ResearchAggregatorService {
  private readonly logger = new Logger(ResearchAggregatorService.name);
  private readonly pubmedBase = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
  private readonly biorxivBase = 'https://api.biorxiv.org';

  constructor(
    private readonly http: HttpService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Sync longevity research from PubMed.
   * Uses the NCBI E-utilities API (no key required for low-volume access).
   */
  async syncFromPubMed(maxResults = 100): Promise<number> {
    this.logger.log(`Starting PubMed sync (maxResults=${maxResults})`);
    let syncedCount = 0;

    for (const keyword of LONGEVITY_KEYWORDS.slice(0, 5)) {
      try {
        const ids = await this.searchPubMed(keyword, Math.ceil(maxResults / 5));
        if (!ids.length) continue;

        const articles = await this.fetchPubMedDetails(ids);
        for (const article of articles) {
          await this.upsertPubMedRecord(article);
          syncedCount++;
        }
      } catch (err) {
        this.logger.error(`PubMed sync failed for keyword "${keyword}": ${err.message}`);
      }
    }

    this.logger.log(`PubMed sync complete. Synced ${syncedCount} records.`);
    return syncedCount;
  }

  /**
   * Sync longevity research from bioRxiv.
   * Uses the bioRxiv summary API.
   */
  async syncFromBioRxiv(daysBack = 30): Promise<number> {
    this.logger.log(`Starting bioRxiv sync (daysBack=${daysBack})`);
    let syncedCount = 0;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const start = this.formatDate(startDate);
    const end = this.formatDate(endDate);

    try {
      const url = `${this.biorxivBase}/details/biorxiv/${start}/${end}/0`;
      const response = await firstValueFrom(this.http.get<any>(url, { timeout: 15000 }));

      const collection: BioRxivArticle[] = response.data?.collection ?? [];
      const longevityArticles = collection.filter((a) =>
        this.isLongevityRelated(a.title + ' ' + a.abstract),
      );

      for (const article of longevityArticles.slice(0, 50)) {
        await this.upsertBioRxivRecord(article);
        syncedCount++;
      }
    } catch (err) {
      this.logger.error(`bioRxiv sync failed: ${err.message}`);
    }

    this.logger.log(`bioRxiv sync complete. Synced ${syncedCount} records.`);
    return syncedCount;
  }

  /** Sync from medRxiv (clinical preprints) */
  async syncFromMedRxiv(daysBack = 30): Promise<number> {
    this.logger.log(`Starting medRxiv sync`);
    let syncedCount = 0;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const start = this.formatDate(startDate);
    const end = this.formatDate(endDate);

    try {
      const url = `${this.biorxivBase}/details/medrxiv/${start}/${end}/0`;
      const response = await firstValueFrom(this.http.get<any>(url, { timeout: 15000 }));

      const collection: BioRxivArticle[] = response.data?.collection ?? [];
      const longevityArticles = collection.filter((a) =>
        this.isLongevityRelated(a.title + ' ' + a.abstract),
      );

      for (const article of longevityArticles.slice(0, 50)) {
        await this.upsertMedRxivRecord(article);
        syncedCount++;
      }
    } catch (err) {
      this.logger.error(`medRxiv sync failed: ${err.message}`);
    }

    this.logger.log(`medRxiv sync complete. Synced ${syncedCount} records.`);
    return syncedCount;
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async searchPubMed(query: string, retmax: number): Promise<string[]> {
    const url = `${this.pubmedBase}/esearch.fcgi`;
    const params = {
      db: 'pubmed',
      term: query,
      retmax,
      retmode: 'json',
    };

    const response = await firstValueFrom(
      this.http.get<any>(url, { params, timeout: 10000 }),
    );
    return response.data?.esearchresult?.idlist ?? [];
  }

  private async fetchPubMedDetails(ids: string[]): Promise<PubMedArticle[]> {
    const url = `${this.pubmedBase}/esummary.fcgi`;
    const params = {
      db: 'pubmed',
      id: ids.join(','),
      retmode: 'json',
    };

    const response = await firstValueFrom(
      this.http.get<any>(url, { params, timeout: 10000 }),
    );

    const result = response.data?.result ?? {};
    return ids
      .map((id) => result[id])
      .filter(Boolean)
      .map((item: any) => ({
        uid: item.uid,
        title: item.title ?? '',
        authors: (item.authors ?? []).map((a: any) => ({ name: a.name })),
        fulljournalname: item.fulljournalname,
        sortdate: item.sortdate,
        doi: item.elocationid?.replace('doi: ', ''),
        pubdate: item.pubdate,
      }));
  }

  private async upsertPubMedRecord(article: PubMedArticle): Promise<void> {
    await this.prisma.longevityResearch.upsert({
      where: { externalId: `pubmed:${article.uid}` },
      create: {
        externalId: `pubmed:${article.uid}`,
        source: ResearchSource.PUBMED,
        title: article.title,
        authors: article.authors.map((a) => a.name),
        doi: article.doi || null,
        journal: article.fulljournalname || null,
        publishedAt: article.pubdate ? new Date(article.pubdate) : null,
        tags: this.extractTags(article.title),
        isOpenAccess: false,
      },
      update: {
        title: article.title,
        authors: article.authors.map((a) => a.name),
        journal: article.fulljournalname || null,
      },
    });
  }

  private async upsertBioRxivRecord(article: BioRxivArticle): Promise<void> {
    await this.prisma.longevityResearch.upsert({
      where: { externalId: `biorxiv:${article.doi}` },
      create: {
        externalId: `biorxiv:${article.doi}`,
        source: ResearchSource.BIORXIV,
        title: article.title,
        authors: article.authors.split('; ').map((a) => a.trim()),
        doi: article.doi,
        abstract: article.abstract,
        publishedAt: article.date ? new Date(article.date) : null,
        tags: this.extractTags(article.title + ' ' + (article.category ?? '')),
        isOpenAccess: true,
      },
      update: {
        abstract: article.abstract,
        title: article.title,
      },
    });
  }

  private async upsertMedRxivRecord(article: BioRxivArticle): Promise<void> {
    await this.prisma.longevityResearch.upsert({
      where: { externalId: `medrxiv:${article.doi}` },
      create: {
        externalId: `medrxiv:${article.doi}`,
        source: ResearchSource.MEDRXIV,
        title: article.title,
        authors: article.authors.split('; ').map((a) => a.trim()),
        doi: article.doi,
        abstract: article.abstract,
        publishedAt: article.date ? new Date(article.date) : null,
        tags: this.extractTags(article.title + ' ' + (article.category ?? '')),
        isOpenAccess: true,
      },
      update: {
        abstract: article.abstract,
        title: article.title,
      },
    });
  }

  private isLongevityRelated(text: string): boolean {
    const lower = text.toLowerCase();
    return LONGEVITY_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
  }

  private extractTags(text: string): string[] {
    const lower = text.toLowerCase();
    return LONGEVITY_KEYWORDS.filter((kw) => lower.includes(kw.toLowerCase()));
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
